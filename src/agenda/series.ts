import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { BLOQUEADO } from '../lib/cofre/cripto'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { addDays } from '../lib/dates'
import { humanError, supabase } from '../lib/supabase'
import { akeys, useItems, type AgendaItem, type ItemPatch } from './data'
import { queueGoogle } from './gsync'
import { fechasDe, HORIZONTE, MARGEN, type Freq, type Regla } from './repetir'

// Las series de la Agenda (eventos que se repiten). La regla vive en agenda_series; cada vez que toca es una
// actividad normal con serie_id, creada de antemano: al crear la serie, HORIZONTE días; después, al abrir la Agenda,
// se suman las que faltan (useExtenderSeries). Las crea el dispositivo porque el título va cifrado con su llave.

export type Serie = Tables<'agenda_series'>
export const reglaDe = (s: Serie): Regla => ({ freq: s.freq as Freq, cada: s.cada, dias: s.dias, hasta: s.hasta })

const skey = (uid: string | null) => ['agenda-series', uid] as const

export function useSeriesData() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: skey(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_series').select('*')
      if (error) throw error
      return (data ?? []) as Serie[]
    },
  })
}

/** Lo que cada vez de la serie copia de la actividad modelo (todo menos el día, el hecho y sus enlaces). */
function copia(m: AgendaItem, serieId: string, dia: string): TablesInsert<'agenda_items'> {
  return {
    title: m.title,
    notes: m.notes,
    color: m.color,
    icon: m.icon,
    day: dia,
    start_min: m.start_min,
    duration_min: m.duration_min,
    subtasks: m.subtasks.map((s) => ({ ...s, done: false })),
    calendar_id: m.calendar_id,
    group_id: m.group_id,
    priority: m.priority,
    visibility: m.visibility,
    serie_id: serieId,
  } as TablesInsert<'agenda_items'>
}

/** Suma filas a la lista sin repetir las que el tiempo real ya haya traído. */
function fusionar(old: AgendaItem[], nuevas: AgendaItem[]): AgendaItem[] {
  const ids = new Set(nuevas.map((x) => x.id))
  return [...old.filter((x) => !ids.has(x.id)), ...nuevas]
}

async function insertar(filas: TablesInsert<'agenda_items'>[]): Promise<AgendaItem[]> {
  const out: AgendaItem[] = []
  for (let i = 0; i < filas.length; i += 60) {
    const { data, error } = await supabase.from('agenda_items').insert(filas.slice(i, i + 60)).select('*')
    if (error) throw error
    out.push(...((data ?? []) as unknown as AgendaItem[]))
  }
  return out
}

export function useSeries() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const uid = userId ?? ''
  const lista = useSeriesData().data
  const porId = useMemo(() => new Map((lista ?? []).map((s) => [s.id, s])), [lista])

  const itemsNow = useCallback(() => qc.getQueryData<AgendaItem[]>(akeys.items(uid)) ?? [], [qc, uid])
  const ponItems = useCallback((fn: (old: AgendaItem[]) => AgendaItem[]) => qc.setQueryData<AgendaItem[]>(akeys.items(uid), (old) => (old ? fn(old) : old)), [qc, uid])
  const ponSeries = useCallback((fn: (old: Serie[]) => Serie[]) => qc.setQueryData<Serie[]>(skey(uid), (old) => fn(old ?? [])), [qc, uid])

  /** Convierte una actividad en la primera de una serie y crea las demás veces. Devuelve cuántas creó. */
  const repetir = useCallback(
    async (primera: AgendaItem, regla: Regla): Promise<number | null> => {
      if (!primera.day) return null
      const tope = addDays(primera.day, HORIZONTE)
      const generado = regla.hasta && regla.hasta < tope ? regla.hasta : tope
      const alta = await supabase
        .from('agenda_series')
        .insert({ freq: regla.freq, cada: regla.cada, dias: regla.dias, hasta: regla.hasta, inicio: primera.day, generado_hasta: generado })
        .select('*')
        .single()
      if (alta.error || !alta.data) {
        toastError(humanError(alta.error))
        return null
      }
      const serie = alta.data as Serie
      ponSeries((old) => [...old, serie])
      try {
        await supabase.from('agenda_items').update({ serie_id: serie.id }).eq('id', primera.id)
        ponItems((old) => old.map((x) => (x.id === primera.id ? { ...x, serie_id: serie.id } : x)))
        const nuevas = await insertar(fechasDe(regla, primera.day, addDays(primera.day, 1), generado).map((d) => copia(primera, serie.id, d)))
        ponItems((old) => fusionar(old, nuevas))
        queueGoogle(qc, uid, nuevas.map((x) => x.id))
        return nuevas.length
      } catch (e) {
        toastError(humanError(e))
        return null
      }
    },
    [qc, uid, ponItems, ponSeries],
  )

  /** Aplica el cambio a las veces siguientes de la serie (la de ese día se guarda aparte, con su propio día). */
  const cambiarSiguientes = useCallback(
    async (item: AgendaItem, patch: ItemPatch): Promise<void> => {
      if (!item.serie_id || !item.day) return
      const { day: _d, end_day: _e, done_at: _h, subtasks, ...resto } = patch
      const cambio = { ...resto, ...(subtasks ? { subtasks: subtasks.map((s) => ({ ...s, done: false })) } : {}) }
      const { data, error } = await supabase
        .from('agenda_items')
        .update(cambio as TablesUpdate<'agenda_items'>)
        .eq('serie_id', item.serie_id)
        .gt('day', item.day)
        .select('*')
      if (error) return void toastError(humanError(error))
      const filas = new Map(((data ?? []) as unknown as AgendaItem[]).map((x) => [x.id, x]))
      ponItems((old) => old.map((x) => filas.get(x.id) ?? x))
      queueGoogle(qc, uid, [...filas.keys()])
    },
    [qc, uid, ponItems],
  )

  /** Borra esa vez y todas las siguientes: la serie termina el día anterior. */
  const borrarDesde = useCallback(
    async (item: AgendaItem): Promise<void> => {
      const serie = item.serie_id ? porId.get(item.serie_id) : undefined
      if (!serie || !item.day) return
      const fuera = itemsNow().filter((x) => x.serie_id === serie.id && x.day != null && x.day >= item.day!)
      const ids = new Set(fuera.map((x) => x.id))
      ponItems((old) => old.filter((x) => !ids.has(x.id)))
      const { error } = await supabase.from('agenda_items').delete().eq('serie_id', serie.id).gte('day', item.day)
      if (error) {
        ponItems((old) => fusionar(old, fuera))
        return void toastError(humanError(error))
      }
      const fin = addDays(item.day, -1)
      await supabase.from('agenda_series').update({ hasta: fin, generado_hasta: fin }).eq('id', serie.id)
      ponSeries((old) => old.map((s) => (s.id === serie.id ? { ...s, hasta: fin, generado_hasta: fin } : s)))
      queueGoogle(qc, uid, [], fuera.map((x) => x.gcal_event_id))
      const deshacer = async () => {
        await supabase.from('agenda_series').update({ hasta: serie.hasta, generado_hasta: serie.generado_hasta }).eq('id', serie.id)
        ponSeries((old) => old.map((s) => (s.id === serie.id ? serie : s)))
        const filas = await insertar(fuera.map(({ created_at: _c, updated_at: _u, user_id: _uid, ...resto }) => resto as TablesInsert<'agenda_items'>)).catch(() => [])
        ponItems((old) => fusionar(old, filas))
        queueGoogle(qc, uid, filas.map((x) => x.id))
      }
      toast(fuera.length === 1 ? `Borraste «${item.title}»` : `Borraste «${item.title}» y las ${fuera.length - 1} siguientes`, { action: { label: 'Deshacer', onClick: () => void deshacer() } })
    },
    [qc, uid, porId, itemsNow, ponItems, ponSeries],
  )

  return { porId, repetir, cambiarSiguientes, borrarDesde }
}

/** Al abrir la Agenda: a las series sin fin (o con fin lejano) se les suman las veces que faltan hacia adelante. */
export function useExtenderSeries(hoy: string) {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const series = useSeriesData().data
  const items = useItems().data
  const vistas = useRef(new Set<string>())

  useEffect(() => {
    if (!userId || !series || !items) return
    const tope = addDays(hoy, HORIZONTE)
    for (const s of series) {
      const fin = s.hasta && s.hasta < tope ? s.hasta : tope
      if (s.generado_hasta >= fin || s.generado_hasta >= addDays(hoy, MARGEN)) continue
      const clave = `${s.id}:${s.generado_hasta}`
      if (vistas.current.has(clave)) continue
      vistas.current.add(clave)
      // el modelo es la última vez que existe; si ya no queda ninguna, o el Cofre está cerrado, no se inventa nada
      const modelo = items.filter((x) => x.serie_id === s.id && x.day).sort((a, b) => (a.day! < b.day! ? 1 : -1))[0]
      if (!modelo || modelo.title === BLOQUEADO) continue
      void (async () => {
        // quien logra mover la marca crea las filas: así dos pestañas (o dos aparatos) no las duplican
        const marca = await supabase.from('agenda_series').update({ generado_hasta: fin }).eq('id', s.id).eq('generado_hasta', s.generado_hasta).select('id')
        if (marca.error || !marca.data?.length) return
        qc.setQueryData<Serie[]>(skey(userId), (old) => (old ?? []).map((x) => (x.id === s.id ? { ...x, generado_hasta: fin } : x)))
        try {
          const nuevas = await insertar(fechasDe(reglaDe(s), s.inicio, addDays(s.generado_hasta, 1), fin).map((d) => copia(modelo, s.id, d)))
          qc.setQueryData<AgendaItem[]>(akeys.items(userId), (old) => (old ? fusionar(old, nuevas) : old))
          queueGoogle(qc, userId, nuevas.map((x) => x.id))
        } catch {
          // no se crearon: la marca vuelve atrás para intentarlo la próxima vez
          await supabase.from('agenda_series').update({ generado_hasta: s.generado_hasta }).eq('id', s.id)
        }
      })()
    }
  }, [userId, series, items, hoy, qc])
}

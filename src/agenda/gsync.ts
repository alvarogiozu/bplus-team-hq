import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Calendario «Rockie» de Google, de ida y vuelta, hecho en el dispositivo.
// Con el Cofre la agenda está cifrada y el servidor no la puede leer: aquí se arma lo que hay que subir
// (ya abierto) y aquí se aplica lo que llega de Google (se guarda cifrado). La función agenda-google
// solo habla con Google con tu permiso; no guarda nada de tu agenda.
// No importa nada de la agenda para no crear ciclos (data.ts usa queueGoogle).
type GStatus = { connected?: boolean; canWrite?: boolean }
type Fila = {
  id: string
  title: string
  notes: string
  day: string | null
  end_day: string | null
  start_min: number | null
  duration_min: number
  gcal_event_id: string | null
}
type Cambio = {
  tipo: 'borrado' | 'cambio' | 'nuevo'
  gid: string
  rid?: string
  title?: string
  notes?: string
  day?: string
  end_day?: string | null
  start_min?: number | null
  duration_min?: number | null
}

const COLS = 'id, title, notes, day, end_day, start_min, duration_min, gcal_event_id'
const pending = new Set<string>()
const gone = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined

export function googleCanWrite(qc: QueryClient, uid: string) {
  const st = qc.getQueryData<GStatus>(['agenda-gstatus', uid])
  return Boolean(st?.connected && st.canWrite)
}

async function google<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agenda-google', { body })
  if (error) throw error
  return data as T
}

/** Sube a Google estas actividades (ya abiertas aquí) y borra allá los eventos que sobran. */
async function subir(filas: Fila[], borrados: string[]) {
  for (let i = 0; i < Math.max(filas.length, borrados.length); i += 50) {
    const r = await google<{ creado?: boolean }>({ action: 'push', items: filas.slice(i, i + 50), deleted: borrados.slice(i, i + 50) })
    // el calendario «Rockie» se acaba de crear (o se volvió a crear): va todo lo reciente
    if (r?.creado) await subirTodo()
  }
}

/** Primera vez (o si borraron «Rockie» en Google): sube lo agendado del último mes en adelante. */
async function subirTodo() {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data } = await supabase.from('agenda_items').select(COLS).gte('day', desde).order('day').limit(200)
  const filas = (data ?? []) as Fila[]
  for (let i = 0; i < filas.length; i += 50) await google({ action: 'push', items: filas.slice(i, i + 50), deleted: [] })
}

/** Avisa que estos ítems cambiaron (ids) o que estos eventos de Google sobran (deleted). */
export function queueGoogle(qc: QueryClient, uid: string, ids: string[], deleted: (string | null | undefined)[] = []) {
  if (!uid || !googleCanWrite(qc, uid)) return
  for (const id of ids) pending.add(id)
  for (const g of deleted) if (g) gone.add(g)
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), 1200)
}

async function flush() {
  const ids = [...pending]
  const deleted = [...gone]
  pending.clear()
  gone.clear()
  if (!ids.length && !deleted.length) return
  try {
    const { data } = ids.length ? await supabase.from('agenda_items').select(COLS).in('id', ids) : { data: [] }
    await subir((data ?? []) as Fila[], deleted)
  } catch {
    // sin red: el próximo "sync" (al volver a la app) se pone al día
  }
}

/**
 * Trae lo que cambió en «Rockie» desde Google y lo aplica aquí (guardado cifrado).
 * Devuelve cuántas actividades cambiaron.
 */
export async function sincronizarGoogle(): Promise<number> {
  const r = await google<{ creado?: boolean; cambios?: Cambio[]; token?: string | null }>({ action: 'sync' })
  if (r?.creado) await subirTodo()
  let n = 0
  const sobran: string[] = []
  const enlazar: { gid: string; rid: string }[] = []
  for (const c of r?.cambios ?? []) {
    if (c.tipo === 'borrado' && c.rid) {
      // borrado en Google: si la actividad sigue enlazada a ESE evento, se borra aquí también
      const { data } = await supabase.from('agenda_items').delete().eq('id', c.rid).eq('gcal_event_id', c.gid).select('id')
      n += data?.length ?? 0
    } else if (c.tipo === 'cambio' && c.rid && c.day) {
      const { data: it } = await supabase.from('agenda_items').select(COLS).eq('id', c.rid).maybeSingle()
      const row = it as Fila | null
      if (!row) {
        sobran.push(c.gid) // la actividad ya no existe aquí: el evento sobra
        continue
      }
      if (row.gcal_event_id && row.gcal_event_id !== c.gid) continue
      const igual =
        row.title === c.title && row.day === c.day && row.start_min === (c.start_min ?? null) && (row.end_day ?? null) === (c.end_day ?? null) &&
        (c.start_min == null || row.duration_min === c.duration_min)
      if (igual && row.gcal_event_id === c.gid) continue
      await supabase
        .from('agenda_items')
        .update({
          title: c.title || '(Sin título)',
          day: c.day,
          start_min: c.start_min ?? null,
          end_day: c.end_day ?? null,
          ...(c.duration_min ? { duration_min: c.duration_min } : {}),
          gcal_event_id: c.gid,
        })
        .eq('id', row.id)
      if (!igual) n++
    } else if (c.tipo === 'nuevo' && c.day) {
      // creado en Google dentro de «Rockie»: entra a la agenda (en su primer calendario visible)
      const { data: cal } = await supabase.from('agenda_calendars').select('id, color').eq('hidden', false).order('position').limit(1).maybeSingle()
      const { data: nuevo } = await supabase
        .from('agenda_items')
        .insert({
          title: c.title || '(Sin título)',
          day: c.day,
          start_min: c.start_min ?? null,
          end_day: c.end_day ?? null,
          duration_min: c.duration_min ?? 60,
          icon: 'calendar',
          color: cal?.color ?? '#cf7358',
          calendar_id: cal?.id ?? null,
          notes: c.notes ?? '',
          subtasks: [],
          gcal_event_id: c.gid,
        })
        .select('id')
        .single()
      if (nuevo) {
        enlazar.push({ gid: c.gid, rid: nuevo.id })
        n++
      }
    }
  }
  if (enlazar.length) await google({ action: 'enlazar', pares: enlazar })
  if (sobran.length) await google({ action: 'push', items: [], deleted: sobran })
  // recién ahora Google puede olvidar estos cambios (si algo falló arriba, vuelven en la próxima vuelta)
  if (r?.token) await google({ action: 'sync_ok', token: r.token })
  return n
}

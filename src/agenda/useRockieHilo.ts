import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../components/Toasts'
import { haptic } from '../lib/fx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthProvider'
import { useCuadernoActions } from '../cuaderno/data'
import { processEntry } from '../cuaderno/agent'
import { APPS } from '../os/apps'
import { applyProposal, askRockie, buildContext, describe, makeLook, summarize, type Card, type Proposal } from './agent'
import { APP_META, useRockieChat, type ChatApp, type LifeArea } from '../features/agent/chat'
import { fmtRelative } from '../lib/dates'
import { useCalendarMap, type GEvent } from './calendars'
import { akeys, useAgendaActions, useHq, useItems, usePrefs, type HqData, type Undo } from './data'
import { useGroupActions, useGroups } from './groups'
import { useHobbies, useHobbyActions } from './hobbies'
import { useDayActions, useDayMap } from './days'
import { useReserveActions, useReserves } from './reserves'
import { localPropose } from './localAgent'
import { ATAJO_LABEL, limpiar, parecidos, type Atajo } from './atajos'

// El hilo con Rockie (su «cerebro» de conversación): lo que le pides va a la IA con tu día como contexto, y lo que
// propone llega como tarjetas que confirmas una a una (con deshacer). Lo usan la barra de Rockie de la Agenda y el
// chat del sistema (Inicio del escritorio): un solo Rockie, el mismo trato.
// Con `scope: 'os'` (el chat del sistema) Rockie además ANOTA en el Cuaderno, crea TAREAS del equipo y HÁBITOS, y
// cuando no está claro qué es lo que dices, pregunta «¿cómo lo guardo?» con opciones (aclarar).

// card = cómo se veía al proponer (si no, tras mover diría «15:00 → 15:00»)
export type PropState = {
  p: Proposal
  card: Card
  st: 'pending' | 'done' | 'skip'
  undo?: Undo | null
  /** al quedar hecha: qué dice (si no, «Hecho») y adónde lleva «Abrir» */
  listo?: string
  ir?: string
}
export type Tipo = 'agenda' | 'habito' | 'nota' | 'tarea'
export type RockieDice = {
  id: string
  who: 'rockie'
  say: string
  basic?: boolean
  error?: string
  props: PropState[]
  handoffs: { app: ChatApp; pedido: string; area?: LifeArea | null }[]
  question?: { question: string; options: string[] }
  answer?: { text: string; refs: string[] }
  /** no está claro qué es: Rockie pregunta y la persona elige (una sola vez) */
  aclarar?: { pedido: string; pregunta: string; opciones: Tipo[]; elegida?: Tipo }
}
export type HiloEntry = { id: string; who: 'user'; text: string; voice?: boolean } | RockieDice

const uid = () => Math.random().toString(36).slice(2, 10)
const APP_COLOR = Object.fromEntries(APPS.map((a) => [a.id, a.color])) as Record<string, string>
const TIPOS: Tipo[] = ['agenda', 'habito', 'nota', 'tarea']
/** Lo que se reenvía cuando eliges el tipo (la IA ya no pregunta: ver SYSTEM_OS). */
const PREFIJO: Record<Exclude<Tipo, 'nota'>, string> = { agenda: 'En la agenda:', habito: 'Como hábito:', tarea: 'Tarea del equipo:' }
const OS_TOOLS = new Set(['anotar', 'habito', 'crear_tarea_equipo'])

/** «anota que…», «apunta…», «idea: …» sin día ni hora: es una nota, sin pasar por la IA (al instante y sin cupo). */
const NOTA = /^\s*(?:an[oó]ta(?:me)?|apunta(?:me)?|anotar|apuntar|nota|idea)\b(?:\s+(?:que|esto|lo siguiente))?\s*[:,-]?\s*(.+)$/i
const CON_FECHA = /\b(hoy|mañana|manana|pasado|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|a las|semana|mes)\b|\d{1,2}[:h]\d{2}|\d{1,2}\s*(?:am|pm)\b/i

export function useRockieHilo(p: { today: string; nowMin: number; google?: GEvent[]; scope?: 'os'; abrir?: (path: string) => void; /** en qué app está la persona (si lo que dice es ambiguo, se prefiere esa) */ app?: string }) {
  const { profile, userId } = useAuth()
  const itemsData = useItems().data
  const items = useMemo(() => itemsData ?? [], [itemsData])
  const hq = useHq().data
  const prefs = usePrefs().data
  const agendaActions = useAgendaActions()
  const groupActions = useGroupActions()
  const hobbyActions = useHobbyActions()
  const dayActions = useDayActions()
  const dayMap = useDayMap()
  const reserveActions = useReserveActions()
  const reserves = useReserves().data
  const { createEntry, deleteEntry, patchEntry } = useCuadernoActions()
  const actions = useMemo(
    () => ({ ...agendaActions, groups: groupActions, hobbies: hobbyActions, days: dayActions, reserves: reserveActions }),
    [agendaActions, groupActions, hobbyActions, dayActions, reserveActions],
  )
  const tz = profile?.timezone ?? 'America/Lima'
  const { list: cals } = useCalendarMap()
  const groups = useGroups().data
  const hobbies = useHobbies().data
  const look = useMemo(
    () => makeLook({ today: p.today, tz, nowMin: p.nowMin, prefs, items, hq, cals, groups, hobbies, reserves }),
    [p.today, tz, p.nowMin, prefs, items, hq, cals, groups, hobbies, reserves],
  )

  const qc = useQueryClient()
  const [thread, setThread] = useState<HiloEntry[]>([])
  const [thinking, setThinking] = useState(false)
  const chat = useRockieChat('agenda')
  const threadRef = useRef(thread)
  threadRef.current = thread

  /** Lo último que dijo Rockie (para «sí» / «no» por voz). */
  const ultimo = () => [...threadRef.current].reverse().find((e) => e.who === 'rockie') as RockieDice | undefined

  // ---------- las tarjetas del chat del sistema (nota, hábito, tarea del equipo) ----------
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  function tarjeta(x: Proposal): Card {
    if (x.tool === 'anotar') return { icon: 'pencil', color: APP_COLOR.cuaderno, title: s(x.input.texto) ?? 'Nota', detail: 'Nota en tu Cuaderno de hoy' }
    if (x.tool === 'habito') {
      const hora = s(x.input.hora)
      return x.input.accion === 'hecho'
        ? { icon: 'check', color: APP_COLOR.habitos, title: s(x.input.nombre) ?? 'Hábito', detail: 'Marcarlo como hecho hoy en Hábitos' }
        : { icon: 'flame', color: APP_COLOR.habitos, title: s(x.input.nombre) ?? 'Hábito', detail: hora ? `Hábito nuevo · a las ${hora}` : 'Hábito nuevo en Hábitos' }
    }
    if (x.tool === 'crear_tarea_equipo') {
      const space = hq?.spaces.find((e) => e.id === x.input.space_id)?.name ?? 'tu equipo'
      const quien = x.input.assignee_id && x.input.assignee_id !== userId ? hq?.people.find((e) => e.id === x.input.assignee_id)?.name : 'para ti'
      const due = s(x.input.due)
      return { icon: 'task', color: APP_COLOR.equipo, title: s(x.input.title) ?? 'Tarea', detail: [space, quien, due ? fmtRelative(due, p.today) : null].filter(Boolean).join(' · '), team: true }
    }
    // el atajo «Hecho» trae el título (la agenda recién cargada puede no estar todavía en look)
    if (x.tool === 'completar_item' && s(x.input.title) && !look.items.get(String(x.input.item_id))) {
      return { icon: 'check', color: '#4a7c3f', title: `Completar «${s(x.input.title)}»`, detail: 'Marcar como hecho' }
    }
    if (x.tool === 'estado_tarea') {
      const title = s(x.input.title) ?? look.tasks.get(String(x.input.task_id))?.title ?? 'Tarea'
      const space = hq?.spaces.find((e) => e.id === x.input.space_id)?.name
      return x.input.status === 'done'
        ? { icon: 'check', color: APP_COLOR.equipo, title, detail: [space, 'Marcarla hecha (sin prueba)'].filter(Boolean).join(' · '), team: true }
        : { icon: 'flag', color: APP_COLOR.equipo, title, detail: [space, 'Pasarla a En curso'].filter(Boolean).join(' · '), team: true }
    }
    return describe(x, look)
  }

  /** Hace lo que propone una tarjeta. Devuelve cómo se deshace (o null si no se pudo) y qué mostrar al quedar hecha. */
  async function aplicar(x: Proposal): Promise<{ undo: Undo | null; listo?: string; ir?: string } | null> {
    if (x.tool === 'anotar') {
      const e = await createEntry(String(x.input.texto ?? '').trim(), 'texto')
      if (!e) return null
      // el Rockie del Cuaderno la ordena como siempre (la misma vuelta que al escribir en el Cuaderno)
      void processEntry(e, p.today, tz).then((r) => r.entry && patchEntry(r.entry))
      return { undo: () => deleteEntry(e), listo: 'Anotado', ir: '/cuaderno' }
    }
    if (x.tool === 'habito') {
      const nombre = String(x.input.nombre ?? '').trim()
      const hora = s(x.input.hora)
      // Hábitos es su propia app (y su propia cuenta): el pedido llega a su Rockie, que lo muestra para confirmar
      const pedido = x.input.accion === 'hecho' ? `ya hice ${nombre}` : `nuevo hábito ${nombre}${hora ? ` a las ${hora}` : ''}`
      const ir = `/habitos/hoy?rockie=${encodeURIComponent(pedido)}`
      p.abrir?.(ir)
      return { undo: null, listo: 'Abierto en Hábitos', ir }
    }
    if (x.tool === 'crear_tarea_equipo') {
      const space_id = String(x.input.space_id)
      const { data: arriba } = await supabase.from('tasks').select('position').eq('space_id', space_id).order('position', { ascending: true }).limit(1)
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          space_id,
          title: String(x.input.title ?? '').trim(),
          assignee_id: s(x.input.assignee_id) ?? userId,
          due_date: s(x.input.due),
          position: (arriba?.[0]?.position ?? 0) - 1,
        })
        .select('id')
        .single()
      if (error || !data) {
        toast(error?.message ?? 'No se pudo crear la tarea', { kind: 'err' })
        return null
      }
      return {
        undo: async () => {
          await supabase.from('tasks').delete().eq('id', data.id)
        },
        listo: 'Creada',
        ir: `/tareas?vista=lista&equipo=${space_id}&tarea=${data.id}`,
      }
    }
    if (x.tool === 'estado_tarea') {
      const id = String(x.input.task_id)
      const antes = (s(x.input.antes) ?? look.tasks.get(id)?.status ?? 'todo') as 'todo' | 'doing'
      const space = s(x.input.space_id) ?? look.tasks.get(id)?.space_id
      const refrescar = () => {
        for (const k of [['agenda-hq'], ['tasks'], ['os', 'tasks'], ['xp']]) void qc.invalidateQueries({ queryKey: k })
      }
      // Hecho = validar sin prueba (lo mismo que «Lo hice» en Proyectos: suma su XP); En curso = solo el estado
      const { error } =
        x.input.status === 'done'
          ? await supabase.rpc('validate_task', { p_task: id, p_mode: 'plain' })
          : await supabase.from('tasks').update({ status: 'doing' }).eq('id', id)
      refrescar()
      if (error) {
        toast(error.message, { kind: 'err' })
        return null
      }
      return {
        // deshacer «Hecho» la reabre (su XP se descuenta, como al reabrir en Proyectos)
        undo: async () => {
          await supabase.from('tasks').update({ status: antes }).eq('id', id)
          refrescar()
        },
        listo: x.input.status === 'done' ? 'Hecha' : 'En curso',
        ir: `/tareas?vista=lista${space ? `&equipo=${space}` : ''}&tarea=${id}`,
      }
    }
    const undo = await applyProposal(x, actions, look)
    if (undo && x.tool === 'completar_item') void qc.invalidateQueries({ queryKey: ['os', 'agenda'] })
    return undo ? { undo } : null
  }

  /** Los botones Hecho / En curso / Agendar de la caja: lo escrito se resuelve aquí, sin IA (al instante y sin
   *  cupo). Proponen la tarjeta de siempre (confirmar, deshacer); si no encuentran a qué te refieres, lo dicen. */
  async function atajo(a: Atajo, raw: string) {
    const t = raw.trim()
    if (!t || !profile) return
    setThread((x) => [...x, { id: uid(), who: 'user' as const, text: `${ATAJO_LABEL[a]}: ${t}` }].slice(-24))
    // recién abierto, tus tareas y tu agenda pueden no haber llegado: se esperan (si no, «no encontré» en falso)
    let hqA = hq
    let itemsA = items
    if (!hq || !itemsData) {
      await qc.refetchQueries({ queryKey: akeys.hq(userId) })
      await qc.refetchQueries({ queryKey: akeys.items(userId) })
      hqA = qc.getQueryData<HqData>(akeys.hq(userId)) ?? hq
      itemsA = qc.getQueryData<typeof items>(akeys.items(userId)) ?? items
    }
    const que = limpiar(t, a)
    let props: Proposal[] = []
    let say = ''
    if (a === 'agendar') {
      const people = (hqA?.people ?? []).map((x) => ({ id: x.id, name: x.name, username: x.username }))
      const x = localPropose(que, { today: p.today, defaultDuration: prefs?.default_duration ?? 15, people })
      // sin día ni hora, «Agendar» es para hoy (como pendiente del día), no el Inbox
      if (x) props = [{ ...x, input: { ...x.input, day: x.input.day ?? p.today } }]
      else say = 'No entendí qué agendar. Prueba con «estudiar mañana a las 4».'
    } else {
      const tareas = (hqA?.tasks ?? []).filter((x) => x.status !== 'done' && (a === 'hecho' || x.status !== 'doing'))
      // el tiempo reservado para una tarea no es otro pendiente: la que cuenta es la tarea
      const conTarea = new Set(tareas.map((x) => x.id))
      const pendientes = a === 'hecho' ? itemsA.filter((i) => !i.done_at && !i.is_reserve && !(i.hq_task_id && conTarea.has(i.hq_task_id))) : []
      const halladas = parecidos<{ tarea?: (typeof tareas)[number]; item?: (typeof items)[number] }>(
        que,
        [...tareas.map((tarea) => ({ tarea })), ...pendientes.map((item) => ({ item }))],
        (x) => x.tarea?.title ?? x.item?.title ?? '',
      )
      props = halladas.map((x) =>
        x.tarea
          ? { tool: 'estado_tarea', input: { task_id: x.tarea.id, status: a === 'hecho' ? 'done' : 'doing', title: x.tarea.title, space_id: x.tarea.space_id, antes: x.tarea.status } }
          : { tool: 'completar_item', input: { item_id: x.item!.id, title: x.item!.title } },
      )
      if (props.length > 1) say = 'Encontré varias parecidas. Confirma la que es:'
      else if (!props.length && a === 'hecho') {
        // no es una tarea ni un pendiente: quizá un hábito (Hábitos lo marca con su Rockie)
        say = `No encontré «${que}» entre tus tareas ni tu agenda. ¿Era un hábito?`
        props = [{ tool: 'habito', input: { accion: 'hecho', nombre: que } }]
      } else if (!props.length) say = `No encontré «${que}» entre tus tareas por hacer.`
    }
    agregar({ id: uid(), who: 'rockie', say, props: props.map((x) => ({ p: x, card: tarjeta(x), st: 'pending' as const })), handoffs: [] })
    void chat.append([
      { role: 'user', text: `${ATAJO_LABEL[a]}: ${t}` },
      { role: 'assistant', text: [say, ...props.map((x) => tarjeta(x).title)].filter(Boolean).join(' · ') || '…' },
    ])
  }

  /** Este hilo como historia para la IA (lo que se acaba de decir todavía no está en el ref: va como la orden). */
  function hiloComoHistoria() {
    return threadRef.current
      .slice(-6)
      .map((e) =>
        e.who === 'user'
          ? { role: 'user' as const, text: e.text }
          : { role: 'assistant' as const, text: [e.say, e.answer?.text, e.question?.question, e.aclarar?.pregunta, ...e.props.map((x) => x.card.title)].filter(Boolean).join(' · ') || '…' },
      )
  }

  function agregar(entry: RockieDice) {
    setThread((x) => [...x, entry].slice(-24))
  }

  async function send(raw: string, byVoice = false) {
    const t = raw.trim()
    if (!t || !profile) return
    setThread((x) => [...x, { id: uid(), who: 'user' as const, text: t, voice: byVoice }].slice(-24))
    // una nota evidente («anota que…» sin fecha) se resuelve aquí mismo
    const nota = p.scope === 'os' ? NOTA.exec(t) : null
    if (nota && !CON_FECHA.test(nota[1])) {
      const x: Proposal = { tool: 'anotar', input: { texto: nota[1].trim() } }
      agregar({ id: uid(), who: 'rockie', say: '', props: [{ p: x, card: tarjeta(x), st: 'pending' }], handoffs: [] })
      void chat.append([
        { role: 'user', text: t },
        { role: 'assistant', text: `Nota para el Cuaderno: ${nota[1].trim()}` },
      ])
      return
    }
    setThinking(true)
    const ctx = { ...buildContext({ today: p.today, nowMin: p.nowMin, tz, profile, prefs, items, hq, cals, google: p.google, groups, hobbies, days: dayMap }), ...(p.scope === 'os' && p.app ? { app_abierta: p.app } : {}) }
    const people = (hq?.people ?? []).map((x) => ({ id: x.id, name: x.name, username: x.username }))
    // el chat del sistema arranca cada conversación de cero: su contexto es SOLO este hilo (con el historial de todas
    // las apps la IA repetía lo de antes: «hice mis flexiones» volvía como «Meditar»)
    const historia = p.scope === 'os' ? hiloComoHistoria() : chat.history()
    const reply = await askRockie(t, historia, ctx, () => localPropose(t, { today: p.today, defaultDuration: prefs?.default_duration ?? 15, people }), p.scope)
    setThinking(false)
    const q = reply.proposals.find((x) => x.tool === 'preguntar')
    const a = reply.proposals.find((x) => x.tool === 'responder')
    const ac = reply.proposals.find((x) => x.tool === 'aclarar')
    const acts = reply.proposals.filter((x) => !['preguntar', 'responder', 'otra_app', 'aclarar'].includes(x.tool))
    const handoffs = reply.proposals
      .filter((x) => x.tool === 'otra_app' && x.input.app !== 'agenda')
      .map((x) => ({ app: x.input.app as ChatApp, pedido: String(x.input.pedido ?? t), area: (x.input.area as LifeArea | undefined) ?? null }))
    const opciones = ac ? ((ac.input.opciones as string[]) ?? []).filter((o): o is Tipo => TIPOS.includes(o as Tipo)) : []
    const entry: RockieDice = {
      id: uid(),
      who: 'rockie',
      say: reply.say,
      basic: reply.basic,
      error: reply.error,
      props: acts.map((x) => ({ p: x, card: tarjeta(x), st: 'pending' as const })),
      handoffs,
      question: q ? { question: String(q.input.question), options: (q.input.options as string[]) ?? [] } : undefined,
      answer: a ? { text: String(a.input.text), refs: (a.input.refs as string[]) ?? [] } : undefined,
      aclarar: ac && opciones.length >= 2 ? { pedido: String(ac.input.pedido ?? t), pregunta: String(ac.input.pregunta || '¿Cómo lo guardo?'), opciones } : undefined,
    }
    agregar(entry)
    const moved = handoffs.map((h) => `para ${APP_META[h.app].label}: ${h.pedido}`).join(' · ')
    const nuevas = acts.filter((x) => OS_TOOLS.has(x.tool)).map((x) => tarjeta(x).title)
    void chat.append([
      { role: 'user', text: t },
      {
        role: 'assistant',
        text:
          [summarize(reply.say || entry.answer?.text || entry.question?.question || entry.aclarar?.pregunta || '', acts.filter((x) => !OS_TOOLS.has(x.tool)), look), nuevas.join(' · '), moved]
            .filter(Boolean)
            .join(' · ') || '…',
      },
    ])
    if (acts.length) haptic(10)
  }

  /** Elegiste qué es (aclarar): una nota se guarda aquí mismo; lo demás vuelve a Rockie con el tipo dicho. */
  function elegir(entryId: string, tipo: Tipo) {
    const e = threadRef.current.find((x) => x.id === entryId) as RockieDice | undefined
    if (!e?.aclarar || e.aclarar.elegida) return
    setThread((x) => x.map((en) => (en.id === entryId && en.who === 'rockie' && en.aclarar ? { ...en, aclarar: { ...en.aclarar, elegida: tipo } } : en)))
    const pedido = e.aclarar.pedido
    if (tipo === 'nota') {
      const x: Proposal = { tool: 'anotar', input: { texto: pedido } }
      agregar({ id: uid(), who: 'rockie', say: '', props: [{ p: x, card: tarjeta(x), st: 'pending' }], handoffs: [] })
      return
    }
    void send(`${PREFIJO[tipo]} ${pedido}`)
  }

  const patchProp = (entryId: string, i: number, st: PropState) =>
    setThread((x) => x.map((e) => (e.id === entryId && e.who === 'rockie' ? { ...e, props: e.props.map((ps, j) => (j === i ? st : ps)) } : e)))

  /** Descarta lo que quedó pendiente en una respuesta («no» por voz). */
  const descartar = (entryId: string) =>
    setThread((x) => x.map((e) => (e.id === entryId && e.who === 'rockie' ? { ...e, props: e.props.map((ps) => (ps.st === 'pending' ? { ...ps, st: 'skip' as const } : ps)) } : e)))

  async function undoOne(entryId: string, i: number, undo: Undo) {
    await undo()
    setThread((x) => x.map((e) => (e.id === entryId && e.who === 'rockie' ? { ...e, props: e.props.map((ps, j) => (j === i ? { ...ps, st: 'skip' as const, undo: null } : ps)) } : e)))
  }

  async function confirm(e: RockieDice, i: number) {
    const ps = e.props[i]
    const r = await aplicar(ps.p)
    patchProp(e.id, i, { ...ps, st: r ? 'done' : 'skip', undo: r?.undo ?? null, listo: r?.listo, ir: r?.ir })
    haptic([8, 24, 8])
    if (r?.undo) {
      const undo = r.undo
      toast(`Listo: ${ps.card.title}`, { kind: 'ok', icon: 'check', action: { label: 'Deshacer', onClick: () => void undoOne(e.id, i, undo) } })
    }
  }

  async function confirmAll(e: RockieDice) {
    const undos: Undo[] = []
    for (let i = 0; i < e.props.length; i++) {
      if (e.props[i].st !== 'pending') continue
      const r = await aplicar(e.props[i].p)
      if (r?.undo) undos.push(r.undo)
      patchProp(e.id, i, { ...e.props[i], st: r ? 'done' : 'skip', undo: r?.undo ?? null, listo: r?.listo, ir: r?.ir })
    }
    haptic([8, 24, 8])
    toast(`Listo: ${undos.length} ${undos.length === 1 ? 'cambio' : 'cambios'}`, {
      kind: 'ok',
      icon: 'check',
      action: undos.length
        ? {
            label: 'Deshacer',
            onClick: async () => {
              for (const u of undos.reverse()) await u()
              setThread((x) => x.map((en) => (en.id === e.id && en.who === 'rockie' ? { ...en, props: en.props.map((ps) => ({ ...ps, st: 'skip' as const, undo: null })) } : en)))
            },
          }
        : undefined,
    })
  }

  const refTitle = (id: string) => look.items.get(id)?.title ?? look.events.get(id)?.title ?? look.tasks.get(id)?.title ?? look.projects.get(id)?.name

  return { look, thread, setThread, thinking, chat, send, atajo, elegir, ultimo, descartar, patchProp, confirm, confirmAll, refTitle }
}

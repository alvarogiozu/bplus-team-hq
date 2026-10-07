import { useMemo, useRef, useState } from 'react'
import { toast } from '../components/Toasts'
import { haptic } from '../lib/fx'
import { useAuth } from '../features/auth/AuthProvider'
import { applyProposal, askRockie, buildContext, describe, makeLook, summarize, type Card, type Proposal } from './agent'
import { APP_META, useRockieChat, type ChatApp, type LifeArea } from '../features/agent/chat'
import { useCalendarMap, type GEvent } from './calendars'
import { useAgendaActions, useHq, useItems, usePrefs, type Undo } from './data'
import { useGroupActions, useGroups } from './groups'
import { useHobbies, useHobbyActions } from './hobbies'
import { useDayActions, useDayMap } from './days'
import { useReserveActions, useReserves } from './reserves'
import { localPropose } from './localAgent'

// El hilo con Rockie (su «cerebro» de conversación): lo que le pides va a la IA con tu día como contexto, y lo que
// propone llega como tarjetas que confirmas una a una (con deshacer). Lo que es de otra app vuelve como un pase
// (`handoffs`). Lo usan la barra de Rockie de la Agenda y el Inicio del escritorio: un solo Rockie, el mismo trato.

// card = cómo se veía al proponer (si no, tras mover diría «15:00 → 15:00»)
export type PropState = { p: Proposal; card: Card; st: 'pending' | 'done' | 'skip'; undo?: Undo | null }
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
}
export type HiloEntry = { id: string; who: 'user'; text: string; voice?: boolean } | RockieDice

const uid = () => Math.random().toString(36).slice(2, 10)

export function useRockieHilo(p: { today: string; nowMin: number; google?: GEvent[] }) {
  const { profile } = useAuth()
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

  const [thread, setThread] = useState<HiloEntry[]>([])
  const [thinking, setThinking] = useState(false)
  const chat = useRockieChat('agenda')
  const threadRef = useRef(thread)
  threadRef.current = thread

  /** Lo último que dijo Rockie (para «sí» / «no» por voz). */
  const ultimo = () => [...threadRef.current].reverse().find((e) => e.who === 'rockie') as RockieDice | undefined

  async function send(raw: string, byVoice = false) {
    const t = raw.trim()
    if (!t || !profile) return
    setThinking(true)
    setThread((x) => [...x, { id: uid(), who: 'user' as const, text: t, voice: byVoice }].slice(-24))
    const ctx = buildContext({ today: p.today, nowMin: p.nowMin, tz, profile, prefs, items, hq, cals, google: p.google, groups, hobbies, days: dayMap })
    const people = (hq?.people ?? []).map((x) => ({ id: x.id, name: x.name, username: x.username }))
    const reply = await askRockie(t, chat.history(), ctx, () => localPropose(t, { today: p.today, defaultDuration: prefs?.default_duration ?? 15, people }))
    setThinking(false)
    const q = reply.proposals.find((x) => x.tool === 'preguntar')
    const a = reply.proposals.find((x) => x.tool === 'responder')
    const acts = reply.proposals.filter((x) => x.tool !== 'preguntar' && x.tool !== 'responder' && x.tool !== 'otra_app')
    const handoffs = reply.proposals
      .filter((x) => x.tool === 'otra_app' && x.input.app !== 'agenda')
      .map((x) => ({ app: x.input.app as ChatApp, pedido: String(x.input.pedido ?? t), area: (x.input.area as LifeArea | undefined) ?? null }))
    const entry: RockieDice = {
      id: uid(),
      who: 'rockie',
      say: reply.say,
      basic: reply.basic,
      error: reply.error,
      props: acts.map((x) => ({ p: x, card: describe(x, look), st: 'pending' as const })),
      handoffs,
      question: q ? { question: String(q.input.question), options: (q.input.options as string[]) ?? [] } : undefined,
      answer: a ? { text: String(a.input.text), refs: (a.input.refs as string[]) ?? [] } : undefined,
    }
    setThread((x) => [...x, entry].slice(-24))
    const moved = handoffs.map((h) => `para ${APP_META[h.app].label}: ${h.pedido}`).join(' · ')
    void chat.append([
      { role: 'user', text: t },
      { role: 'assistant', text: [summarize(reply.say || entry.answer?.text || entry.question?.question || '', acts, look), moved].filter(Boolean).join(' · ') || '…' },
    ])
    if (acts.length) haptic(10)
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
    const undo = await applyProposal(ps.p, actions, look)
    patchProp(e.id, i, { ...ps, st: undo ? 'done' : 'skip', undo })
    haptic([8, 24, 8])
    if (undo) toast(`Listo: ${describe(ps.p, look).title}`, { kind: 'ok', icon: 'check', action: { label: 'Deshacer', onClick: () => void undoOne(e.id, i, undo) } })
  }

  async function confirmAll(e: RockieDice) {
    const undos: Undo[] = []
    for (let i = 0; i < e.props.length; i++) {
      if (e.props[i].st !== 'pending') continue
      const undo = await applyProposal(e.props[i].p, actions, look)
      if (undo) undos.push(undo)
      patchProp(e.id, i, { ...e.props[i], st: undo ? 'done' : 'skip', undo })
    }
    haptic([8, 24, 8])
    toast(`Listo: ${undos.length} ${undos.length === 1 ? 'cambio' : 'cambios'}`, {
      kind: 'ok',
      icon: 'check',
      action: {
        label: 'Deshacer',
        onClick: async () => {
          for (const u of undos.reverse()) await u()
          setThread((x) => x.map((en) => (en.id === e.id && en.who === 'rockie' ? { ...en, props: en.props.map((ps) => ({ ...ps, st: 'skip' as const, undo: null })) } : en)))
        },
      },
    })
  }

  const refTitle = (id: string) => look.items.get(id)?.title ?? look.events.get(id)?.title ?? look.tasks.get(id)?.title ?? look.projects.get(id)?.name

  return { look, thread, setThread, thinking, chat, send, ultimo, descartar, patchProp, confirm, confirmAll, refTitle }
}

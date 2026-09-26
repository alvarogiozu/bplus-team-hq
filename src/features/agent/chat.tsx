import { useCallback, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useCuadernoActions } from '../../cuaderno/data'
import { toast, toastError } from '../../components/Toasts'
import { timeAgo } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

// Un solo chat con Rockie en la Agenda, el HQ y el Cuaderno: la conversación vive en
// rockie_turns (personal) y cada barra manda las últimas frases como contexto a la IA.
// Cuando lo que dices es de otra app, Rockie lo deriva con una tarjeta (otra_app).

export type ChatApp = 'agenda' | 'equipo' | 'cuaderno' | 'habitos'
export type ChatTurn = { id: string; app: ChatApp; role: 'user' | 'assistant'; text: string; created_at: string }
export type LifeArea = 'cuerpo' | 'mente' | 'alma' | 'trabajo'

export const APP_META: Record<ChatApp, { label: string; color: string }> = {
  agenda: { label: 'Agenda', color: '#9d5541' },
  equipo: { label: 'Equipo', color: '#216b87' },
  cuaderno: { label: 'Cuaderno', color: '#944d63' },
  habitos: { label: 'Hábitos', color: '#4a7c3f' },
}
export const AREA_LABEL: Record<LifeArea, string> = { cuerpo: 'Cuerpo', mente: 'Mente', alma: 'Alma', trabajo: 'Trabajo' }

export const chatKey = (uid: string | null | undefined) => ['rockie_turns', uid ?? ''] as const

export function useRockieChat(app: ChatApp) {
  const { userId } = useAuth()
  const qc = useQueryClient()
  const key = chatKey(userId)
  const q = useQuery({
    queryKey: key,
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('rockie_turns').select('id, app, role, text, created_at').order('created_at', { ascending: false }).limit(40)
      if (error) throw error
      return (data as ChatTurn[]).reverse()
    },
  })
  const turns = q.data ?? []

  /** Las últimas frases (de todas las apps) para darle contexto a la IA. */
  const history = useCallback(
    (n = 8) => (qc.getQueryData<ChatTurn[]>(key) ?? []).slice(-n).map((t) => ({ role: t.role, text: t.app === app ? t.text : `[${APP_META[t.app].label}] ${t.text}` })),
    [qc, key, app],
  )

  const append = useCallback(
    async (list: { role: 'user' | 'assistant'; text: string }[]) => {
      const rows = list.map((t) => ({ app, role: t.role, text: t.text.trim().slice(0, 2000) })).filter((t) => t.text)
      if (!rows.length || !userId) return
      const now = new Date().toISOString()
      qc.setQueryData<ChatTurn[]>(key, (old) => [...(old ?? []), ...rows.map((r, i) => ({ ...r, id: `tmp-${Date.now()}-${i}`, created_at: now }))].slice(-40))
      const { error } = await supabase.from('rockie_turns').insert(rows)
      if (error) console.warn('rockie_turns', error.message)
      void qc.invalidateQueries({ queryKey: key })
    },
    [qc, key, app, userId],
  )

  const clear = useCallback(async () => {
    qc.setQueryData<ChatTurn[]>(key, [])
    await supabase.from('rockie_turns').delete().eq('user_id', userId ?? '')
  }, [qc, key, userId])

  return { turns, history, append, clear }
}

/** Lo último que hablaste con Rockie en otras apps (para retomar donde quedó). */
export function RecentChat({ turns, current, max = 4 }: { turns: ChatTurn[]; current: ChatApp; max?: number }) {
  const last = turns.slice(-max)
  if (!last.length) return null
  return (
    <div className="rchat" aria-label="Conversación reciente con Rockie">
      <small className="rchat-t">Lo último que hablaron</small>
      {last.map((t) => (
        <div key={t.id} className={`rchat-row ${t.role}`}>
          {t.app !== current && (
            <span className="rchat-app" style={{ ['--ac' as string]: APP_META[t.app].color } as CSSProperties}>
              {APP_META[t.app].label}
            </span>
          )}
          <span className="rchat-txt">{t.text}</span>
          <small>{timeAgo(t.created_at)}</small>
        </div>
      ))}
    </div>
  )
}

/** Tarjeta "esto es de otra app": la lleva allá con el pedido (o lo anota directo en el Cuaderno). */
export function HandoffCard({ app, pedido, area }: { app: ChatApp; pedido: string; area?: LifeArea | null }) {
  const nav = useNavigate()
  const { createEntry } = useCuadernoActions()
  const [done, setDone] = useState(false)
  const meta = APP_META[app]

  async function go() {
    const enc = encodeURIComponent(pedido)
    if (app === 'agenda') return nav(`/agenda?rockie=${enc}`)
    if (app === 'equipo') return nav(`/tareas?vista=lista&rockie=${enc}`)
    if (app === 'cuaderno') {
      const e = await createEntry(pedido, 'texto')
      if (!e) return
      setDone(true)
      toast('Anotado en tu Cuaderno de hoy', { kind: 'ok', icon: 'check', action: { label: 'Abrir', onClick: () => nav('/cuaderno') } })
      return
    }
    // Hábitos vive en B+ (otra app): se copia el pedido y se abre
    try {
      await navigator.clipboard?.writeText(pedido)
    } catch (err) {
      toastError(humanError(err))
    }
    window.open('https://rockie.plus', '_blank', 'noopener,noreferrer')
    setDone(true)
    toast('Lo copié: pégalo en B+ al crear el hábito')
  }

  const label = app === 'agenda' ? 'Llevar a la Agenda' : app === 'equipo' ? 'Llevar a Tareas' : app === 'cuaderno' ? 'Anotar en el Cuaderno' : 'Abrir en B+ Hábitos'
  return (
    <motion.div className={`handoff${done ? ' done' : ''}`} style={{ ['--hc' as string]: meta.color } as CSSProperties} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} layout>
      <div className="handoff-chips">
        <span className="handoff-app">{meta.label}</span>
        {area && <span className="handoff-area">{AREA_LABEL[area]}</span>}
      </div>
      <p>{pedido}</p>
      <button type="button" className="btn sm" onClick={() => void go()} disabled={done}>
        {done ? 'Listo' : label}
      </button>
    </motion.div>
  )
}

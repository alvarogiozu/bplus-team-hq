import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toastError } from '../components/Toasts'
import { todayIn } from '../lib/dates'
import { haptic } from '../lib/fx'
import { localProposals, processEntry } from './agent'
import { useCuadernoActions, type Entry } from './data'

// Qué entradas del diario está leyendo Rockie ahora mismo (para el "pensando…").
let busy = new Set<string>()
const subs = new Set<() => void>()
const setBusy = (id: string, on: boolean) => {
  busy = new Set(busy)
  if (on) busy.add(id)
  else busy.delete(id)
  subs.forEach((f) => f())
}
export function useBusy() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => busy,
  )
}

// Entradas que se deshicieron mientras Rockie las leía: su respuesta ya no se aplica ni se avisa.
const forgotten = new Set<string>()
export const forgetEntry = (id: string) => void forgotten.add(id)

/** "Hoy" en la zona de la persona; cambia solo a medianoche. */
export function useToday(tz: string) {
  const [today, setToday] = useState(() => todayIn(tz))
  useEffect(() => {
    const id = setInterval(() => setToday(todayIn(tz)), 60_000)
    return () => clearInterval(id)
  }, [tz])
  return today
}

/** Capturar = guardar tal cual en el diario de hoy y pedirle a Rockie que proponga. */
export function useCapture() {
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const loc = useLocation()
  const tz = actions.tz

  const process = useCallback(
    async (e: Entry) => {
      setBusy(e.id, true)
      const r = await processEntry(e, todayIn(tz), tz)
      setBusy(e.id, false)
      if (forgotten.has(e.id)) return
      if (r.entry) {
        actions.patchEntry(r.entry)
        if (r.entry.proposals.length) haptic(10)
      } else if (r.basic) {
        await actions.saveEntryProposals(
          e,
          localProposals(e.text),
          'Modo básico (sin IA): te propongo guardarlo tal cual como nota.',
        )
      } else {
        toastError(r.error ?? 'Rockie no pudo leer esto. Quedó en tu diario.')
      }
    },
    [actions, tz],
  )

  /** stay = no llevar a Hoy (p. ej. al guardar una conversación desde una página). */
  const capture = useCallback(
    async (text: string, source: Entry['source'], opts: { stay?: boolean } = {}) => {
      const t = text.trim()
      if (!t) return null
      const e = await actions.createEntry(t, source)
      if (!e) return null
      haptic([6, 18, 6])
      const onToday =
        loc.pathname.replace(/\/$/, '') === '/cuaderno' && !new URLSearchParams(loc.search).get('dia')
      if (!onToday && !opts.stay) nav('/cuaderno')
      void process(e)
      return e
    },
    [actions, loc, nav, process],
  )

  return { capture, process }
}

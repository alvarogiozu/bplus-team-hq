import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Cola de cambios para el calendario «Rockie» de Google: se juntan 1,2 s y se suben de una
// (crear, mover, borrar). Solo si la persona conectó Google con permiso de escribir.
// No importa nada de la agenda para no crear ciclos (data.ts la usa).
type GStatus = { connected?: boolean; canWrite?: boolean }

const pending = new Set<string>()
const gone = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined

export function googleCanWrite(qc: QueryClient, uid: string) {
  const st = qc.getQueryData<GStatus>(['agenda-gstatus', uid])
  return Boolean(st?.connected && st.canWrite)
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
    await supabase.functions.invoke('agenda-google', { body: { action: 'push', ids, deleted } })
  } catch {
    // sin red: el próximo "sync" (al volver a la app) se pone al día
  }
}

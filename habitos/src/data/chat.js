import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { MOCK_CHATS } from './mock/chat.js'

// ============================================================================
// Capa de datos del chat por canal (grupo O reto). El estado del chat vive
// AQUI, por pantalla, y no en el store global: meter cada mensaje en useStore
// re-renderizaria toda la app (el store ya es el cuello de perf conocido).
//
// Modos, igual que el store:
//  - live: tabla `messages` + Realtime (postgres_changes respeta RLS: solo
//    recibes canales donde eres miembro). kind 'event' = lo inserta el
//    servidor al validar un habito (validate-habit, migracion 0004).
//  - mock: hilos de mock/chat.js persistentes en memoria (enviar SI agrega).
// ============================================================================

// Un canal es de verdad solo si su id es un uuid (los mock usan 'g1', 'r2'...)
export const esUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Color de avatar estable por usuario (tokens de la paleta; gente real no trae color)
const PEER_COLORS = ['var(--olive)', 'var(--teal-soft)', 'var(--green)', 'var(--pink)', 'var(--berry)', 'var(--azure)']
export function colorForUser(id) {
  let h = 0
  const s = String(id || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PEER_COLORS[h % PEER_COLORS.length]
}

const horaCorta = (iso) => {
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Hilos mock persistentes en memoria (recargar la pagina los resetea, como
// el resto del mock social). Clave: 'group:g1' | 'reto:r1'.
const mockThreads = new Map()
function mockThread(key) {
  if (!mockThreads.has(key)) mockThreads.set(key, [...(MOCK_CHATS[key] || [])])
  return mockThreads.get(key)
}

// Fila de `messages` (+ perfil resuelto) -> forma de mensaje del contrato
function rowToMsg(row, prof, myId) {
  return {
    id: row.id,
    kind: row.kind,
    mine: row.user_id === myId,
    authorId: row.user_id,
    author: prof?.name || 'Alguien',
    avatar: prof?.avatar || '😊',
    color: colorForUser(row.user_id),
    body: row.body,
    payload: row.payload || {},
    time: horaCorta(row.created_at),
  }
}

/**
 * Chat de un canal. `channel` = { groupId } | { challengeId } (ids reales
 * uuid => live; ids mock => hilo local). `me` = { id, name, avatar } del store.
 * Solo carga/escucha mientras `open` sea true.
 */
export function useChat({ channel, me, open }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const profilesRef = useRef(new Map())   // user_id -> { name, avatar } (cache de autores)
  const canalRef = useRef(null)

  const groupId = channel?.groupId || null
  const challengeId = channel?.challengeId || null
  const chanId = groupId || challengeId
  const live = !!supabase && esUuid(chanId)
  const key = `${groupId ? 'group' : 'reto'}:${chanId}`

  // ---- Carga inicial + suscripcion realtime (solo live y abierto) ----
  useEffect(() => {
    if (!open || !chanId) return undefined
    if (!live) {
      setMessages([...mockThread(key)])
      return undefined
    }
    let cancelado = false
    setMessages([])   // canal nuevo: no ensenar los mensajes del anterior
    setLoading(true)

    const col = groupId ? 'group_id' : 'challenge_id'

    async function cargar() {
      const { data, error } = await supabase
        .from('messages')
        .select('id, kind, body, payload, created_at, user_id, profiles(name, avatar)')
        .eq(col, chanId)
        .order('created_at', { ascending: false })
        .limit(80)
      if (cancelado) return
      setLoading(false)
      if (error) {
        console.warn('[bplus] No se cargo el chat:', error.message)
        return
      }
      const rows = (data ?? []).reverse()
      for (const r of rows) if (r.profiles) profilesRef.current.set(r.user_id, r.profiles)
      setMessages(rows.map(r => rowToMsg(r, r.profiles, me?.id)))
    }
    cargar()

    // Realtime: INSERTs del canal (RLS filtra lo que no te toca)
    const canal = supabase
      .channel(`chat-${key}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `${col}=eq.${chanId}`,
      }, async (payload) => {
        const row = payload.new
        // El autor puede no estar en cache (miembro nuevo): se resuelve al vuelo
        let prof = row.user_id === me?.id
          ? { name: me?.name || 'Tu', avatar: me?.avatar || '😊' }
          : profilesRef.current.get(row.user_id)
        if (!prof) {
          const { data } = await supabase.from('profiles').select('name, avatar').eq('id', row.user_id).maybeSingle()
          prof = data || null
          if (prof) profilesRef.current.set(row.user_id, prof)
        }
        setMessages(prev => (prev.some(m => m.id === row.id)
          ? prev
          : [...prev, rowToMsg(row, prof, me?.id)]))
      })
      .subscribe()
    canalRef.current = canal

    return () => {
      cancelado = true
      if (canalRef.current) {
        supabase.removeChannel(canalRef.current)
        canalRef.current = null
      }
    }
  }, [open, live, key, chanId, groupId, me?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Enviar un mensaje de texto ----
  const send = useCallback(async (text) => {
    const body = String(text || '').trim()
    if (!body || !chanId) return false

    if (!live) {
      const msg = {
        id: `local-${Date.now()}`, kind: 'text', mine: true,
        author: me?.name || 'Tu', avatar: me?.avatar || '😊', color: 'var(--amber)',
        body, payload: {}, time: horaCorta(new Date().toISOString()),
      }
      mockThread(key).push(msg)
      setMessages(prev => [...prev, msg])
      return true
    }

    // Optimista: aparece ya; el insert devuelve la fila real y reemplaza el temp.
    // El eco de realtime se deduplica por id.
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: tempId, kind: 'text', mine: true,
      author: me?.name || 'Tu', avatar: me?.avatar || '😊', color: 'var(--amber)',
      body, payload: {}, time: horaCorta(new Date().toISOString()),
    }])
    const { data, error } = await supabase
      .from('messages')
      .insert({
        group_id: groupId, challenge_id: challengeId,
        user_id: me?.id, kind: 'text', body,
      })
      .select('id, kind, body, payload, created_at, user_id')
      .single()
    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      console.warn('[bplus] No se envio el mensaje:', error.message)
      return false
    }
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev.filter(m => m.id !== tempId)
      return prev.map(m => (m.id === tempId ? { ...m, id: data.id, time: horaCorta(data.created_at) } : m))
    })
    return true
  }, [live, key, chanId, groupId, challengeId, me?.id, me?.name, me?.avatar])

  return { messages, send, loading, live }
}

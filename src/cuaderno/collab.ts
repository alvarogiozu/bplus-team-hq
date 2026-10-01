import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { cofre, supabase } from '../lib/supabase'
import { cifrarValor, descifrarValor, esCifrado, kidDe } from '../lib/cofre/cripto'

// Edición a la vez de una nota compartida (como Google Docs), sin servidor propio:
// - el texto vivo es un documento Yjs (CRDT: los cambios de todos se juntan sin pisarse);
// - los cambios viajan al instante por un canal privado de Supabase Realtime ("nota:<id>");
// - cada quien guarda SOLO sus propios cambios en cuaderno_note_updates (lista que se compacta);
// - al abrir: se aplican los cambios guardados y se pide a quien ya está conectado lo que falte.
// Si el documento vivo no existe todavía (recién compartida o rehecha desde el Markdown), UNO solo
// lo arma (claim_note_ydoc) y los demás esperan a recibirlo: así el texto nunca sale duplicado.
// Con el Cofre, todo lo que viaja por el canal y lo que se guarda va cifrado con la llave de la página:
// Supabase solo ve que hay cambios, no qué dicen.

export type CollabUser = { id: string; name: string; color: string }
export type Peer = CollabUser & { clientId: number }
export type CollabStatus = 'loading' | 'waiting' | 'ready' | 'gone' | 'error'

const SEND_MS = 40
const SAVE_MS = 450
const AWARE_MS = 120
const COMPACT_AT = 60

export function toB64(u: Uint8Array) {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromB64(s: string) {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

type Msg = { e: number; d?: string; sv?: string; to?: number; from?: number; t?: string }

export class NoteSync {
  readonly doc = new Y.Doc()
  readonly awareness: Awareness
  status: CollabStatus = 'loading'
  /** este cliente debe armar el documento desde el Markdown (ganó el turno) */
  onInit: (() => void) | null = null
  onStatus: ((s: CollabStatus) => void) | null = null
  onPeers: ((p: Peer[]) => void) | null = null
  /** alguien tiene una versión más nueva del documento (se rehízo desde el Markdown) */
  onStale: (() => void) | null = null
  /** otra persona le cambió el título */
  onTitle: ((t: string) => void) | null = null

  private ch: RealtimeChannel | null = null
  private live = false
  private outbox: Uint8Array[] = []
  private unsaved: Uint8Array[] = []
  private sendT: ReturnType<typeof setTimeout> | undefined
  private saveT: ReturnType<typeof setTimeout> | undefined
  private awareT: ReturnType<typeof setTimeout> | undefined
  private waitT: ReturnType<typeof setTimeout>[] = []
  private saving = false
  private rows = 0
  private dead = false
  private readonly token = crypto.randomUUID()

  constructor(
    readonly noteId: string,
    readonly epoch: number,
    user: CollabUser,
  ) {
    this.awareness = new Awareness(this.doc)
    this.awareness.setLocalStateField('user', user)
    this.doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwareUpdate)
    this.awareness.on('change', this.emitPeers)
  }

  // ---------- arranque ----------
  async start(hasBody: boolean) {
    const loaded = await this.loadRows()
    if (this.dead || loaded === null) return
    this.connect()
    if (loaded > 0 || !hasBody) this.setStatus('ready')
    else void this.claim()
  }

  /** aplica lo guardado; devuelve cuántos cambios había (null = sin acceso) */
  private async loadRows(): Promise<number | null> {
    const { data, error } = await supabase
      .from('cuaderno_note_updates')
      .select('id, data')
      .eq('note_id', this.noteId)
      .order('id')
    if (this.dead) return null
    if (error) {
      this.setStatus('error')
      return null
    }
    const rows = data ?? []
    this.rows = rows.length
    if (rows.length) Y.applyUpdate(this.doc, Y.mergeUpdates(rows.map((r) => fromB64(r.data))), 'db')
    if (rows.length >= COMPACT_AT) void this.compact(rows[rows.length - 1].id)
    return rows.length
  }

  private async claim(attempt = 0) {
    if (this.dead) return
    const { data: won, error } = await supabase.rpc('claim_note_ydoc', {
      nid: this.noteId,
      p_epoch: this.epoch,
      p_token: this.token,
    })
    if (this.dead) return
    if (error) return this.setStatus('error')
    if (won) {
      // armar el documento desde el Markdown (lo hace el editor) y guardarlo ya
      this.onInit?.()
      this.setStatus('ready')
      void this.flushSave()
      return
    }
    // otro lo está armando: llega por el canal; por si acaso, se vuelve a leer lo guardado
    this.setStatus('waiting')
    for (const ms of [1200, 3000, 6000, 10000]) {
      this.waitT.push(
        setTimeout(async () => {
          if (this.dead || this.status !== 'waiting') return
          const n = await this.loadRows()
          if (n) this.setStatus('ready')
        }, ms),
      )
    }
    this.waitT.push(
      setTimeout(() => {
        if (this.dead || this.status !== 'waiting') return
        // el turno vence a los 15 s: se intenta otra vez; si tampoco, la versión que tenemos es vieja
        if (attempt < 1) void this.claim(attempt + 1)
        else this.onStale?.()
      }, 16000),
    )
  }

  private setStatus(s: CollabStatus) {
    if (this.status === s) return
    this.status = s
    this.onStatus?.(s)
  }

  // ---------- canal en vivo ----------
  private connect() {
    const ch = supabase.channel(`nota:${this.noteId}`, {
      config: { private: true, broadcast: { self: false, ack: false } },
    })
    // cada mensaje llega cifrado: se abre y recién ahí se aplica
    const al = (fn: (m: Msg) => void) => ({ payload }: { payload: unknown }) => void this.abrir(payload as Msg).then((m) => m && fn(m))
    ch.on('broadcast', { event: 'u' }, al((m) => this.onRemote(m)))
      .on('broadcast', { event: 'sync1' }, al((m) => this.onSync1(m)))
      .on('broadcast', { event: 'sync2' }, al((m) => {
        if (m.to === this.doc.clientID) this.onRemote(m)
      }))
      .on('broadcast', { event: 'title' }, al((m) => {
        if (m.e === this.epoch && typeof m.t === 'string') this.onTitle?.(m.t)
      }))
      .on('broadcast', { event: 'aw' }, al((m) => {
        if (m.e === this.epoch && m.d) applyAwarenessUpdate(this.awareness, fromB64(m.d), 'remote')
      }))
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          this.live = true
          // pedir lo que me falte y avisar que llegué
          this.send('sync1', {
            e: this.epoch,
            sv: toB64(Y.encodeStateVector(this.doc)),
            from: this.doc.clientID,
          })
          this.sendAwareness([this.doc.clientID])
          this.flushSend()
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
          this.live = false
        } else if (st === 'CLOSED') {
          this.live = false
        }
      })
    this.ch = ch
  }

  /** avisa a los demás el título nuevo (lo guarda quien lo escribe) */
  sendTitle(t: string) {
    this.send('title', { e: this.epoch, t })
  }

  private send(event: string, payload: Msg) {
    if (!this.ch || !this.live) return false
    // sin la llave de la página no sale nada (nunca en claro)
    void this.sellar(payload).then((p) => p && this.ch?.send({ type: 'broadcast', event, payload: p }))
    return true
  }

  private async sellar(m: Msg): Promise<Msg | null> {
    const k = await cofre.llaveParaEscribir({ tipo: 'nota', id: this.noteId })
    if (!k) return null
    const out: Msg = { ...m }
    for (const c of ['d', 'sv', 't'] as const) if (typeof m[c] === 'string') out[c] = await cifrarValor(k.llave, k.kid, m[c])
    return out
  }

  private async abrir(m: Msg): Promise<Msg | null> {
    if (this.dead || !m) return null
    const out: Msg = { ...m }
    for (const c of ['d', 'sv', 't'] as const) {
      const v = m[c]
      if (!esCifrado(v)) continue
      const k = await cofre.llavePorKid(kidDe(v)!)
      if (!k) return null
      try {
        out[c] = (await descifrarValor(k, v)) as string
      } catch {
        return null
      }
    }
    return out
  }

  private checkEpoch(e: number) {
    if (e > this.epoch) {
      this.onStale?.()
      return false
    }
    return e === this.epoch
  }

  private onRemote(m: Msg) {
    if (this.dead || !m.d || !this.checkEpoch(m.e)) return
    Y.applyUpdate(this.doc, fromB64(m.d), 'remote')
    if (this.status === 'waiting' && this.doc.getXmlFragment('default').length > 0) this.setStatus('ready')
  }

  private onSync1(m: Msg) {
    if (this.dead || !this.checkEpoch(m.e) || !m.sv || m.from == null) return
    const diff = Y.encodeStateAsUpdate(this.doc, fromB64(m.sv))
    this.send('sync2', { e: this.epoch, d: toB64(diff), to: m.from })
    this.sendAwareness([this.doc.clientID])
  }

  // ---------- cambios locales ----------
  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || origin === 'db' || this.dead) return
    this.outbox.push(update)
    this.unsaved.push(update)
    clearTimeout(this.sendT)
    this.sendT = setTimeout(() => this.flushSend(), SEND_MS)
    clearTimeout(this.saveT)
    this.saveT = setTimeout(() => void this.flushSave(), SAVE_MS)
  }

  private flushSend() {
    if (!this.outbox.length || !this.live) return
    const merged = this.outbox.length === 1 ? this.outbox[0] : Y.mergeUpdates(this.outbox)
    if (this.send('u', { e: this.epoch, d: toB64(merged) })) this.outbox = []
  }

  /** guarda mis cambios pendientes (se reintenta solo si falla) */
  async flushSave() {
    clearTimeout(this.saveT)
    if (this.saving || !this.unsaved.length || this.status === 'gone') return
    this.saving = true
    const batch = this.unsaved
    this.unsaved = []
    const merged = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch)
    const { error } = await supabase
      .from('cuaderno_note_updates')
      .insert({ note_id: this.noteId, data: toB64(merged) })
    this.saving = false
    if (error) {
      // sin permiso = dejaron de compartirla; si no, se reintenta en un rato
      if (error.code === '42501') return this.setStatus('gone')
      this.unsaved = [merged, ...this.unsaved]
      if (!this.dead) this.saveT = setTimeout(() => void this.flushSave(), 4000)
      return
    }
    this.rows++
    if (this.unsaved.length) this.saveT = setTimeout(() => void this.flushSave(), SAVE_MS)
  }

  private async compact(upto: number) {
    const snapshot = toB64(Y.encodeStateAsUpdate(this.doc))
    const { error } = await supabase.rpc('compact_note_updates', {
      nid: this.noteId,
      p_snapshot: snapshot,
      p_upto: upto,
    })
    if (!error) this.rows = 1
  }

  // ---------- presencia (cursores con nombre) ----------
  private onAwareUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === 'remote') return
    const changed = [...added, ...updated, ...removed]
    if (!changed.length) return
    clearTimeout(this.awareT)
    this.awareT = setTimeout(() => this.sendAwareness(changed), AWARE_MS)
  }

  private sendAwareness(clients: number[]) {
    if (!this.live) return
    this.send('aw', { e: this.epoch, d: toB64(encodeAwarenessUpdate(this.awareness, clients)) })
  }

  private emitPeers = () => {
    const seen = new Map<string, Peer>()
    this.awareness.getStates().forEach((st, clientId) => {
      const u = (st as { user?: CollabUser }).user
      if (!u?.id || clientId === this.doc.clientID) return
      if (!seen.has(u.id)) seen.set(u.id, { ...u, clientId })
    })
    this.onPeers?.([...seen.values()])
  }

  // ---------- cierre ----------
  destroy() {
    if (this.dead) return
    // lo último que escribí se guarda antes de irme
    void this.flushSave()
    this.flushSend()
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local')
    clearTimeout(this.awareT)
    this.sendAwareness([this.doc.clientID])
    this.dead = true
    clearTimeout(this.sendT)
    for (const t of this.waitT) clearTimeout(t)
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwareUpdate)
    this.awareness.off('change', this.emitPeers)
    this.awareness.destroy()
    const ch = this.ch
    this.ch = null
    // se cierra un poco después: deja salir el último cambio y el "me fui"
    if (ch) setTimeout(() => void supabase.removeChannel(ch), 300)
  }
}

/**
 * Una sesión de edición compartida para la nota. Se rehace si cambia la nota o su versión.
 * `hasBody` = la nota ya tiene texto (si el documento vivo no existe, alguien lo arma desde ahí).
 */
export function useNoteSync(noteId: string | null, epoch: number, user: CollabUser | null, hasBody: boolean) {
  const [sync, setSync] = useState<NoteSync | null>(null)
  const [status, setStatus] = useState<CollabStatus>('loading')
  const [peers, setPeers] = useState<Peer[]>([])
  const [initNeeded, setInitNeeded] = useState(0)
  const [stale, setStale] = useState(false)
  const [round, setRound] = useState(0)
  const [remoteTitle, setRemoteTitle] = useState<string | null>(null)
  const userKey = user ? `${user.id}|${user.name}|${user.color}` : ''
  const userRef = useRef(user)
  userRef.current = user
  const hasBodyRef = useRef(hasBody)
  hasBodyRef.current = hasBody

  useEffect(() => {
    if (!noteId || !userRef.current) return
    const s = new NoteSync(noteId, epoch, userRef.current)
    s.onStatus = setStatus
    s.onPeers = setPeers
    s.onInit = () => setInitNeeded((n) => n + 1)
    s.onStale = () => setStale(true)
    s.onTitle = setRemoteTitle
    setSync(s)
    setStatus('loading')
    setPeers([])
    setStale(false)
    void s.start(hasBodyRef.current)
    // al ocultar la pestaña (o cerrarla) se guarda lo pendiente
    const hide = () => {
      if (document.visibilityState === 'hidden') void s.flushSave()
    }
    const leave = () => void s.flushSave()
    document.addEventListener('visibilitychange', hide)
    addEventListener('pagehide', leave)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      removeEventListener('pagehide', leave)
      s.destroy()
    }
  }, [noteId, epoch, userKey, round])

  return { sync, status, peers, initNeeded, stale, remoteTitle, restart: () => setRound((r) => r + 1) }
}

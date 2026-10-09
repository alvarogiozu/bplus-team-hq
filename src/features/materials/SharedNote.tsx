import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EditorContent } from '@tiptap/react'
import { Icon } from '../../components/Icon'
import { toast, toastError } from '../../components/Toasts'
import { humanError, supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/dates'
import { useMe } from '../auth/AuthProvider'
import { useNoteSync } from '../../cuaderno/collab'
import { LiveWait, PeerStack } from '../../cuaderno/Compartir'
import { SelectionMenu, Toolbar, useNoteEditor } from '../../cuaderno/Editor'
import { SavedTag } from '../../cuaderno/PageHeader'
import '../../cuaderno/cuaderno.css'

// Una nota del Cuaderno compartida con el equipo, abierta desde Materiales: todos escriben a la vez
// (cursores con nombre y color), como en Google Docs. Es la misma nota que su dueño tiene en su Cuaderno.

type SharedRow = {
  id: string
  title: string
  body: string
  user_id: string
  owner_name: string
  space_id: string | null
  ydoc_epoch: number
  updated_at: string
}

export function useSharedNote(noteId: string | null) {
  return useQuery({
    queryKey: ['shared-note', noteId],
    enabled: Boolean(noteId),
    queryFn: async (): Promise<SharedRow | null> => {
      const { data, error } = await supabase.rpc('shared_note', { nid: noteId! })
      if (error) throw error
      return ((data ?? []) as SharedRow[])[0] ?? null
    },
  })
}

export function SharedNoteView({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const q = useSharedNote(noteId)
  // Esc cierra (como las demás hojas), salvo que haya otra cosa abierta encima (un menú o una hoja).
  // Ella misma es un role="dialog": no cuenta (antes se encontraba a sí misma y Esc nunca la cerraba)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const encima = document.querySelector('.cu-bubble') || Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => !el.closest('.mnote'))
      if (!encima) onClose()
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [onClose])
  return (
    <motion.div
      className="mnote"
      role="dialog"
      aria-modal="true"
      aria-label="Nota compartida"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      {q.isLoading ? (
        <div className="mnote-empty" aria-busy="true">
          <LiveWait status="loading" />
        </div>
      ) : !q.data || !q.data.space_id ? (
        <div className="mnote-empty">
          <Icon name="notebook" />
          <h3>Esta nota ya no está compartida</h3>
          <p className="hint">Quien la escribió dejó de compartirla (sigue en su Cuaderno).</p>
          <button className="btn sm" onClick={onClose}>
            Volver a Materiales
          </button>
        </div>
      ) : (
        <SharedEditor key={`${q.data.id}:${q.data.ydoc_epoch}`} row={q.data} onClose={onClose} />
      )}
    </motion.div>
  )
}

function SharedEditor({ row, onClose }: { row: SharedRow; onClose: () => void }) {
  const { userId, profile } = useMe()
  const qc = useQueryClient()
  const me = useMemo(
    () => ({ id: userId, name: profile.display_name, color: profile.color }),
    [userId, profile.display_name, profile.color],
  )
  const live = useNoteSync(row.id, row.ydoc_epoch, me, Boolean(row.body.trim()))
  const [title, setTitle] = useState(row.title)
  const [saved, setSaved] = useState<'ok' | 'saving'>('ok')
  const pending = useRef<{ title?: string; body?: string }>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const mine = row.user_id === userId
  const [sure, setSure] = useState(false)

  // quitarla de Materiales = deja de estar compartida (sigue intacta en el Cuaderno de su dueño)
  async function removeFromMaterials() {
    await flush.current()
    const { error } = await supabase.from('materials').delete().eq('note_id', row.id)
    if (error) {
      toastError(humanError(error))
      return
    }
    toast(
      mine
        ? 'Ya no está en Materiales: sigue en tu Cuaderno'
        : `Ya no está en Materiales: sigue en el Cuaderno de ${row.owner_name}`,
    )
    onClose()
  }

  const flush = useRef(async () => {})
  flush.current = async () => {
    clearTimeout(timer.current)
    const p = pending.current
    pending.current = {}
    if (p.title === undefined && p.body === undefined) return
    const { error } = await supabase.rpc('save_shared_note', {
      nid: row.id,
      p_title: p.title?.trim() || undefined,
      p_body: p.body,
    })
    if (error) toastError(humanError(error))
    setSaved('ok')
  }
  const queue = (patch: { title?: string; body?: string }) => {
    pending.current = { ...pending.current, ...patch }
    setSaved('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush.current(), 800)
  }
  useEffect(() => () => void flush.current(), [])

  const editor = useNoteEditor({
    noteId: row.id,
    body: row.body,
    onChange: (md) => queue({ body: md }),
    collab: live.sync ? { sync: live.sync, user: me } : null,
  })

  const initDone = useRef(0)
  useEffect(() => {
    if (!editor || !live.initNeeded || initDone.current === live.initNeeded) return
    if (!editor.extensionManager.extensions.some((x) => x.name === 'collaboration')) return
    initDone.current = live.initNeeded
    editor.commands.setContent(row.body, { contentType: 'markdown' })
  }, [editor, live.initNeeded, row.body])
  useEffect(() => {
    if (editor) editor.setEditable(live.status === 'ready')
  }, [editor, live.status])
  useEffect(() => {
    if (live.remoteTitle == null || document.activeElement === titleRef.current) return
    setTitle(live.remoteTitle)
  }, [live.remoteTitle])
  const restart = live.restart
  useEffect(() => {
    if (!live.stale && live.status !== 'gone') return
    // una versión más nueva (o ya no compartida): se vuelve a leer; si nada cambió, se reconecta
    void supabase.rpc('shared_note', { nid: row.id }).then(({ data }) => {
      const next = ((data ?? []) as SharedRow[])[0] ?? null
      qc.setQueryData(['shared-note', row.id], next)
      if (next && next.space_id && next.ydoc_epoch === row.ydoc_epoch) restart()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.stale, live.status])
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  return (
    <>
      <header className="mnote-head">
        <button className="iconbtn" onClick={onClose} aria-label="Volver a Materiales">
          <Icon name="collapse" />
        </button>
        <span className="mnote-kicker">
          <Icon name="notebook" className="sm" /> Nota compartida · de {mine ? 'ti' : row.owner_name}
        </span>
        <SavedTag saved={saved} />
        <span className="spacer" />
        <PeerStack peers={live.peers} />
        {mine && (
          <Link
            className="btn ghost sm mnote-mine"
            to={`/cuaderno/nota/${row.id}`}
            aria-label="Abrir en mi Cuaderno"
          >
            <Icon name="notebook" className="sm" /> <span>En mi Cuaderno</span>
          </Link>
        )}
        {sure ? (
          <span className="mnote-sure">
            <span>¿Quitarla de Materiales?</span>
            <button className="btn ghost sm" onClick={() => setSure(false)}>
              No
            </button>
            <button className="btn danger sm" onClick={() => void removeFromMaterials()}>
              Quitar
            </button>
          </span>
        ) : (
          <button
            className="iconbtn"
            aria-label="Quitar de Materiales"
            title="Quitar de Materiales (deja de estar compartida)"
            onClick={() => setSure(true)}
          >
            <Icon name="trash" />
          </button>
        )}
      </header>
      <div className="mnote-scroll" data-scroll>
        <div className="cu-toolwrap mnote-tools">
          <Toolbar editor={editor} lite />
        </div>
        <article className="cu-read cu-note mnote-doc">
          <textarea
            ref={titleRef}
            className="cu-title-input"
            rows={1}
            value={title}
            maxLength={160}
            aria-label="Título de la nota"
            onChange={(e) => {
              const v = e.target.value.replace(/\n/g, ' ')
              setTitle(v)
              if (v.trim()) {
                queue({ title: v })
                live.sync?.sendTitle(v)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor?.commands.focus('start')
              }
            }}
          />
          <p className="cu-note-meta">
            <span>Editada {timeAgo(row.updated_at)} · todos en el equipo pueden escribir aquí</span>
          </p>
          {live.status !== 'ready' && (
            <LiveWait status={live.status === 'gone' ? 'waiting' : live.status} onRetry={restart} />
          )}
          <EditorContent editor={editor} className={live.status !== 'ready' ? 'cu-live-hide' : undefined} />
          <SelectionMenu editor={editor} />
          <div className="cu-end" />
        </article>
      </div>
    </>
  )
}

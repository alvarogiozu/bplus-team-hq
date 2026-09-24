import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import type { Editor } from '@tiptap/react'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { burst, haptic, pointOf } from '../lib/fx'
import { askAbout, embedNotes, type Answer } from './agent'
import { useCuadernoActions, useNotes, NONE, type Note, type Undo } from './data'
import type { AskRequest } from './Editor'
import { CIcon } from './icons'
import { plain } from './text'

const MODE_LABEL: Record<string, string> = {
  explicar: 'Explícamelo simple',
  ejemplo: 'Dame un ejemplo',
  conectar: '¿Con qué se conecta de lo mío?',
  pregunta: 'Hazme una pregunta',
  libre: 'Tu pregunta',
}

/**
 * La respuesta de Rockie sobre lo que seleccionaste. Rockie propone; tú eliges:
 * insertarla en la página, guardarla como página conectada (tu mapa crece) o descartarla.
 */
export function AskCard(p: { note: Note; req: AskRequest; editor: Editor | null; onClose: () => void; closeAfterInsert?: boolean }) {
  const actions = useCuadernoActions()
  const notes = useNotes().data ?? NONE
  const nav = useNavigate()
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'insert' | 'page' | null>(null)

  useEffect(() => {
    let alive = true
    setAnswer(null)
    setError(null)
    setDone(null)
    void askAbout({ noteId: p.note.id, seleccion: p.req.text, modo: p.req.modo, pregunta: p.req.pregunta }).then((r) => {
      if (!alive) return
      if (r.answer) {
        setAnswer(r.answer)
        haptic(8)
      } else setError(r.error ?? 'Rockie no pudo responder.')
    })
    return () => {
      alive = false
    }
  }, [p.note.id, p.req])

  function insert(el: HTMLElement) {
    const ed = p.editor
    if (!ed || !answer) return
    const doc = ed.state.doc
    const $pos = doc.resolve(Math.min(p.req.to, doc.content.size))
    const at = $pos.depth >= 1 ? $pos.after(1) : doc.content.size
    const md = `> ✨ **Rockie:** ${answer.respuesta.trim().replace(/\n/g, '\n> ')}`
    ed.chain().insertContentAt(at, md, { contentType: 'markdown' }).run()
    const pt = pointOf(el)
    burst(pt.x, pt.y, 12)
    setDone('insert')
    toast('Lo sumé a tu página', { kind: 'ok', icon: 'check', action: { label: 'Deshacer', onClick: () => void ed.chain().undo().run() } })
    // que se vea dónde quedó: un destello breve en el bloque nuevo (en el celular, además, se cierra la hoja)
    const dom = ed.view.nodeDOM(at)
    const show = () => {
      if (!(dom instanceof HTMLElement)) return
      dom.classList.add('cu-flash')
      setTimeout(() => dom.classList.remove('cu-flash'), 1400)
      dom.scrollIntoView({ behavior: 'smooth', block: p.closeAfterInsert ? 'center' : 'nearest' })
    }
    if (p.closeAfterInsert)
      setTimeout(() => {
        p.onClose()
        show()
      }, 420)
    else show()
  }

  async function savePage(el: HTMLElement) {
    if (!answer) return
    const undos: Undo[] = []
    const res = await actions.createNote({ title: answer.titulo, body: answer.respuesta, area: p.note.area, book_id: p.note.book_id })
    if (!res) return
    undos.push(res.undo)
    const l = await actions.createLink({ a_id: p.note.id, b_id: res.note.id, project_id: null, reason: answer.porque })
    if (l) undos.push(l.undo)
    for (const r of answer.relacionadas) {
      const x = await actions.createLink({ a_id: res.note.id, b_id: r.note_id, project_id: null, reason: r.reason })
      if (x) undos.push(x.undo)
    }
    const c = await actions.createCards(res.note.id, answer.tarjetas)
    if (c) undos.push(c)
    embedNotes([res.note.id])
    const pt = pointOf(el)
    burst(pt.x, pt.y, 18)
    haptic([8, 24, 8])
    setDone('page')
    const id = res.note.id
    toast(`Nueva página conectada: «${answer.titulo}»`, {
      kind: 'ok',
      icon: 'check',
      action: {
        label: 'Deshacer',
        onClick: async () => {
          for (const u of undos.reverse()) await u()
          setDone(null)
        },
      },
    })
    // la página nace conectada: se puede abrir ahí mismo
    setTimeout(() => setOpenId(id), 0)
  }
  const [openId, setOpenId] = useState<string | null>(null)

  const titleOf = (id: string) => notes.find((n) => n.id === id)?.title ?? 'una nota'
  return (
    <motion.section className="cu-ask card" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 440, damping: 32 }} aria-live="polite">
      <header>
        <span className="cu-ask-mode">
          <CIcon name="sparkle" size={14} /> {MODE_LABEL[p.req.modo]}
        </span>
        <span className="spacer" />
        <button className="cu-x" onClick={p.onClose} aria-label="Cerrar respuesta">
          <CIcon name="close" size={14} />
        </button>
      </header>
      <blockquote className="cu-ask-sel">«{p.req.text.length > 140 ? `${p.req.text.slice(0, 139)}…` : p.req.text}»</blockquote>
      {p.req.pregunta && <p className="cu-ask-q">{p.req.pregunta}</p>}
      {!answer && !error && (
        <div className="cu-thinking">
          <Rockie color="#3c5d73" size={24} />
          <span className="rk-dots">
            <i />
            <i />
            <i />
          </span>
          Rockie está pensando…
        </div>
      )}
      {error && <p className="rk-err">{error}</p>}
      {answer && (
        <>
          <div className="cu-ask-ans">{plain(answer.respuesta, { lines: true })}</div>
          {answer.relacionadas.length > 0 && (
            <p className="cu-ask-rel">
              <CIcon name="link" size={13} /> Se relaciona con {answer.relacionadas.map((r) => `«${titleOf(r.note_id)}»`).join(' y ')}
            </p>
          )}
          {done ? (
            <div className="cu-ask-done">
              <CIcon name="check" size={15} /> {done === 'insert' ? 'Sumado a tu página' : 'Guardado como página conectada'}
              {openId && (
                <button className="cu-linkbtn" onClick={() => nav(`/cuaderno/nota/${openId}`)}>
                  Abrir
                </button>
              )}
            </div>
          ) : (
            <div className="cu-ask-acts">
              <button className="btn sm" onClick={(e) => insert(e.currentTarget)}>
                Insertar en la página
              </button>
              <button className="btn sm gphoto" onClick={(e) => void savePage(e.currentTarget)}>
                Guardar como página conectada
              </button>
            </div>
          )}
        </>
      )}
    </motion.section>
  )
}

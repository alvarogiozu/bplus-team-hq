import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'motion/react'
import type { Editor } from '@tiptap/react'
import { toast } from '../components/Toasts'
import { burst, haptic, pointOf } from '../lib/fx'
import { redactar } from './agent'
import type { Note } from './data'
import { useDictation } from './dictation'
import { applyDictation, beginDictation, dictatedText, endDictation, pauseDictation, writeDictation } from './extensions'
import { CIcon } from './icons'
import { countWords } from './text'

// Dictar una página: lo que dices se va escribiendo ahí mismo (resaltado) y, al terminar,
// Rockie puede dejarlo en limpio — ordenado con subtítulos y viñetas, o redactado en prosa —
// sin inventar nada. Tú eliges si reemplaza tu dictado, va debajo o lo dejas como estaba.

type Phase = 'listen' | 'ready' | 'working' | 'preview' | 'error'
type Modo = 'ordenar' | 'redactar'

const MODOS: Record<Modo, { label: string; hint: string; working: string }> = {
  ordenar: { label: 'Ordenar', hint: 'Subtítulos y viñetas', working: 'Rockie está ordenando tu dictado…' },
  redactar: { label: 'Redactar', hint: 'Párrafos bien escritos', working: 'Rockie está redactando tu dictado…' },
}

export function DictationBar({ editor, note, mobile, onClose }: { editor: Editor; note: Note; mobile: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('listen')
  const [words, setWords] = useState(0)
  const [modo, setModo] = useState<Modo>('ordenar')
  const [out, setOut] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const job = useRef(0)
  const heard = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const d = useDictation({
    onSegment: (t) => {
      writeDictation(editor, t)
      setWords(countWords(dictatedText(editor)))
    },
  })
  const { start, stop } = d
  const mobileRef = useRef(mobile)

  const close = () => {
    job.current++
    stop()
    endDictation(editor)
    closeRef.current()
  }

  // al abrir: empieza a escuchar (en el celular, sin teclado encima)
  useEffect(() => {
    if (!beginDictation(editor)) {
      closeRef.current()
      return
    }
    if (mobileRef.current) editor.commands.blur()
    start()
    haptic(8)
    return () => endDictation(editor)
  }, [editor, start])

  // dejó de escuchar: con algo dictado, qué hacer con eso; sin nada, se cierra
  useEffect(() => {
    if (d.listening) {
      heard.current = true
      return
    }
    if (phase !== 'listen' || (!heard.current && !d.error)) return
    pauseDictation(editor)
    if (dictatedText(editor)) {
      setErr(d.error)
      setPhase('ready')
    } else if (d.error) {
      setErr(d.error)
      setPhase('error')
    } else {
      endDictation(editor)
      closeRef.current()
    }
  }, [d.listening, d.error, phase, editor])

  // al terminar de escuchar, lo dictado queda a la vista (sobre la barra)
  useEffect(() => {
    if (phase === 'ready') requestAnimationFrame(() => !editor.isDestroyed && editor.commands.scrollIntoView())
  }, [phase, editor])

  // Esc: deja de escuchar; si ya terminó, cierra dejando el texto como está
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (phase === 'listen') stop()
      else if (phase !== 'working') close()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const resume = () => {
    if (!beginDictation(editor)) return
    heard.current = false
    setErr(null)
    setPhase('listen')
    start()
  }

  const ai = async (m: Modo) => {
    const texto = dictatedText(editor)
    if (!texto) return
    setModo(m)
    setErr(null)
    setPhase('working')
    const id = ++job.current
    const r = await redactar({ texto, modo: m, noteId: note.id })
    if (id !== job.current) return
    if (r.texto) {
      setOut(r.texto)
      setPhase('preview')
      haptic(8)
    } else {
      setErr(r.error ?? 'Rockie no pudo ordenarlo. Tu dictado sigue en la página.')
      setPhase('ready')
    }
  }

  const place = (how: 'replace' | 'below', el: HTMLElement) => {
    const at = applyDictation(editor, out, how)
    const pt = pointOf(el)
    burst(pt.x, pt.y, 12)
    toast(how === 'replace' ? 'Rockie lo dejó en limpio' : 'Lo puse debajo de tu dictado', {
      kind: 'ok',
      icon: 'check',
      action: { label: 'Deshacer', onClick: () => void editor.chain().undo().run() },
    })
    flashAt(editor, at)
    closeRef.current()
  }

  const keep = () => {
    endDictation(editor)
    closeRef.current()
  }

  return (
    <motion.div
      className={`cu-dict${mobile ? ' mobile' : ''}`}
      role="region"
      aria-label="Dictado"
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.97, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 480, damping: 34 }}
      layout
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={phase}
          className="cu-dict-in"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
          transition={{ duration: 0.18 }}
        >
          {phase === 'listen' && (
            <div className="cu-dict-row" role="status" aria-live="polite">
              <MicLevel level={d.level} />
              <div className="cu-dict-live">
                <b>{words ? `Escuchando · ${words} palabra${words === 1 ? '' : 's'}` : 'Te escucho…'}</b>
                <span className={d.interim ? 'interim' : ''}>{d.interim || 'Habla normal. Di «coma», «punto» o «punto y aparte».'}</span>
              </div>
              <button type="button" className="btn sm cu-dict-stop" onClick={() => stop()}>
                <i aria-hidden="true" /> Listo
              </button>
            </div>
          )}

          {phase === 'ready' && (
            <>
              <div className="cu-dict-row">
                <span className="cu-dict-ico ok">
                  <CIcon name="check" size={18} />
                </span>
                <div className="cu-dict-live">
                  <b>
                    {words} palabra{words === 1 ? '' : 's'} en tu página
                  </b>
                  <span>¿Rockie lo deja en limpio? No inventa nada.</span>
                </div>
                <button type="button" className="cu-x" aria-label="Dejar así y cerrar" onClick={keep}>
                  <CIcon name="close" size={18} />
                </button>
              </div>
              {err && <p className="rk-err">{err}</p>}
              <div className="cu-dict-actions">
                {(Object.keys(MODOS) as Modo[]).map((m) => (
                  <button key={m} type="button" className={`cu-dict-ai${m === 'ordenar' ? ' main' : ''}`} onClick={() => void ai(m)}>
                    <CIcon name="sparkle" size={16} />
                    <span>
                      <b>{MODOS[m].label}</b>
                      <small>{MODOS[m].hint}</small>
                    </span>
                  </button>
                ))}
                <button type="button" className="btn sm ghost" onClick={resume}>
                  <CIcon name="mic" size={15} /> Seguir
                </button>
                <button type="button" className="btn sm ghost" onClick={keep}>
                  Dejar así
                </button>
              </div>
            </>
          )}

          {phase === 'working' && (
            <div className="cu-dict-row" role="status" aria-live="polite">
              <span className="cu-dict-ico spin">
                <CIcon name="sparkle" size={18} />
              </span>
              <div className="cu-dict-live">
                <b>{MODOS[modo].working}</b>
                <span>Tu dictado sigue en la página mientras tanto.</span>
              </div>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  job.current++
                  setPhase('ready')
                }}
              >
                Cancelar
              </button>
            </div>
          )}

          {phase === 'preview' && (
            <>
              <div className="cu-dict-row">
                <span className="cu-dict-ico">
                  <CIcon name="sparkle" size={18} />
                </span>
                <div className="cu-dict-live">
                  <b>{modo === 'ordenar' ? 'Así quedaría ordenado' : 'Así quedaría redactado'}</b>
                  <span>Revísalo antes de ponerlo.</span>
                </div>
                <button type="button" className="cu-x" aria-label="Volver" onClick={() => setPhase('ready')}>
                  <CIcon name="close" size={18} />
                </button>
              </div>
              <div className="cu-dict-preview">
                <MdLite md={out} />
              </div>
              <div className="cu-dict-actions">
                <button type="button" className="btn sm" onClick={(e) => place('replace', e.currentTarget)}>
                  Reemplazar mi dictado
                </button>
                <button type="button" className="btn sm ghost" onClick={(e) => place('below', e.currentTarget)}>
                  Ponerlo debajo
                </button>
                <button type="button" className="btn sm ghost" onClick={() => void ai(modo === 'ordenar' ? 'redactar' : 'ordenar')}>
                  Mejor {modo === 'ordenar' ? 'redactado' : 'ordenado'}
                </button>
              </div>
            </>
          )}

          {phase === 'error' && (
            <div className="cu-dict-row" role="alert">
              <span className="cu-dict-ico bad">
                <CIcon name="mic" size={18} />
              </span>
              <div className="cu-dict-live">
                <b>No pude escucharte</b>
                <span>{err}</span>
              </div>
              <button type="button" className="btn sm ghost" onClick={resume}>
                Reintentar
              </button>
              <button type="button" className="cu-x" aria-label="Cerrar" onClick={close}>
                <CIcon name="close" size={18} />
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

/** El micrófono que late con tu voz. */
function MicLevel({ level }: { level: MotionValue<number> }) {
  const ring = useTransform(level, [0, 1], [1, 1.8])
  const glow = useTransform(level, [0, 1], [0.25, 0.7])
  return (
    <span className="cu-dict-mic" aria-hidden="true">
      <motion.i style={{ scale: ring, opacity: glow }} />
      <CIcon name="mic" size={18} />
    </span>
  )
}

/** Destaca lo que acaba de entrar a la página. */
function flashAt(editor: Editor, at: number | null) {
  if (at == null) return
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return
    const dom = editor.view.nodeDOM(at)
    const el = dom instanceof HTMLElement ? dom : editor.view.domAtPos(at).node.parentElement
    if (!el || !editor.view.dom.contains(el)) return
    el.classList.add('cu-justadded')
    setTimeout(() => el.classList.remove('cu-justadded'), 1400)
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

// ---------- vista previa ----------
/** Markdown sencillo (subtítulos, viñetas, negritas) como elementos: sin HTML crudo. */
function MdLite({ md }: { md: string }) {
  const out: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(
      <Tag key={out.length}>
        {list.items.map((t, i) => (
          <li key={i}>{inline(t)}</li>
        ))}
      </Tag>,
    )
    list = null
  }
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    const bullet = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line)
    if (bullet) {
      const ordered = /^\d/.test(line)
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(bullet[1])
      continue
    }
    flush()
    if (!line) continue
    const h = /^#{1,6}\s+(.*)$/.exec(line)
    if (h) out.push(<h4 key={out.length}>{inline(h[1])}</h4>)
    else if (line.startsWith('>')) out.push(<blockquote key={out.length}>{inline(line.replace(/^>\s?/, ''))}</blockquote>)
    else out.push(<p key={out.length}>{inline(line)}</p>)
  }
  flush()
  return <>{out}</>
}

function inline(t: string): ReactNode {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part.replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')}</Fragment>,
  )
}

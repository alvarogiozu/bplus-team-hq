import { forwardRef, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { haptic } from '../lib/fx'
import { Listening, MicButton } from '../agenda/RockieBar'
import { useVoice } from '../agenda/voice'
import { useCapture } from './capture'
import { areaOf, useNotes, type Note } from './data'
import { CIcon } from './icons'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Notas que calzan con lo escrito: primero por título, luego por contenido. */
export function searchNotes(notes: Note[], q: string, max = 6) {
  const t = fold(q.trim())
  if (t.length < 2) return []
  const inTitle: Note[] = []
  const inBody: Note[] = []
  for (const n of notes) {
    if (fold(n.title).includes(t)) inTitle.push(n)
    else if (fold(n.body).includes(t)) inBody.push(n)
    if (inTitle.length >= max) break
  }
  return [...inTitle, ...inBody].slice(0, max)
}

/**
 * La barra de Rockie: escribes y Enter guarda en tu diario (Rockie propone después);
 * mientras escribes, te muestra notas que ya tienes. Mantén el micrófono para hablar.
 */
export const CaptureBar = forwardRef<
  HTMLInputElement,
  { mobile: boolean; typing: boolean; onTyping: (v: boolean) => void }
>(function CaptureBar(p, inputRef) {
  const notes = useNotes().data
  const { capture } = useCapture()
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [sel, setSel] = useState(-1)
  const [focused, setFocused] = useState(false)
  const pressAt = useRef(0)
  const voice = useVoice({ onFinal: (t) => void capture(t, 'voz') })
  const results = useMemo(() => searchNotes(notes ?? [], text), [notes, text])
  const showResults = (focused || p.typing) && text.trim().length >= 2

  useEffect(() => setSel(-1), [text])
  useEffect(() => {
    if (!voice.listening) return
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && voice.cancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [voice])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (sel >= 0 && results[sel]) return openNote(results[sel])
    const t = text.trim()
    if (!t) return
    setText('')
    p.onTyping(false)
    void capture(t, 'texto')
  }
  function openNote(n: Note) {
    setText('')
    p.onTyping(false)
    haptic(6)
    nav(`/cuaderno/nota/${n.id}`)
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault()
      setSel((s) => Math.min(results.length - 1, s + 1))
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault()
      setSel((s) => Math.max(-1, s - 1))
    } else if (e.key === 'Escape') {
      setText('')
      p.onTyping(false)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  // PC: toca para dictar (se detiene solo) · mantén para hablar.
  // Móvil (Rockie del centro): toca para escribir · mantén para hablar.
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mic = (big: boolean) => (
    <MicButton
      big={big}
      listening={voice.listening}
      level={voice.level}
      disabled={!voice.supported && !big}
      onDown={() => {
        if (voice.listening) return voice.stop()
        pressAt.current = Date.now()
        if (!big) {
          haptic(12)
          return voice.start({ autoStop: true })
        }
        hold.current = setTimeout(() => {
          hold.current = undefined
          haptic(12)
          voice.start()
        }, 260)
      }}
      onUp={() => {
        if (hold.current) {
          clearTimeout(hold.current)
          hold.current = undefined
          p.onTyping(!p.typing)
          return
        }
        if (voice.listening && (big || Date.now() - pressAt.current > 380)) voice.stop()
      }}
    />
  )

  const form = (
    <form className="cu-bar" onSubmit={submit}>
      {!p.mobile && <Rockie color="#3c5d73" size={30} reactive />}
      <input
        ref={inputRef}
        autoFocus={p.mobile}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={
          p.mobile ? 'Cuéntale a Rockie o busca…' : 'Cuéntale a Rockie algo de tu día, o busca una nota…'
        }
        aria-label="Cuéntale a Rockie o busca una nota"
        enterKeyHint="send"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="cu-results"
        aria-autocomplete="list"
      />
      {!p.mobile && (
        <span className="kbd" aria-hidden="true">
          Ctrl K
        </span>
      )}
      {mic(false)}
      <button className="cu-send" aria-label="Guardar en tu diario" disabled={!text.trim()}>
        <CIcon name="send" size={18} />
      </button>
    </form>
  )

  return (
    <div className={`cu-rk${p.mobile ? ' mobile' : ''}`}>
      <AnimatePresence>
        {voice.listening && <Listening key="listen" text={voice.text} level={voice.level} />}
      </AnimatePresence>

      <AnimatePresence>
        {showResults && !voice.listening && (
          <motion.div
            key="results"
            id="cu-results"
            role="listbox"
            className="cu-results"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
          >
            <div
              className={`cu-res-row save${sel === -1 ? ' on' : ''}`}
              role="option"
              aria-selected={sel === -1}
            >
              <CIcon name="diary" size={17} />
              <span>
                Guardar en tu diario <small>Enter</small>
              </span>
            </div>
            {results.map((n, i) => (
              <button
                key={n.id}
                type="button"
                role="option"
                aria-selected={sel === i}
                className={`cu-res-row${sel === i ? ' on' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openNote(n)}
              >
                <CIcon name="note" size={17} />
                <span>
                  <b>{n.title}</b>
                  <small>{areaOf(n.area).label}</small>
                </span>
              </button>
            ))}
            {results.length === 0 && <p className="cu-res-empty">Ninguna nota tiene eso todavía.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {voice.error && !voice.listening && (
        <motion.p
          className="rk-verr"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => voice.setError(null)}
        >
          {voice.error}
        </motion.p>
      )}

      {p.mobile ? (
        <AnimatePresence>
          {p.typing && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12, transition: { duration: 0.14 } }}
            >
              {form}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        form
      )}
      {p.mobile && <div className="cu-dockmic">{mic(true)}</div>}
    </div>
  )
})

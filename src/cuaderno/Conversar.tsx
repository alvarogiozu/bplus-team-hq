import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { toast, toastError } from '../components/Toasts'
import { haptic } from '../lib/fx'
import { MicButton } from '../agenda/RockieBar'
import { useVoice } from '../agenda/voice'
import { converse, type ConvTurn } from './agent'
import { closeDialog, type ConvContext } from './bus'
import { forgetEntry, useCapture } from './capture'
import { useCuadernoActions } from './data'
import { CIcon } from './icons'

// Conversar con Rockie: reflexionar sobre lo que te pasa, o profundizar en una página.
// Rockie pregunta más de lo que opina, una cosa a la vez, y trae lo que ya escribiste.
// Al cerrar, la conversación entera se guarda en tu diario y Rockie propone qué rescatar (tú decides).

/** Negritas y cursivas simples (lo único que Rockie usa al conversar); el resto va como texto. */
function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
  return (
    <>
      {parts.map((x, i) =>
        x.startsWith('**') && x.endsWith('**') && x.length > 4 ? (
          <b key={i}>{x.slice(2, -2)}</b>
        ) : x.startsWith('*') && x.endsWith('*') && x.length > 2 ? (
          <i key={i}>{x.slice(1, -1)}</i>
        ) : (
          x
        ),
      )}
    </>
  )
}

// al estudiar, lo más común está a un toque (en el celular escribir cansa)
const QUICK = ['Hazme una pregunta', 'Explícamelo más simple', 'Dame un ejemplo de mi día a día']

function opening(ctx: ConvContext, motivo?: string) {
  if (motivo) return `${motivo} ¿Qué es lo que más te está pesando?`
  if (ctx.tipo === 'nota') return `Vamos a profundizar en «${ctx.titulo}». ¿Qué parte te cuesta más? O si prefieres, te hago yo una pregunta para ver dónde estás.`
  if (ctx.tipo === 'entrada') return 'Leí lo que contaste. Si quieres, lo pensamos juntos con calma. ¿Qué es lo que más te está dando vueltas?'
  return '¿Qué tienes en mente? Aquí estoy para pensarlo contigo, sin apuro.'
}

export function ConversarPanel(p: { contexto: ConvContext; motivo?: string }) {
  const [turns, setTurns] = useState<ConvTurn[]>(() => [{ role: 'rockie', text: opening(p.contexto, p.motivo) }])
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { capture } = useCapture()
  const actions = useCuadernoActions()
  const pressAt = useRef(0)
  const voice = useVoice({ onFinal: (t) => void send(t) })
  const deepen = p.contexto.tipo === 'nota'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, thinking])
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  async function send(raw: string) {
    const t = raw.trim()
    if (!t || thinking) return
    setText('')
    setError(null)
    const next: ConvTurn[] = [...turns, { role: 'user', text: t }]
    setTurns(next)
    setThinking(true)
    haptic(6)
    const ctx = p.contexto.tipo === 'libre' ? { tipo: 'libre' } : { tipo: p.contexto.tipo, id: p.contexto.id }
    // el saludo inicial es de la app, no del modelo: no se manda
    const r = await converse(next.slice(1), ctx)
    setThinking(false)
    if (!r.text) {
      setError(r.error ?? 'Rockie no pudo responder. Intenta de nuevo.')
      return
    }
    setTurns((x) => [...x, { role: 'rockie', text: r.text! }])
    haptic(4)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void send(text)
  }

  /** Cerrar = guardar en el diario (si hubo conversación). Deshacer está en el toast del diario. */
  async function finish() {
    const said = turns.filter((t) => t.role === 'user')
    closeDialog()
    if (!said.length) return
    const about = p.contexto.tipo === 'libre' ? '' : ` sobre «${p.contexto.titulo}»`
    const transcript = [`Conversación con Rockie${about}`, '', ...turns.map((t) => `${t.role === 'user' ? 'Tú' : 'Rockie'}: ${t.text}`)].join('\n')
    const e = await capture(transcript, 'conversa', { stay: true })
    if (!e) return toastError('No pude guardar la conversación.')
    toast('Guardé la conversación en tu diario. Rockie te propone qué rescatar.', {
      kind: 'ok',
      icon: 'check',
      action: {
        label: 'Deshacer',
        onClick: () => {
          forgetEntry(e.id)
          void actions.deleteEntry(e)
        },
      },
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !voice.listening) void finish()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return createPortal(
    <motion.div className="cu-conv-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && void finish()}>
      <motion.section
        className="cu-conv"
        role="dialog"
        aria-modal="true"
        aria-label="Conversar con Rockie"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        <header className="cu-conv-head">
          <Rockie color="#2a82ad" size={40} listening={voice.listening} reactive />
          <div className="cu-titles">
            <h2>{deepen ? 'Profundizar' : 'Conversar'}</h2>
            <small>{p.contexto.tipo === 'libre' ? 'Solo entre tú y Rockie' : `Sobre ${p.contexto.tipo === 'nota' ? '' : 'lo que contaste: '}«${p.contexto.titulo}»`}</small>
          </div>
          <span className="spacer" />
          <button className="btn sm gphoto" onClick={() => void finish()} title="Guardar en tu diario y cerrar">
            Cerrar y guardar
          </button>
        </header>

        <div className="cu-conv-scroll" ref={scrollRef}>
          <AnimatePresence initial={false}>
            {turns.map((t, i) => (
              <motion.div
                key={i}
                className={`cu-msg ${t.role}`}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              >
                {t.role === 'rockie' && <Rockie color="#3c5d73" size={26} still />}
                <p>
                  <InlineMd text={t.text} />
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
          {thinking && (
            <div className="cu-msg rockie thinking" aria-live="polite">
              <Rockie color="#3c5d73" size={26} />
              <span className="rk-dots">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          {error && (
            <p className="rk-err" role="alert">
              {error}
            </p>
          )}
        </div>

        {deepen && !thinking && !voice.listening && (
          <div className="cu-conv-quick" role="group" aria-label="Respuestas rápidas">
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip plain" onClick={() => void send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {voice.listening && <p className="cu-conv-live">{voice.text || 'Te escucho…'}</p>}
        <form className="cu-conv-bar" onSubmit={submit}>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(text)
              }
            }}
            placeholder={deepen ? 'Pregunta o responde…' : 'Escribe con calma, o mantén el micrófono…'}
            aria-label="Tu mensaje para Rockie"
          />
          <MicButton
            big={false}
            listening={voice.listening}
            level={voice.level}
            disabled={!voice.supported}
            onDown={() => {
              if (voice.listening) return voice.stop()
              pressAt.current = Date.now()
              haptic(12)
              voice.start({ autoStop: true })
            }}
            onUp={() => {
              if (voice.listening && Date.now() - pressAt.current > 380) voice.stop()
            }}
          />
          <button className="cu-send" aria-label="Enviar" disabled={!text.trim() || thinking}>
            <CIcon name="send" size={18} />
          </button>
        </form>
        {!deepen && (
          <p className="cu-conv-care">
            Rockie acompaña, no reemplaza a un profesional. Si lo necesitas: Línea 113, opción 5 (salud mental, gratuita, 24 h).
          </p>
        )}
      </motion.section>
    </motion.div>,
    document.body,
  )
}

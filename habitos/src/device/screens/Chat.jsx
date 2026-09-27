// HABLAR — la pantalla principal del companion.
//
// LA DECISION DE DISENO QUE MANDA AQUI:
// en una resistiva de 3.5" NO se puede escribir. Un teclado en pantalla daria
// teclas de ~32px: la mitad del minimo tactil, con un panel que ademas falla
// ~10px. Seria inusable. Por eso la entrada es:
//     1. VOZ (press-to-talk)  <- principal. El ESP32-S3 ya lleva microfono.
//     2. CHIPS de respuesta   <- el agente propone, la persona toca.
//     3. Teclado              <- ultimo recurso, escondido tras un boton.
//
// En el prototipo la voz usa Web Speech API si el navegador la tiene; si no,
// el boton abre el teclado. En el aparato final: I2S -> Whisper/Gemini.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../data/mockStore.jsx'
import Rockie from '../../components/Rockie.jsx'
import { Tap, Chip } from '../ui/Tap.jsx'
import { correrTurno, correrTurnoNino, hayGemini, SEMILLAS, SEMILLAS_NINO } from '../agent/runAgent.js'

const ETIQUETA_ACCION = {
  habito: { icon: 'ti-plus', text: 'Habito creado', color: 'var(--olive)' },
  meta: { icon: 'ti-target-arrow', text: 'Meta creada', color: 'var(--berry)' },
  area: { icon: 'ti-layout-grid', text: 'Area creada', color: 'var(--azure)' },
  validado: { icon: 'ti-check', text: 'Validado', color: 'var(--green-photo)' },
  // Modo nino: el recibo dice la verdad — nada se aprueba solo, va al padre
  enviado: { icon: 'ti-send', text: 'Avisado a papa/mama', color: 'var(--azure)' },
  pedido: { icon: 'ti-gift', text: 'Pedido enviado', color: 'var(--amber)' },
}

// `nino`: cambia el agente (family.js en vez del store), el saludo y las
// semillas. La UI (voz + chips + teclado de emergencia) es identica.
export default function Chat({ nino = false, rockieLook = null }) {
  const store = useStore()
  const emotion = rockieLook?.emotion || store.emotion
  const rockieColor = rockieLook?.color ?? store.rockieColor

  const [msgs, setMsgs] = useState([
    { de: 'rockie', texto: nino ? '¡Hola! ¿Que hiciste hoy? Cuentame.' : 'Hola. Cuentame que quieres lograr y lo montamos.' },
  ])
  const [chips, setChips] = useState(nino ? SEMILLAS_NINO : SEMILLAS)
  const [pensando, setPensando] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  const [teclado, setTeclado] = useState(false)
  const [borrador, setBorrador] = useState('')

  const historial = useRef([])
  const scroller = useRef(null)
  const reconocedor = useRef(null)

  // Autoscroll al ultimo mensaje
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, pensando, chips])

  const enviar = useCallback(
    async (texto) => {
      const t = (texto || '').trim()
      if (!t || pensando) return
      setMsgs((m) => [...m, { de: 'yo', texto: t }])
      setChips([])
      setBorrador('')
      setTeclado(false)
      setPensando(true)
      try {
        const r = nino
          ? await correrTurnoNino(t, historial.current)
          : await correrTurno(t, historial.current, store)
        historial.current = r.historial || []
        setMsgs((m) => [...m, { de: 'rockie', texto: r.reply, acciones: r.acciones || [] }])
        setChips(r.chips || [])
      } catch (e) {
        setMsgs((m) => [...m, { de: 'rockie', texto: 'Algo fallo. Vuelve a intentarlo.' }])
      } finally {
        setPensando(false)
      }
    },
    [pensando, store, nino]
  )

  // ---- Voz (prototipo): Web Speech API si existe ----
  const hablar = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      // Sin API de voz -> el teclado es el plan B
      setTeclado(true)
      return
    }
    if (escuchando) {
      reconocedor.current?.stop()
      return
    }
    const r = new SR()
    r.lang = 'es-ES'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const txt = e.results?.[0]?.[0]?.transcript
      if (txt) enviar(txt)
    }
    r.onend = () => setEscuchando(false)
    r.onerror = () => {
      setEscuchando(false)
      setTeclado(true)
    }
    reconocedor.current = r
    setEscuchando(true)
    r.start()
  }, [escuchando, enviar])

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* ---- Cabecera compacta: Rockie pequeno + estado ---- */}
      <div
        style={{
          height: 'var(--dev-header)',
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--dev-gutter)',
          borderBottom: '2px solid var(--dev-line)',
        }}
      >
        <div style={{ width: 38, height: 38, flex: 'none' }}>
          <Rockie emotion={emotion} size={38} float={false} color={rockieColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-emph)', fontWeight: 700, color: 'var(--title)' }}>
            Rockie
          </div>
        </div>
        {/* Indicador de cerebro: nube (Gemini) o local (simulador) */}
        <span
          title={hayGemini() ? 'Gemini conectado' : 'Modo local, sin conexion'}
          style={{
            fontSize: 'var(--dev-micro)',
            fontWeight: 800,
            color: hayGemini() ? 'var(--green-photo)' : 'var(--dev-ink-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <i className={`ti ${hayGemini() ? 'ti-cloud' : 'ti-cpu'}`} style={{ fontSize: 16 }} />
          {hayGemini() ? 'IA' : 'LOCAL'}
        </span>
      </div>

      {/* ---- Conversacion ---- */}
      <div
        ref={scroller}
        className="bp-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          padding: 'var(--space-3) var(--dev-gutter)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {msgs.map((m, i) => (
          <Burbuja key={i} m={m} />
        ))}
        {pensando && <Pensando />}
      </div>

      {/* ---- Zona de entrada ---- */}
      <div
        style={{
          flex: 'none',
          padding: 'var(--space-2) var(--dev-gutter) var(--space-3)',
          borderTop: '2px solid var(--dev-line)',
          background: 'var(--dev-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {/* Chips: como se "responde" sin teclado. Maximo 3, si no no caben. */}
        {!teclado && chips.length > 0 && !pensando && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {chips.slice(0, 3).map((c, i) => (
              <Chip key={i} onClick={() => enviar(c)}>
                {c}
              </Chip>
            ))}
          </div>
        )}

        {teclado ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              enviar(borrador)
            }}
            style={{ display: 'flex', gap: 'var(--space-2)' }}
          >
            <input
              autoFocus
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              placeholder="Escribe..."
              style={{
                flex: 1,
                minWidth: 0,
                height: 64,
                padding: '0 var(--space-3)',
                fontSize: 'var(--dev-body)',
                fontFamily: 'var(--font-sans)',
                color: 'var(--dev-ink)',
                background: 'var(--dev-paper)',
                border: '2px solid var(--dev-line)',
                borderRadius: 'var(--dev-r)',
                outline: 'none',
              }}
            />
            <Tap icon="ti-send" onClick={() => enviar(borrador)} style={{ width: 64, padding: 0 }} />
          </form>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {/* PRESS-TO-TALK: el objetivo mas grande de toda la interfaz (72px) */}
            <Tap
              size="lg"
              full
              onClick={hablar}
              disabled={pensando}
              tone={escuchando ? 'var(--coral)' : 'var(--brand)'}
              edge={escuchando ? 'var(--coral-edge)' : 'var(--brand-edge)'}
              icon={escuchando ? 'ti-player-stop-filled' : 'ti-microphone'}
            >
              {escuchando ? 'Escuchando...' : 'Hablar'}
            </Tap>
            <Tap
              variant="soft"
              size="lg"
              icon="ti-keyboard"
              onClick={() => setTeclado(true)}
              aria-label="Teclado"
              style={{ width: 64, padding: 0, flex: 'none' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Burbuja({ m }) {
  const mio = m.de === 'yo'
  return (
    <div className="bp-fade" style={{ display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '88%' }}>
        <div
          style={{
            padding: 'var(--space-3)',
            borderRadius: 'var(--dev-r-lg)',
            borderBottomRightRadius: mio ? 4 : 'var(--dev-r-lg)',
            borderBottomLeftRadius: mio ? 'var(--dev-r-lg)' : 4,
            background: mio ? 'var(--brand)' : 'var(--dev-surface)',
            color: mio ? '#fff' : 'var(--dev-ink)',
            boxShadow: mio ? '0 var(--dev-lift) 0 var(--brand-edge)' : '0 var(--dev-lift) 0 var(--dev-edge)',
            fontSize: 'var(--dev-body)',
            lineHeight: 1.4,
          }}
        >
          {m.texto}
        </div>

        {/* Recibo de lo que el agente cambio de verdad en el store.
            Sin esto, la persona no sabe si "listo" significa que existe algo. */}
        {m.acciones?.map((a, i) => {
          const e = ETIQUETA_ACCION[a.tipo]
          if (!e) return null
          return (
            <div
              key={i}
              style={{
                marginTop: 'var(--space-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px var(--space-3)',
                borderRadius: 'var(--dev-r)',
                background: 'var(--dev-paper)',
                border: `2px solid ${e.color}`,
                fontSize: 'var(--dev-micro)',
                fontWeight: 800,
                color: e.color,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <i className={`ti ${e.icon}`} style={{ fontSize: 16 }} />
              {e.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Pensando() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: 'var(--space-3)', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bp-dot"
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: 'var(--dev-ink-soft)',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/mockStore.jsx'
import { stageOfLevel } from '../data/rockie.js'
import { APPS, entender } from '../lib/rockieVoz.js'
import { contarleAlChat } from '../lib/hqChat.js'
import Rockie from './Rockie.jsx'
import './RockieVoz.css'

// Hablarle a Rockie (el botón del centro de la barra). Tocas para hablar y vuelves a tocar
// para terminar: no hay que mantener presionado y no se corta en las pausas (si el navegador
// cierra el micrófono tras un silencio, se reabre solo). Rockie arma tarjetas: lo de hábitos
// se hace aquí; lo de la Agenda, el Equipo o el Cuaderno se lleva a su app.

const LANG = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? navigator.language : 'es-ES'

function useEscucha() {
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const rec = useRef(null)
  const quiere = useRef(false)
  const final = useRef('')
  const parcialRef = useRef('')
  const alTerminar = useRef(null)
  const [escuchando, setEscuchando] = useState(false)
  const [dicho, setDicho] = useState('')
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState('')

  const abrir = useCallback(() => {
    const r = new SR()
    r.lang = LANG
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final.current += `${t} `
        else inter += t
      }
      parcialRef.current = inter
      setDicho(final.current.trim())
      setParcial(inter)
    }
    r.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') {
        quiere.current = false
        setError('No tengo permiso para usar el micrófono. Actívalo en el candado de la barra del navegador, o escríbeme.')
      }
    }
    r.onend = () => {
      // Chrome cierra el micrófono tras unos segundos de silencio: si no tocaste para terminar, sigue escuchando
      if (quiere.current) {
        try {
          abrir()
          return
        } catch {
          quiere.current = false
        }
      }
      setEscuchando(false)
      const cb = alTerminar.current
      alTerminar.current = null
      cb?.(`${final.current} ${parcialRef.current}`.trim())
    }
    rec.current = r
    r.start()
  }, [SR])

  const empezar = useCallback(() => {
    if (!SR) return false
    final.current = ''
    parcialRef.current = ''
    setDicho('')
    setParcial('')
    setError('')
    quiere.current = true
    try {
      abrir()
      setEscuchando(true)
      return true
    } catch {
      quiere.current = false
      return false
    }
  }, [SR, abrir])

  const parar = useCallback(
    () =>
      new Promise((resolve) => {
        quiere.current = false
        alTerminar.current = resolve
        try {
          rec.current?.stop()
        } catch {
          alTerminar.current = null
          setEscuchando(false)
          resolve(`${final.current} ${parcialRef.current}`.trim())
        }
      }),
    [],
  )

  const cancelar = useCallback(() => {
    quiere.current = false
    alTerminar.current = null
    try {
      rec.current?.abort()
    } catch {
      /* ya estaba cerrado */
    }
    setEscuchando(false)
  }, [])

  useEffect(() => () => cancelar(), [cancelar])

  return { soportado: Boolean(SR), escuchando, dicho, parcial, error, empezar, parar, cancelar }
}

const SUGERENCIAS = ['Ya medité', 'Crea el hábito leer 20 minutos a las 9 de la noche', 'Nueva meta: correr 5k', 'Cita con Sofía mañana a las 7', 'Anota una idea']

export default function RockieVoz({ open, onClose, pedido = '' }) {
  const navigate = useNavigate()
  const { today, validateHabit, createHabit, createMeta, emotion, equipped, rockieColor, level } = useStore()
  const esc = useEscucha()
  const [texto, setTexto] = useState('')
  const [resp, setResp] = useState(null)
  const [hechas, setHechas] = useState({})
  const [teclado, setTeclado] = useState(false)
  const [escrito, setEscrito] = useState('')
  const [segundos, setSegundos] = useState(0)
  const hoyRef = useRef(today)
  hoyRef.current = today

  const procesar = useCallback((t) => {
    const txt = (t || '').trim()
    if (!txt) return
    const r = entender(txt, hoyRef.current)
    setTexto(txt)
    setResp(r)
    setHechas({})
    contarleAlChat([{ role: 'user', text: txt }, { role: 'assistant', text: r.dice }])
  }, [])

  // un pedido que llega desde otra app (?rockie=...) se atiende al abrir
  useEffect(() => {
    if (open && pedido) procesar(pedido)
  }, [open, pedido, procesar])

  // al cerrar, todo vuelve a cero (y el micrófono se apaga)
  const { cancelar } = esc
  useEffect(() => {
    if (open) return
    cancelar()
    setTexto('')
    setResp(null)
    setTeclado(false)
    setEscrito('')
  }, [open, cancelar])

  // reloj mientras escucha (para que se note que no se corta)
  useEffect(() => {
    if (!esc.escuchando) return undefined
    setSegundos(0)
    const id = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [esc.escuchando])

  // Escape cierra
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const tocarMic = async () => {
    if (esc.escuchando) {
      procesar(await esc.parar())
      return
    }
    setResp(null)
    setTexto('')
    if (!esc.empezar()) setTeclado(true)
  }

  const enviarEscrito = (e) => {
    e.preventDefault()
    if (!escrito.trim()) return
    procesar(escrito)
    setEscrito('')
  }

  const marcar = (i, label) => setHechas((h) => ({ ...h, [i]: label }))
  const irA = (ruta) => {
    onClose()
    navigate(ruta)
  }

  const cara = esc.escuchando ? { eyes: 6, mouth: 6 } : resp?.tarjetas.length ? { eyes: 4, mouth: 7 } : (emotion ?? { eyes: 1, mouth: 6 })
  const reloj = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="rv-root" role="dialog" aria-modal="true" aria-label="Hablar con Rockie">
          <motion.div className="rv-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="rv-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <span className="rv-grab" aria-hidden="true" />
            <div className="rv-top q">
              {esc.escuchando ? (
                <span className="rv-live"><i /> Te escucho · {reloj}</span>
              ) : (
                <span className="rv-title s">Rockie</span>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className="rv-ibtn" onClick={() => irA('/rockie')} aria-label="Tu Rockie, tienda e inventario" title="Tu Rockie">
                <i className="ti ti-diamond" />
              </button>
              <button type="button" className="rv-ibtn" onClick={onClose} aria-label="Cerrar">
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="rv-body">
              <div className={`rv-stage${esc.escuchando ? ' on' : resp ? ' mini' : ''}`}>
                <span className="rv-ring r1" /><span className="rv-ring r2" /><span className="rv-ring r3" />
                <Rockie emotion={cara} size={esc.escuchando ? 150 : resp ? 84 : 124} float moods={false} equipped={equipped} color={rockieColor} stage={stageOfLevel(level ?? 1)} />
              </div>

              {esc.escuchando || esc.dicho ? (
                <p className="rv-dicho s">
                  {esc.dicho}
                  {esc.parcial && <span className="rv-parcial"> {esc.parcial}</span>}
                  {!esc.dicho && !esc.parcial && <span className="rv-parcial">Habla tranquilo, no te corto…</span>}
                </p>
              ) : texto ? (
                <p className="rv-dicho s">«{texto}»</p>
              ) : (
                <p className="rv-hint q">Dime qué hiciste o qué quieres armar. Toca el micrófono para hablar y otra vez para terminar.</p>
              )}

              {esc.error && <p className="rv-error q" role="alert">{esc.error}</p>}
              {!esc.soportado && !resp && <p className="rv-error q">Este navegador no me deja escucharte: escríbeme abajo.</p>}

              {esc.escuchando && (
                <div className="rv-wave" aria-hidden="true">{Array.from({ length: 21 }, (_, i) => <b key={i} style={{ animationDelay: `${(i % 7) * 0.08}s` }} />)}</div>
              )}

              {resp && !esc.escuchando && (
                <motion.div className="rv-resp" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="rv-bubble q">{resp.dice}</div>
                  {resp.tarjetas.map((t, i) => (
                    <Tarjeta key={i} t={t} hecho={hechas[i]}
                      onHecho={() => { if (validateHabit(t.habito.id, 'check')) marcar(i, '¡Hecho! +40 XP') }}
                      onFoto={() => irA('/hoy')}
                      onCrearHabito={() => { createHabit({ name: t.nombre, time: t.hora || undefined }); marcar(i, 'Hábito creado') }}
                      onCrearMeta={() => marcar(i, createMeta({ nombre: t.nombre, plazo: null }) ? 'Meta creada' : 'Ya tienes el máximo de metas')}
                      onValidar={() => irA('/hoy')}
                      onLlevar={() => window.location.assign(APPS[t.app].ruta(t.pedido))}
                    />
                  ))}
                </motion.div>
              )}

              {!resp && !esc.escuchando && (
                <div className="rv-sug q" aria-label="Ideas para pedirle">
                  {SUGERENCIAS.map((s) => (
                    <button key={s} type="button" onClick={() => procesar(s.replace(/^Anota una idea$/, 'Anota una idea para el proyecto'))}>{s}</button>
                  ))}
                </div>
              )}
            </div>

            {teclado && (
              <form className="rv-write" onSubmit={enviarEscrito}>
                <input autoFocus value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Escríbele a Rockie…" aria-label="Escríbele a Rockie" className="q" />
                <button type="submit" className="rv-send" aria-label="Enviar" disabled={!escrito.trim()}><i className="ti ti-send" /></button>
              </form>
            )}

            <div className="rv-dock q">
              <button type="button" className={`rv-side${teclado ? ' on' : ''}`} onClick={() => setTeclado((v) => !v)} aria-label="Escribirle a Rockie">
                <i className="ti ti-keyboard" />
                <span>Escribir</span>
              </button>
              <button type="button" className={`rv-mic${esc.escuchando ? ' on' : ''}`} onClick={tocarMic} aria-label={esc.escuchando ? 'Terminar de hablar' : 'Hablar con Rockie'} disabled={!esc.soportado}>
                <span className="rv-mic-in"><i className={`ti ${esc.escuchando ? 'ti-player-stop-filled' : 'ti-microphone'}`} /></span>
                <span>{esc.escuchando ? 'Toca para terminar' : 'Toca y habla'}</span>
              </button>
              <button type="button" className="rv-side" onClick={() => irA('/rockie')} aria-label="Tu Rockie">
                <i className="ti ti-diamond" />
                <span>Tu Rockie</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Tarjeta({ t, hecho, onHecho, onFoto, onCrearHabito, onCrearMeta, onValidar, onLlevar }) {
  const cfg = {
    hecho: { color: 'var(--olive)', icono: 'ti-check', titulo: t.habito?.name, sub: 'Hábito de hoy' },
    ya: { color: 'var(--olive)', icono: 'ti-circle-check', titulo: t.habito?.name, sub: 'Ya estaba hecho hoy' },
    habito: { color: 'var(--coral)', icono: 'ti-plus', titulo: t.nombre, sub: t.hora ? `Hábito nuevo · todos los días a las ${t.hora}` : 'Hábito nuevo · todos los días' },
    meta: { color: 'var(--berry)', icono: 'ti-target-arrow', titulo: t.nombre, sub: 'Meta nueva' },
    validar: { color: 'var(--olive)', icono: 'ti-camera', titulo: 'Validar con foto', sub: 'La IA revisa tu prueba · +100 XP' },
    app: { color: APPS[t.app]?.color, icono: APPS[t.app]?.icono, titulo: t.pedido, sub: `Va a tu ${APPS[t.app]?.nombre}` },
  }[t.tipo]
  return (
    <div className="rv-card" style={{ '--c': cfg.color }}>
      <div className="rv-card-top">
        <span className="rv-card-ic"><i className={`ti ${cfg.icono}`} /></span>
        <span className="rv-card-t q"><b>{cfg.titulo}</b><small>{cfg.sub}</small></span>
      </div>
      {hecho ? (
        <div className="rv-card-ok q"><i className="ti ti-check" /> {hecho}</div>
      ) : (
        <div className="rv-card-acts q">
          {t.tipo === 'hecho' && (<>
            <button type="button" className="rv-btn solid" onClick={onHecho}><i className="ti ti-check" /> Hecho · +40</button>
            <button type="button" className="rv-btn" onClick={onFoto}><i className="ti ti-camera" /> Con foto · +100</button>
          </>)}
          {t.tipo === 'habito' && <button type="button" className="rv-btn solid" onClick={onCrearHabito}><i className="ti ti-plus" /> Crear hábito</button>}
          {t.tipo === 'meta' && <button type="button" className="rv-btn solid" onClick={onCrearMeta}><i className="ti ti-target-arrow" /> Crear meta</button>}
          {t.tipo === 'validar' && <button type="button" className="rv-btn solid" onClick={onValidar}><i className="ti ti-camera" /> Ir a validar</button>}
          {t.tipo === 'app' && <button type="button" className="rv-btn solid" onClick={onLlevar}>Llevar a {APPS[t.app].nombre} <i className="ti ti-arrow-up-right" /></button>}
        </div>
      )}
    </div>
  )
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/mockStore.jsx'
import { stageOfLevel } from '../data/rockie.js'
import { APPS, entender, respuesta } from '../lib/rockieVoz.js'
import { contarleAlChat, leerChat } from '../lib/hqChat.js'
import { guardarVoz, leerVoz } from '../lib/vozPrefs.js'
import Rockie from './Rockie.jsx'
import './RockieVoz.css'

// Hablarle a Rockie (el botón del centro de la barra), como en el lienzo «B+ móvil»:
//  1. Al abrir ya te escucha («Te escucho · 0:07»). Tocas para terminar: no hay que mantener
//     presionado y no se corta en las pausas (si el navegador cierra el micrófono tras un
//     silencio, se reabre solo). «Manos libres»: Rockie te contesta en voz alta y vuelve a
//     escuchar, y termina solo cuando dejas de hablar.
//  2. Después, la conversación: lo que hablaste antes en cualquier app (chat compartido de
//     Rockie OS), tu frase, su respuesta y tarjetas con lo que hizo. Lo de hábitos se hace aquí
//     (con «Deshacer»); lo de la Agenda, el Equipo o el Cuaderno se lleva a su app.

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
    // Si quedó un micrófono abierto, se suelta sin que su onend lo reabra (dos a la vez se pelean)
    const viejo = rec.current
    if (viejo) {
      viejo.onend = null
      viejo.onresult = null
      viejo.onerror = null
      try {
        viejo.abort()
      } catch {
        /* ya estaba cerrado */
      }
      rec.current = null
    }
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

/** Rockie dice su respuesta en voz alta (manos libres). */
function decir(texto, alTerminar) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    alTerminar?.()
    return
  }
  try {
    synth.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = LANG
    u.rate = 1.05
    u.onend = () => alTerminar?.()
    u.onerror = () => alTerminar?.()
    synth.speak(u)
  } catch {
    alTerminar?.()
  }
}


// «Ya medité» se guarda tras unos segundos: hasta entonces se puede deshacer de verdad
const ESPERA_HECHO = 6000

// Dónde hablaste antes con Rockie (chat compartido de Rockie OS)
const APP_DE = {
  habitos: { nombre: 'Hábitos', icono: 'ti-flame', color: 'var(--olive-edge)' },
  agenda: { nombre: 'Agenda', icono: 'ti-calendar', color: 'var(--coral)' },
  equipo: { nombre: 'Equipo', icono: 'ti-users', color: 'var(--azure)' },
  cuaderno: { nombre: 'Cuaderno', icono: 'ti-notebook', color: 'var(--berry)' },
}

const horaCorta = (d = new Date()) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`

function cuando(iso) {
  const d = new Date(iso)
  const dias = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 86400000)
  if (dias <= 0) return `Hoy · ${horaCorta(d)}`
  if (dias === 1) return 'Ayer'
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })
}

// Atajos bajo la conversación (lienzo): o hacen algo o te dejan la frase empezada
const ATAJOS = [
  { id: 'validar', label: 'Validar', icono: 'ti-camera', color: 'var(--olive-edge)' },
  { id: 'habito', label: 'Hábito', icono: 'ti-plus', color: 'var(--coral)', frase: 'Crea el hábito ' },
  { id: 'meta', label: 'Meta', icono: 'ti-target-arrow', color: 'var(--berry)', frase: 'Nueva meta: ' },
  { id: 'reto', label: 'Reto', icono: 'ti-bolt', color: 'var(--amber-edge)' },
  { id: 'animar', label: 'Animar', icono: 'ti-heart-handshake', color: 'var(--coral)', frase: 'Anima a ' },
  { id: 'agenda', label: 'Agenda', icono: 'ti-calendar', color: 'var(--azure)', sale: true },
]

export default function RockieVoz({ open, onClose, pedido = '', modo = 'escuchar' }) {
  const navigate = useNavigate()
  const store = useStore()
  const { today, friends, emotion, equipped, rockieColor, level } = store
  const esc = useEscucha()
  const [turnos, setTurnos] = useState([]) // { id, dicho, tarjetas, estados, ids, dice, hora }
  const [historia, setHistoria] = useState([])
  const [teclado, setTeclado] = useState(false)
  const [escrito, setEscrito] = useState('')
  const [segundos, setSegundos] = useState(0)
  const [manosLibres, setManosLibres] = useState(() => leerVoz('manosLibres'))
  const [animados, setAnimados] = useState({})

  // refs: los temporizadores y la voz viven fuera del ciclo de render
  const storeRef = useRef(store)
  storeRef.current = store
  const escRef = useRef(esc)
  escRef.current = esc
  const abiertoRef = useRef(open)
  abiertoRef.current = open
  const manosRef = useRef(manosLibres)
  manosRef.current = manosLibres
  const cerrarRef = useRef(onClose)
  cerrarRef.current = onClose
  const pendientes = useRef(new Map()) // `${turno}:${i}` -> { timer, habitId }
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const ponerEstado = useCallback((turnoId, i, estado, id) => {
    setTurnos((prev) =>
      prev.map((t) =>
        t.id === turnoId
          ? { ...t, estados: { ...t.estados, [i]: estado }, ids: id === undefined ? t.ids : { ...t.ids, [i]: id } }
          : t,
      ),
    )
  }, [])

  // Guarda un «ya medité» que estaba esperando (al vencer el plazo o al cerrar)
  const confirmar = useCallback(
    (turnoId, i) => {
      const key = `${turnoId}:${i}`
      const p = pendientes.current.get(key)
      if (!p) return
      clearTimeout(p.timer)
      pendientes.current.delete(key)
      storeRef.current.validateHabit(p.habitId, 'check')
      ponerEstado(turnoId, i, 'hecho')
    },
    [ponerEstado],
  )

  const confirmarTodo = useCallback(() => {
    for (const key of [...pendientes.current.keys()]) {
      const [turnoId, i] = key.split(':')
      confirmar(Number(turnoId), Number(i))
    }
  }, [confirmar])

  const procesar = useCallback(
    (t) => {
      const txt = (t || '').trim()
      if (!txt) return
      // Manos libres: «listo» (o «gracias», «eso es todo») cierra la conversación
      if (manosRef.current && /^(listo|lista|ya est[aá]|gracias|eso es todo|chao|adi[oó]s)[.!]?$/i.test(txt)) {
        decir('¡Listo! Aquí estoy cuando me necesites.')
        cerrarRef.current()
        return
      }
      const { tarjetas } = entender(txt, storeRef.current.today, storeRef.current.friends || [])
      const id = Date.now()
      const estados = {}
      const ids = {}
      const hecho = {}
      tarjetas.forEach((c, i) => {
        if (c.tipo === 'hecho') {
          estados[i] = 'pendiente'
          hecho[i] = true
          const timer = setTimeout(() => confirmar(id, i), ESPERA_HECHO)
          pendientes.current.set(`${id}:${i}`, { timer, habitId: c.habito.id })
        } else if (c.tipo === 'habito') {
          const h = storeRef.current.createHabit({ name: c.nombre, time: c.hora || undefined })
          if (h?.id) {
            estados[i] = 'creado'
            ids[i] = h.id
            hecho[i] = true
          }
        } else if (c.tipo === 'meta') {
          const m = storeRef.current.createMeta({ nombre: c.nombre, plazo: null })
          if (m?.id) {
            estados[i] = 'creado'
            ids[i] = m.id
            hecho[i] = true
          } else estados[i] = 'lleno'
        }
      })
      // «Rockie elige la app»: si todo es de otra app, te lleva sin preguntar
      const soloApp = tarjetas.length === 1 && tarjetas[0].tipo === 'app' ? tarjetas[0] : null
      const auto = Boolean(soloApp) && leerVoz('autoApp')
      const dice = auto ? `Eso va a tu ${APPS[soloApp.app].nombre}: te llevo y ahí lo guardo.` : respuesta(tarjetas, hecho)
      if (auto) {
        setTimeout(() => {
          if (abiertoRef.current) window.location.assign(APPS[soloApp.app].ruta(soloApp.pedido))
        }, 1800)
      }
      setTurnos((prev) => [...prev, { id, dicho: txt, tarjetas, estados, ids, dice, auto, hora: horaCorta() }])
      contarleAlChat([
        { role: 'user', text: txt },
        { role: 'assistant', text: dice },
      ])
      if (manosRef.current) {
        decir(dice, () => {
          if (abiertoRef.current && manosRef.current) escRef.current.empezar()
        })
      }
    },
    [confirmar],
  )

  const terminar = useCallback(async () => {
    procesar(await escRef.current.parar())
  }, [procesar])

  // Al abrir: lo último que hablaste con Rockie y, sin pedido pendiente, ya te escucha
  useEffect(() => {
    if (!open) return undefined
    let vivo = true
    // Manos libres pudo cambiar en Tu Rockie; desde el Inicio se puede pedir encendido
    if (modo === 'manos') guardarVoz('manosLibres', true)
    const manos = leerVoz('manosLibres')
    setManosLibres(manos)
    manosRef.current = manos
    leerChat(6).then((h) => {
      if (vivo) setHistoria(h)
    })
    if (pedido) procesar(pedido)
    else if (modo === 'escribir') setTeclado(true)
    else if (!escRef.current.empezar()) setTeclado(true)
    return () => {
      vivo = false
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al cerrar: se guarda lo pendiente, se apaga el micrófono y todo vuelve a cero
  const { cancelar } = esc
  useEffect(() => {
    if (open) return
    confirmarTodo()
    cancelar()
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* sin voz */
    }
    setTurnos([])
    setTeclado(false)
    setEscrito('')
    setAnimados({})
  }, [open, cancelar, confirmarTodo])
  useEffect(() => () => confirmarTodo(), [confirmarTodo])

  // reloj mientras escucha (para que se note que no se corta)
  useEffect(() => {
    if (!esc.escuchando) return undefined
    setSegundos(0)
    const id = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [esc.escuchando])

  // Manos libres: cuando dejas de hablar un momento, Rockie toma la palabra
  useEffect(() => {
    if (!manosLibres || !esc.escuchando || !(esc.dicho || esc.parcial)) return undefined
    const id = setTimeout(terminar, 1600)
    return () => clearTimeout(id)
  }, [manosLibres, esc.escuchando, esc.dicho, esc.parcial, terminar])

  // la conversación siempre muestra lo último
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [turnos, historia, esc.escuchando])

  // Escape cierra
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const cambiarManosLibres = () => {
    const v = !manosLibres
    setManosLibres(v)
    guardarVoz('manosLibres', v)
    if (v && !esc.escuchando) esc.empezar()
  }

  const tocarMic = () => {
    if (esc.escuchando) {
      terminar()
      return
    }
    if (!esc.empezar()) setTeclado(true)
  }

  const cancelarEscucha = () => {
    esc.cancelar()
    if (!turnos.length && !historia.length) onClose()
  }

  const enviarEscrito = (e) => {
    e.preventDefault()
    if (!escrito.trim()) return
    procesar(escrito)
    setEscrito('')
  }

  const irA = (ruta) => {
    onClose()
    navigate(ruta)
  }

  const empezarFrase = (frase) => {
    esc.cancelar()
    setTeclado(true)
    setEscrito(frase)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(frase.length, frase.length)
      }
    })
  }

  const atajo = (a) => {
    if (a.id === 'validar') procesar('Validar con foto')
    else if (a.id === 'reto') irA('/juntos?crear=reto')
    else if (a.id === 'agenda') window.location.assign('/agenda')
    else empezarFrase(a.frase)
  }

  // Acciones de cada tarjeta
  const acciones = {
    deshacer: (tr, i) => {
      const c = tr.tarjetas[i]
      if (c.tipo === 'hecho') {
        const p = pendientes.current.get(`${tr.id}:${i}`)
        if (p) {
          clearTimeout(p.timer)
          pendientes.current.delete(`${tr.id}:${i}`)
        }
        ponerEstado(tr.id, i, 'deshecho')
      } else if (c.tipo === 'habito' && tr.ids[i]) {
        storeRef.current.deleteHabit(tr.ids[i])
        ponerEstado(tr.id, i, 'borrado')
      } else if (c.tipo === 'meta' && tr.ids[i]) {
        storeRef.current.deleteMeta(tr.ids[i])
        ponerEstado(tr.id, i, 'borrado')
      }
    },
    rehacer: (tr, i) => {
      const c = tr.tarjetas[i]
      if (c.tipo === 'hecho') {
        if (storeRef.current.validateHabit(c.habito.id, 'check')) ponerEstado(tr.id, i, 'hecho')
      } else if (c.tipo === 'habito') {
        const h = storeRef.current.createHabit({ name: c.nombre, time: c.hora || undefined })
        if (h?.id) ponerEstado(tr.id, i, 'creado', h.id)
      } else if (c.tipo === 'meta') {
        const m = storeRef.current.createMeta({ nombre: c.nombre, plazo: null })
        ponerEstado(tr.id, i, m?.id ? 'creado' : 'lleno', m?.id)
      }
    },
    foto: (tr, i) => {
      const c = tr.tarjetas[i]
      const key = `${tr.id}:${i}`
      const p = pendientes.current.get(key)
      if (p) {
        clearTimeout(p.timer)
        pendientes.current.delete(key)
      }
      const id = c.habito?.id || storeRef.current.today.find((h) => !h.done)?.id
      irA(id ? `/hoy?foto=${id}` : '/hoy')
    },
    animar: (tr, i) => {
      setAnimados((a) => ({ ...a, [`${tr.id}:${i}`]: true }))
    },
    juntos: () => irA('/juntos'),
    llevar: (c) => window.location.assign(APPS[c.app].ruta(c.pedido)),
  }

  // Historia agrupada por app y día: «Ayer · en Agenda»
  const grupos = useMemo(() => {
    const out = []
    for (const t of historia) {
      const etiqueta = `${cuando(t.created_at)} · en ${APP_DE[t.app]?.nombre || 'Rockie'}`
      const ultimo = out[out.length - 1]
      if (ultimo && ultimo.etiqueta === etiqueta) ultimo.turnos.push(t)
      else out.push({ etiqueta, app: t.app, turnos: [t] })
    }
    return out
  }, [historia])

  const escuchando = esc.escuchando
  const reloj = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
  const piedra = stageOfLevel(level ?? 1)
  const caraChat = turnos.length ? { eyes: 4, mouth: 7 } : (emotion ?? { eyes: 1, mouth: 6 })

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="rv-root" role="dialog" aria-modal="true" aria-label="Hablar con Rockie">
          <motion.div className="rv-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className={`rv-sheet${escuchando ? ' escucha' : ' chat'}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <span className="rv-grab" aria-hidden="true" />

            {escuchando ? (
              <div className="rv-top q">
                <span className="rv-live">
                  <i /> Te escucho · {reloj}
                </span>
                <span style={{ flex: 1 }} />
                <button type="button" className={`rv-manos${manosLibres ? ' on' : ''}`} role="switch" aria-checked={manosLibres} onClick={cambiarManosLibres}>
                  <i className="ti ti-headphones" aria-hidden="true" /> Manos libres
                  <span className="rv-switch" aria-hidden="true">
                    <b />
                  </span>
                </button>
              </div>
            ) : (
              <div className="rv-top q">
                <button type="button" className="rv-ibtn" onClick={onClose} aria-label="Cerrar">
                  <i className="ti ti-chevron-down" />
                </button>
                <span className="rv-title s">Rockie</span>
                <span className="rv-nivel">Nv {level ?? 1}</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="rv-ibtn tienda" onClick={() => irA('/rockie/tienda')} aria-label="Tienda" title="Tienda">
                  <i className="ti ti-building-store" />
                </button>
                <button type="button" className="rv-ibtn" onClick={() => irA('/rockie')} aria-label="Tu Rockie" title="Tu Rockie">
                  <i className="ti ti-diamond" />
                </button>
              </div>
            )}

            {escuchando ? (
              <div className="rv-body rv-body--escucha">
                <div className="rv-stage">
                  <span className="rv-halo h1" />
                  <span className="rv-halo h2" />
                  <span className="rv-halo h3" />
                  <Rockie emotion={{ eyes: 6, mouth: 6 }} size={150} float moods={false} equipped={equipped} color={rockieColor} stage={piedra} />
                </div>
                <p className="rv-dicho s" aria-live="polite">
                  {esc.dicho || esc.parcial ? (
                    <>
                      «{esc.dicho}
                      {esc.parcial && <span className="rv-parcial">{esc.dicho ? ' ' : ''}{esc.parcial}</span>}»
                    </>
                  ) : (
                    <span className="rv-parcial">Te escucho…</span>
                  )}
                </p>
                <p className="rv-hint q">{manosLibres ? 'Manos libres: te contesto en voz alta. Di «listo» para cerrar.' : 'Habla tranquilo: no te corto a los pocos segundos.'}</p>
                {esc.error && (
                  <p className="rv-error q" role="alert">
                    {esc.error}
                  </p>
                )}
                <div className="rv-wave" aria-hidden="true">
                  {Array.from({ length: 21 }, (_, i) => (
                    <b key={i} style={{ animationDelay: `${(i % 7) * 0.08}s` }} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="rv-body rv-body--chat" ref={scrollRef}>
                {grupos.length > 0 && (
                  <div className="rv-hist">
                    {grupos.map((g, k) => (
                      <div key={`${g.etiqueta}-${k}`} className="rv-hist-g">
                        <span className="rv-kick q">
                          <i className={`ti ${APP_DE[g.app]?.icono || 'ti-message-circle'}`} style={{ color: APP_DE[g.app]?.color }} aria-hidden="true" /> {g.etiqueta}
                        </span>
                        {g.turnos.map((t) => (
                          <div key={t.id} className={`q ${t.role === 'user' ? 'rv-me chica' : 'rv-bubble chica'}`}>
                            {t.text}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {turnos.length === 0 && (
                  <div className="rv-said">
                    <span className="rv-av">
                      <Rockie emotion={caraChat} size={38} moods={false} equipped={equipped} color={rockieColor} stage={piedra} />
                    </span>
                    <div className="rv-bubble q">
                      ¿Qué hiciste hoy o qué quieres armar? Toca el micrófono y háblame con calma: «ya medité», «crea el hábito leer 20 minutos» o «cita con Sofía mañana a las 7».
                    </div>
                  </div>
                )}

                {turnos.map((tr, k) => (
                  <Fragment key={tr.id}>
                    {k === 0 && grupos.length > 0 && (
                      <div className="rv-sep" aria-hidden="true">
                        <span />
                        <span className="rv-kick q">Hoy · {tr.hora}</span>
                        <span />
                      </div>
                    )}
                    <motion.div className="rv-me q" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      {tr.dicho}
                    </motion.div>
                    <motion.div className="rv-said" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                      <span className="rv-av">
                        <Rockie emotion={caraChat} size={38} moods={false} equipped={equipped} color={rockieColor} stage={piedra} />
                      </span>
                      <div className="rv-bubble q">{tr.dice}</div>
                    </motion.div>
                    {tr.tarjetas.map((c, i) => c.tipo !== 'nohay' && (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
                        <Tarjeta c={c} estado={tr.estados[i]} auto={tr.auto} animado={animados[`${tr.id}:${i}`]} on={(accion) => acciones[accion](tr, i)} llevar={() => acciones.llevar(c)} />
                      </motion.div>
                    ))}
                  </Fragment>
                ))}

                {esc.error && (
                  <p className="rv-error q" role="alert">
                    {esc.error}
                  </p>
                )}
                {!esc.soportado && <p className="rv-error q">Este navegador no me deja escucharte: escríbeme abajo.</p>}
              </div>
            )}

            {!escuchando && (
              <div className="rv-chips q" role="group" aria-label="Atajos">
                {ATAJOS.map((a) => (
                  <button key={a.id} type="button" onClick={() => atajo(a)}>
                    <i className={`ti ${a.icono}`} style={{ color: a.color }} aria-hidden="true" /> {a.label}
                    {a.sale && <i className="ti ti-arrow-up-right rv-sale" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}

            {teclado && !escuchando && (
              <form className="rv-write" onSubmit={enviarEscrito}>
                <input ref={inputRef} value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="Escríbele a Rockie…" aria-label="Escríbele a Rockie" className="q" />
                <button type="submit" className="rv-send" aria-label="Enviar" disabled={!escrito.trim()}>
                  <i className="ti ti-send" />
                </button>
              </form>
            )}

            {escuchando ? (
              <div className="rv-dock q">
                <button
                  type="button"
                  className="rv-side"
                  onClick={() => {
                    esc.cancelar()
                    setTeclado(true)
                  }}
                  aria-label="Escribirle a Rockie"
                >
                  <i className="ti ti-keyboard" />
                  <span>Escribir</span>
                </button>
                <button type="button" className="rv-mic on" onClick={terminar} aria-label="Terminar de hablar">
                  <span className="rv-mic-in">
                    <i className="ti ti-player-stop-filled" />
                  </span>
                  <span>Toca para terminar</span>
                </button>
                <button type="button" className="rv-side" onClick={cancelarEscucha} aria-label="Cancelar">
                  <i className="ti ti-x" />
                  <span>Cancelar</span>
                </button>
              </div>
            ) : (
              <div className="rv-dock q">
                <button type="button" className={`rv-side${teclado ? ' on' : ''}`} onClick={() => setTeclado((v) => !v)} aria-label="Escribirle a Rockie" aria-pressed={teclado}>
                  <i className="ti ti-keyboard" />
                </button>
                <button type="button" className="rv-mic" onClick={tocarMic} aria-label="Hablar con Rockie" disabled={!esc.soportado}>
                  <span className="rv-mic-in">
                    <i className="ti ti-microphone" />
                  </span>
                  <span>Toca y habla</span>
                </button>
                <button type="button" className={`rv-side manos${manosLibres ? ' on' : ''}`} onClick={cambiarManosLibres} aria-label="Manos libres" aria-pressed={manosLibres} disabled={!esc.soportado}>
                  <i className="ti ti-headphones" />
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Una tarjeta con lo que Rockie hizo (o propone) y cómo seguir o deshacer. */
function Tarjeta({ c, estado, auto = false, animado, on, llevar }) {
  const btn = (accion, texto, { solid = false, icono } = {}) => (
    <button type="button" className={`rv-btn${solid ? ' solid' : ''}`} onClick={() => on(accion)}>
      {icono && <i className={`ti ${icono}`} aria-hidden="true" />} {texto}
    </button>
  )
  const deshacer = btn('deshacer', 'Deshacer', { icono: 'ti-arrow-back-up' })

  let cfg
  if (c.tipo === 'hecho') {
    const marcado = estado === 'pendiente' || estado === 'hecho'
    cfg = {
      color: 'var(--olive)',
      icono: 'ti-check',
      titulo: c.habito.name,
      sub: marcado ? 'Hecho · +40 XP' : 'Sin marcar',
      ok: marcado,
      app: 'Hábitos',
      acts:
        estado === 'pendiente' ? (
          <>
            {btn('foto', 'Mejor con foto · +100', { solid: true, icono: 'ti-camera' })}
            {deshacer}
          </>
        ) : estado === 'deshecho' ? (
          <>
            {btn('rehacer', 'Marcar hecho · +40', { solid: true, icono: 'ti-check' })}
            {btn('foto', 'Con foto · +100', { icono: 'ti-camera' })}
          </>
        ) : null,
    }
  } else if (c.tipo === 'ya') {
    cfg = { color: 'var(--olive)', icono: 'ti-circle-check', titulo: c.habito.name, sub: 'Ya estaba hecho hoy', ok: true, app: 'Hábitos' }
  } else if (c.tipo === 'habito') {
    cfg = {
      color: 'var(--coral)',
      icono: 'ti-plus',
      titulo: c.nombre,
      sub: estado === 'borrado' ? 'Lo quité' : `Hábito nuevo · todos los días${c.hora ? ` a las ${c.hora}` : ''}`,
      ok: estado === 'creado',
      app: 'Hábitos',
      acts: estado === 'creado' ? deshacer : btn('rehacer', 'Crear hábito', { solid: true, icono: 'ti-plus' }),
    }
  } else if (c.tipo === 'meta') {
    cfg = {
      color: 'var(--berry)',
      icono: 'ti-target-arrow',
      titulo: c.nombre,
      sub: estado === 'lleno' ? 'Ya tienes el máximo de metas' : estado === 'borrado' ? 'La quité' : 'Meta nueva',
      ok: estado === 'creado',
      app: 'Hábitos',
      acts: estado === 'creado' ? deshacer : estado === 'borrado' ? btn('rehacer', 'Crear meta', { solid: true, icono: 'ti-target-arrow' }) : null,
    }
  } else if (c.tipo === 'validar') {
    cfg = {
      color: 'var(--olive)',
      icono: 'ti-camera',
      titulo: 'Validar con foto',
      sub: 'La IA revisa tu prueba · +100 XP',
      app: 'Hábitos',
      acts: btn('foto', 'Abrir la cámara', { solid: true, icono: 'ti-camera' }),
    }
  } else if (c.tipo === 'animar') {
    cfg = {
      color: 'var(--coral)',
      icono: 'ti-heart-handshake',
      titulo: `Ánimo para ${c.nombre}`,
      sub: !c.amigo ? 'No está entre tus amigos' : animado ? '¡Ánimo enviado! 💪' : 'Tu gente en Juntos',
      ok: Boolean(animado),
      app: 'Juntos',
      acts: !c.amigo ? btn('juntos', 'Ver Juntos') : animado ? null : btn('animar', 'Animar', { solid: true, icono: 'ti-heart-handshake' }),
    }
  } else {
    const app = APPS[c.app]
    cfg = {
      color: app.color,
      icono: app.icono,
      titulo: c.pedido,
      sub: auto ? `Abriendo tu ${app.nombre}…` : `Va a tu ${app.nombre}: ahí lo guardo`,
      app: app.nombre,
      sale: true,
      acts: (
        <button type="button" className="rv-btn" onClick={llevar}>
          Abrir en {app.nombre} <i className="ti ti-arrow-up-right" aria-hidden="true" />
        </button>
      ),
    }
  }

  return (
    <div className="rv-card" style={{ '--c': cfg.color }}>
      <div className="rv-card-top">
        <span className="rv-card-ic">
          <i className={`ti ${cfg.icono}`} aria-hidden="true" />
        </span>
        <span className="rv-card-t">
          <b className="s">{cfg.titulo}</b>
          <small className={`q${cfg.ok ? ' ok' : ''}`}>{cfg.sub}</small>
        </span>
        <span className="rv-card-app q">
          {cfg.app}
          {cfg.sale && <i className="ti ti-arrow-up-right" aria-hidden="true" />}
        </span>
      </div>
      {cfg.acts && <div className="rv-card-acts q">{cfg.acts}</div>}
    </div>
  )
}

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/mockStore.jsx'
import { useHQ } from '../data/hqStore.jsx'
import { hoyISO } from '../data/fechas.js'
import { playSfx } from '../lib/sfx.js'

function normTxt(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function detectIntent(text) {
  const t = normTxt(text)
  if (/valid|ya hice|lo hice|prueba|foto|cumpl/.test(t)) return 'validar'
  if (/reunion|junta|meeting|agend|cita/.test(t)) return 'junta'
  if (/invitar|invite|agregar.*(amigo|companero|socio)|suma.*(equipo)/.test(t)) return 'invitar'
  if (/tarea|task|encargo|pendiente de/.test(t)) return 'tarea'
  if (/(habito|habit|rutina)/.test(t) && /(crea|create|nuevo|new|suma|add|agrega|quiero|anade|añade)/.test(t)) return 'habito'
  if (/^habito\b/.test(t) || /^habit\b/.test(t) || /nuevo habito/.test(t)) return 'habito'
  if (/meta|goal|objetivo/.test(t) && /(crea|nueva|nuevo|arma)/.test(t)) return 'meta'
  if (/(proyecto|project|espacio)/.test(t) && /(crea|create|nuevo|new|arma|abre)/.test(t)) return 'proyecto'
  if (/^proyecto\b/.test(t) || /^project\b/.test(t) || /nuevo proyecto/.test(t)) return 'proyecto'
  return null
}

export default function RockieCompanionVoice() {
  const navigate = useNavigate()
  const { createHabit, createMeta } = useStore()
  const { addTask, updateSpace } = useHQ()

  const [talking, setTalking] = useState(false)
  const [bubble, setBubble] = useState('¡Dime qué armar: meta, junta, tarea o proyecto!')
  const [messages, setMessages] = useState([])
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [showProjectModal, setShowProjectModal] = useState(false)

  // Form states for modals
  const [meetTitle, setMeetTitle] = useState('')
  const [meetWhen, setMeetWhen] = useState('Hoy 18:00')
  const [meetWith, setMeetWith] = useState('Equipo')
  const [projectName, setProjectName] = useState('')

  const recognitionRef = useRef(null)

  const chips = [
    { id: 'meta', label: 'Meta', icon: 'ti-flag' },
    { id: 'habito', label: 'Hábito', icon: 'ti-checkbox' },
    { id: 'proyecto', label: 'Proyecto', icon: 'ti-layout-kanban' },
    { id: 'junta', label: 'Junta', icon: 'ti-calendar-event' },
    { id: 'tarea', label: 'Tarea', icon: 'ti-list-check' },
    { id: 'validar', label: 'Validar', icon: 'ti-photo-check' },
  ]

  const pushMessage = (who, text, card = null) => {
    setMessages(prev => [...prev.slice(-6), { id: Date.now() + Math.random(), who, text, card }])
  }

  const handleIntentExecution = (intent, rawText) => {
    const text = rawText || ''
    playSfx('sparkle')

    if (intent === 'habito') {
      const m = /(?:habito|habit)(?:\s+(?:de|:|nuevo))?\s*(.+)$/i.exec(text)
      const hName = (m && m[1]?.trim()) || 'Nuevo hábito'
      createHabit({
        name: hName.replace(/^(de|nuevo|:)\s+/i, '').slice(0, 36),
        time: '09:00',
        freq: 'Todos los dias',
        days: [1, 1, 1, 1, 1, 1, 1],
      })
      const reply = `Hábito "${hName}" creado con éxito. Ya puedes verlo en tus tarjetas de Hoy.`
      setBubble(reply)
      pushMessage('rockie', reply, {
        title: 'Hábito creado',
        sub: hName,
        action: () => navigate('/hoy'),
        cta: 'Ver en Hoy',
      })
    } else if (intent === 'tarea') {
      const m = /(?:tarea|task)(?:\s+(?:de|:|nueva))?\s*(.+)$/i.exec(text)
      const tTitle = (m && m[1]?.trim()) || 'Nueva tarea'
      addTask({
        title: tTitle.slice(0, 40),
        priority: /urgente/i.test(text) ? 'urgente' : 'normal',
        due: hoyISO(0),
      })
      const reply = `Tarea "${tTitle}" asignada a tu proyecto y sincronizada con tus tarjetas de Hoy.`
      setBubble(reply)
      pushMessage('rockie', reply, {
        title: 'Tarea creada',
        sub: tTitle,
        action: () => navigate('/hoy'),
        cta: 'Ver en Hoy',
      })
    } else if (intent === 'meta') {
      const m = /(?:meta|goal|objetivo)(?:\s+(?:de|:|nueva))?\s*(.+)$/i.exec(text)
      const mTitle = (m && m[1]?.trim()) || 'Nueva meta'
      createMeta({
        name: mTitle.slice(0, 36),
        deadline: '30 dias',
        color: 'var(--coral)',
      })
      const reply = `Meta "${mTitle}" activada. Todo gran proyecto empieza con constancia.`
      setBubble(reply)
      pushMessage('rockie', reply, {
        title: 'Meta activada',
        sub: mTitle,
        action: () => navigate('/hoy'),
        cta: 'Ver progreso',
      })
    } else if (intent === 'junta') {
      setMeetTitle('Sincronización de equipo')
      setShowMeetingModal(true)
      setBubble('Abriendo programador de junta. Cuéntame con quién y a qué hora.')
    } else if (intent === 'proyecto') {
      setShowProjectModal(true)
      setBubble('Dime el nombre del nuevo proyecto o espacio de trabajo.')
    } else if (intent === 'validar') {
      setBubble('¡A sellar la victoria de hoy! Vamos a tus tarjetas.')
      setTimeout(() => navigate('/hoy'), 600)
    } else {
      const fallback = '¡Te escucho! Puedo crear hábitos, tareas de proyectos, juntas o metas.'
      setBubble(fallback)
      pushMessage('rockie', fallback)
    }
  }

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setTalking(true)
      setBubble('Escuchando por voz (modo demostración)...')
      setTimeout(() => {
        setTalking(false)
        const samplePhrases = [
          'Crear hábito de meditar 10 minutos',
          'Añadir tarea revisar propuesta con prioridad urgente',
          'Agendar junta con el equipo',
          'Crear proyecto tesis final',
          'Quiero validar mi hábito con foto',
        ]
        const picked = samplePhrases[Math.floor(Math.random() * samplePhrases.length)]
        pushMessage('user', picked)
        const intent = detectIntent(picked)
        handleIntentExecution(intent, picked)
      }, 1400)
      return
    }

    try {
      const recog = new SpeechRecognition()
      recognitionRef.current = recog
      recog.lang = 'es-ES'
      recog.interimResults = false
      recog.maxAlternatives = 1

      recog.onstart = () => {
        setTalking(true)
        setBubble('Te escucho con atención...')
      }

      recog.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript || ''
        setTalking(false)
        if (transcript) {
          pushMessage('user', transcript)
          const intent = detectIntent(transcript)
          handleIntentExecution(intent, transcript)
        }
      }

      recog.onerror = () => {
        setTalking(false)
        setBubble('No te alcancé a oír. Puedes usar los chips o intentar de nuevo.')
      }

      recog.onend = () => {
        setTalking(false)
      }

      recog.start()
    } catch (err) {
      setTalking(false)
    }
  }

  const stopVoice = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
    }
    setTalking(false)
  }

  const onChipClick = (chipId) => {
    const prompts = {
      meta: 'Quiero crear una nueva meta: leer 20 páginas diarias',
      habito: 'Crear hábito de tomar 2L de agua',
      proyecto: 'Crear proyecto de Lanzamiento',
      junta: 'Agendar junta con el equipo',
      tarea: 'Añadir tarea de preparar prototipo',
      validar: 'Quiero validar mis acciones de hoy',
    }
    const txt = prompts[chipId] || chipId
    pushMessage('user', txt)
    handleIntentExecution(chipId, txt)
  }

  const confirmMeeting = () => {
    addTask({
      title: `Junta: ${meetTitle || 'Reunión'}`,
      due: hoyISO(0),
      priority: 'urgente',
      note: meetWhen,
    })
    setShowMeetingModal(false)
    playSfx('unlock')
    const reply = `Junta "${meetTitle}" agendada para ${meetWhen} con ${meetWith}. Sincronizada con el calendario.`
    setBubble(reply)
    pushMessage('rockie', reply, {
      title: 'Junta programada',
      sub: meetWhen,
      action: () => navigate('/hoy'),
      cta: 'Ver en Hoy',
    })
  }

  const confirmProject = () => {
    if (projectName.trim()) {
      updateSpace({ name: projectName.trim() })
      playSfx('unlock')
      const reply = `Proyecto "${projectName}" creado. Ya puedes sumarle tareas por voz.`
      setBubble(reply)
      pushMessage('rockie', reply, {
        title: 'Proyecto creado',
        sub: projectName,
        action: () => window.location.assign('/proyectos'),
        cta: 'Abrir Proyecto',
      })
    }
    setShowProjectModal(false)
    setProjectName('')
  }

  return (
    <div style={{ width: '100%', padding: 'var(--space-2) var(--screen-x)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Burbuja flotante de diálogo de Rockie */}
      <motion.div
        layout
        className="card"
        style={{
          background: 'var(--card)',
          borderRadius: 18,
          padding: 'var(--space-3) var(--space-4)',
          border: '2px solid var(--card-line)',
          boxShadow: '0 3px 0 var(--card-edge)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: talking ? 'var(--coral)' : 'var(--olive)' }} />
          <span className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 800, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {talking ? 'Rockie escuchando' : 'Rockie Companion'}
          </span>
        </div>
        <div className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.35 }}>
          {bubble}
        </div>
      </motion.div>

      {/* Chips de acciones rápidas */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {chips.map(c => (
          <motion.button
            key={c.id}
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onChipClick(c.id)}
            className="q"
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--card)',
              border: '2px solid var(--card-line)',
              boxShadow: '0 2px 0 var(--card-edge)',
              color: 'var(--ink)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <i className={`ti ${c.icon}`} style={{ color: 'var(--coral)' }} />
            {c.label}
          </motion.button>
        ))}
      </div>

      {/* Historial interactivo reciente */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
          {messages.map(m => (
            <div
              key={m.id}
              style={{
                alignSelf: m.who === 'user' ? 'flex-end' : 'flex-start',
                background: m.who === 'user' ? 'var(--brand)' : 'var(--card)',
                color: m.who === 'user' ? '#fff' : 'var(--ink)',
                borderRadius: 14,
                padding: '7px 12px',
                fontSize: 'var(--text-2xs)',
                fontWeight: 600,
                maxWidth: '85%',
                boxShadow: '0 2px 0 var(--card-edge)',
              }}
            >
              {m.text}
              {m.card && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--text-3xs)' }}>{m.card.title}</div>
                    <div style={{ fontSize: 'var(--text-3xs)', opacity: 0.8 }}>{m.card.sub}</div>
                  </div>
                  <button
                    type="button"
                    onClick={m.card.action}
                    className="q"
                    style={{
                      border: 'none',
                      borderRadius: 8,
                      background: 'var(--olive)',
                      color: '#fff',
                      padding: '4px 8px',
                      fontSize: 'var(--text-3xs)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {m.card.cta}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dock de Hablar por voz */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {talking && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: 24 }}>
            {[14, 24, 10, 20, 16, 26, 12, 22, 18, 12, 24, 8].map((h, i) => (
              <motion.b
                key={i}
                animate={{ height: [6, h, 6] }}
                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.05 }}
                style={{ width: 3, borderRadius: 2, background: 'var(--coral)', display: 'block' }}
              />
            ))}
          </div>
        )}
        <motion.button
          type="button"
          whileTap={{ y: 3 }}
          onClick={talking ? stopVoice : startVoice}
          className="q btn"
          style={{
            width: '100%',
            height: 52,
            borderRadius: 16,
            background: talking ? 'var(--coral)' : 'var(--brand)',
            boxShadow: `0 4px 0 ${talking ? 'var(--coral-edge)' : 'var(--brand-edge)'}`,
            border: 'none',
            color: '#fff',
            fontSize: 'var(--text-sm)',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <i className={talking ? 'ti ti-player-stop' : 'ti ti-microphone'} style={{ fontSize: 20 }} />
          {talking ? 'Detener y procesar' : 'Hablar con Rockie'}
        </motion.button>
      </div>

      {/* Modal Sheet para Agendar Junta */}
      <AnimatePresence>
        {showMeetingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 90,
              display: 'flex',
              alignItems: 'flex-end',
            }}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              style={{
                width: '100%',
                background: 'var(--paper)',
                borderRadius: '24px 24px 0 0',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
                Agendar Junta
              </div>
              <input
                className="q"
                type="text"
                placeholder="Título de la junta..."
                value={meetTitle}
                onChange={e => setMeetTitle(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: '2px solid var(--card-line)',
                  padding: '0 12px',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                }}
              />
              <input
                className="q"
                type="text"
                placeholder="¿Cuándo? (ej. Hoy 18:00)"
                value={meetWhen}
                onChange={e => setMeetWhen(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: '2px solid var(--card-line)',
                  padding: '0 12px',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                }}
              />
              <input
                className="q"
                type="text"
                placeholder="¿Con quién? (ej. Equipo, Sofía)"
                value={meetWith}
                onChange={e => setMeetWith(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: '2px solid var(--card-line)',
                  padding: '0 12px',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowMeetingModal(false)}
                  className="q"
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 12,
                    background: 'var(--card)',
                    border: '2px solid var(--card-line)',
                    color: 'var(--ink-muted)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmMeeting}
                  className="q"
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 12,
                    background: 'var(--olive)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Confirmar Junta
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Sheet para Nuevo Proyecto */}
      <AnimatePresence>
        {showProjectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 90,
              display: 'flex',
              alignItems: 'flex-end',
            }}
          >
            <motion.div
              initial={{ y: 250 }}
              animate={{ y: 0 }}
              exit={{ y: 250 }}
              style={{
                width: '100%',
                background: 'var(--paper)',
                borderRadius: '24px 24px 0 0',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
                Nuevo Proyecto / Espacio
              </div>
              <input
                className="q"
                type="text"
                placeholder="Nombre del proyecto (ej. Tesis, Viaje Cusco)..."
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: '2px solid var(--card-line)',
                  padding: '0 12px',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="q"
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 12,
                    background: 'var(--card)',
                    border: '2px solid var(--card-line)',
                    color: 'var(--ink-muted)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmProject}
                  className="q"
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 12,
                    background: 'var(--brand)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Crear Proyecto
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

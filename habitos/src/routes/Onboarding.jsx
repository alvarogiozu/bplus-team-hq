import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { resetCoach, markCoachSeen } from '../components/GestureCoach.jsx'
import Rockie from '../components/Rockie.jsx'
import Confetti from '../components/Confetti.jsx'
import './Onboarding.css'

// ============================================================================
// ONBOARDING v3 — cuestionario corto, sin slides y sin formulario de habitos.
// Feedback beta: los slides se leian a la carrera y el usuario aterrizaba
// perdido; ahora el tutorial REAL vive dentro de la app (GestureCoach en modo
// spotlight: oscurece todo menos el boton que toca presionar y avanza SOLO
// cuando el usuario hace la accion). Aqui solo preguntamos lo minimo para
// adaptar la app:
//   1. vidaMode  — 'areas' (mapa completo Cuerpo/Mente/Alma) o 'metas'
//                  (sin capa de areas). Cambiable en Ajustes cuando quiera.
//   2. compania  — 'solo' | 'juntos' (tiñe el tutorial con el paso de Juntos).
// Todo a ritmo del usuario: nada avanza sin que toque.
// ============================================================================

// Caras validas de Rockie (ojos 1-7, boca 1-8)
const CARA = {
  splash: { eyes: 4, mouth: 6 },   // curioso
  uso: { eyes: 1, mouth: 6 },      // atento
  compania: { eyes: 1, mouth: 7 }, // feliz
  listo: { eyes: 6, mouth: 7 },    // celebrando
}

const OPCIONES_USO = [
  {
    id: 'areas', icon: 'ti-circles', color: 'var(--olive)', edge: 'var(--olive-edge)',
    titulo: 'Equilibrar mi vida',
    desc: 'El mapa completo: areas (Cuerpo, Mente, Alma) con tus metas y habitos dentro.',
  },
  {
    id: 'metas', icon: 'ti-target-arrow', color: 'var(--azure)', edge: 'var(--azure-edge)',
    titulo: 'Lograr metas concretas',
    desc: 'Directo al grano: solo tus metas y los habitos que las alimentan. Sin areas.',
  },
]

const OPCIONES_COMPANIA = [
  {
    id: 'solo', icon: 'ti-user', color: 'var(--coral)', edge: 'var(--coral-edge)',
    titulo: 'A mi ritmo',
    desc: 'Mi progreso es personal: yo y mi Rockie.',
  },
  {
    id: 'juntos', icon: 'ti-heart-handshake', color: 'var(--berry)', edge: 'var(--berry-edge)',
    titulo: 'Con mas gente',
    desc: 'Grupos y retos donde todos se ven: si el equipo cumple, todos ganan.',
  },
]

// Tarjeta de opcion grande (una decision por pantalla, tocable con el pulgar)
function OpcionCard({ opt, on, onPick }) {
  return (
    <motion.button
      type="button"
      onClick={() => onPick(opt.id)}
      whileTap={{ scale: 0.98 }}
      className="q"
      aria-pressed={on}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'left',
        width: '100%', minHeight: 'var(--tap-min)', padding: 'var(--space-4)', cursor: 'pointer',
        borderRadius: 'var(--r-lg)',
        background: 'var(--card)',
        border: on ? `2.5px solid ${opt.color}` : '2px solid var(--card-line)',
        boxShadow: on ? `0 3px 0 ${opt.edge}` : '0 3px 0 var(--card-edge)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <span style={{
        width: 48, height: 48, borderRadius: 'var(--r-md)', flexShrink: 0,
        background: `color-mix(in srgb, ${opt.color} 16%, var(--card))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <i className={`ti ${opt.icon}`} style={{ fontSize: 'var(--text-2xl)', color: opt.color }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="q" style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink)' }}>{opt.titulo}</span>
        <span className="q" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.45 }}>{opt.desc}</span>
      </span>
      <i
        className={`ti ${on ? 'ti-circle-check-filled' : 'ti-circle'}`}
        style={{ fontSize: 'var(--text-xl)', color: on ? opt.color : 'var(--ink-faint)', flexShrink: 0 }}
      />
    </motion.button>
  )
}

// Cambio de fase: solo translateX (sin opacity:0 = sin flash en movil).
function Fase({ k, children }) {
  return (
    <motion.div
      key={k}
      initial={{ x: 28 }}
      animate={{ x: 0 }}
      exit={{ x: -20 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 'var(--space-6) var(--space-6) 0' }}
      className="onboarding-fase onboarding-inner"
    >
      {children}
    </motion.div>
  )
}

const PASOS = ['uso', 'compania', 'listo']

export default function Onboarding() {
  const navigate = useNavigate()
  const { setSeenOnboarding, setPref } = useStore()
  const [fase, setFase] = useState('splash')  // splash | uso | compania | listo
  const [modo, setModo] = useState('areas')
  const [compania, setCompania] = useState('solo')

  const pasoIdx = PASOS.indexOf(fase)
  const usoElegido = OPCIONES_USO.find(o => o.id === modo)

  // Guardar respuestas y entrar. conTutorial=true deja al coach spotlight
  // esperando en /hoy (borra sus flags); false = explorar sin acompanamiento.
  const finish = (conTutorial) => {
    setPref('vidaMode', modo)
    setPref('compania', compania)
    if (conTutorial) resetCoach()
    else markCoachSeen()
    setSeenOnboarding(true)
    navigate('/hoy')
  }

  // ---- Acto 0: splash (primera impresion) ----
  if (fase === 'splash') {
    return (
      <div className="scroll-area onboarding-splash" style={{ background: 'var(--paper)' }}>
        <div className="onboarding-splash-col">
          <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
            <Rockie emotion={CARA.splash} size={150} still />
          </motion.div>
        </div>
        <div className="onboarding-splash-col onboarding-splash-col--cta">
          <motion.div initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.12, duration: 0.28 }} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontSize: 64, fontWeight: 900, color: 'var(--brand-logo)', fontFamily: 'Georgia, serif', lineHeight: 1, letterSpacing: -2 }}>B</span>
            <span style={{ fontSize: 50, fontWeight: 900, color: 'var(--brand-logo)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>+</span>
          </motion.div>
          <motion.div initial={{ y: 8 }} animate={{ y: 0 }} transition={{ delay: 0.2, duration: 0.28 }} className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase', marginTop: 'var(--space-3)' }}>Turn habits into real-life wins</motion.div>
          <motion.button initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.28, duration: 0.28 }} onClick={() => setFase('uso')} className="q gbtn" style={{ marginTop: 'var(--space-12)', width: '100%', padding: 'var(--space-4)', background: 'var(--brand-logo)', color: '#fff', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-lg)', fontWeight: 700, '--edge': 'var(--brand-logo-edge)' }}>Empezar →</motion.button>
        </div>
      </div>
    )
  }

  // ---- Cuestionario: 2 preguntas + puerta de entrada, a ritmo del usuario ----
  return (
    <div className="scroll-area onboarding-body" style={{ background: 'var(--paper)' }}>
      {/* Cabecera: atras + puntitos de paso (el usuario nunca esta perdido) */}
      <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-4) var(--space-4) 0' }}>
        <button
          type="button"
          onClick={() => { if (fase === 'uso') setFase('splash'); else if (fase === 'compania') setFase('uso'); else setFase('compania') }}
          aria-label="Atras"
          className="q"
          style={{ width: 'var(--tap-min)', height: 'var(--tap-min)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 'var(--text-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        ><i className="ti ti-arrow-left" /></button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 'var(--space-1)' }}>
          {PASOS.map((p, i) => (
            <span key={p} style={{ height: 8, borderRadius: 4, width: i === pasoIdx ? 28 : 8, background: i <= pasoIdx ? 'var(--brand-logo)' : 'var(--paper-dark)', transition: 'all 0.3s' }} />
          ))}
        </div>
        <div style={{ width: 'var(--tap-min)' }} />
      </div>

      <AnimatePresence mode="wait">
        {/* PREGUNTA 1 — como quiere usar la app (adapta areas vs solo metas) */}
        {fase === 'uso' && (
          <Fase k="uso">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
              <Rockie emotion={CARA.uso} size={100} still />
            </div>
            <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)', textAlign: 'center', lineHeight: 1.25 }}>¿Cómo quieres usar B+?</div>
            <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', textAlign: 'center', marginTop: 'var(--space-2)', lineHeight: 1.6 }}>
              Para armar la app a tu medida.<br />Lo cambias cuando quieras en Ajustes.
            </div>
            <div className="onboarding-options onboarding-options--grid" style={{ marginTop: 'var(--space-5)' }}>
              {OPCIONES_USO.map((o) => (
                <OpcionCard key={o.id} opt={o} on={modo === o.id} onPick={setModo} />
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ padding: 'var(--space-6) 0 calc(var(--space-8) + env(safe-area-inset-bottom))' }}>
              <button
                onClick={() => setFase('compania')}
                className="q gbtn"
                style={{ width: '100%', padding: 15, color: '#fff', background: usoElegido.color, borderRadius: 'var(--r-pill)', fontSize: 'var(--text-md)', fontWeight: 700, '--edge': usoElegido.edge, transition: 'background 0.3s' }}
              >Continuar →</button>
            </div>
          </Fase>
        )}

        {/* PREGUNTA 2 — solo o acompanado (tiñe el tutorial, no la estructura) */}
        {fase === 'compania' && (
          <Fase k="compania">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
              <Rockie emotion={CARA.compania} size={100} still />
            </div>
            <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)', textAlign: 'center', lineHeight: 1.25 }}>¿Solo o acompañado?</div>
            <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', textAlign: 'center', marginTop: 'var(--space-2)', lineHeight: 1.6 }}>
              Los hábitos crecen distinto con testigos.<br />B+ funciona de las dos formas.
            </div>
            <div className="onboarding-options onboarding-options--grid" style={{ marginTop: 'var(--space-5)' }}>
              {OPCIONES_COMPANIA.map((o) => (
                <OpcionCard key={o.id} opt={o} on={compania === o.id} onPick={setCompania} />
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ padding: 'var(--space-6) 0 calc(var(--space-8) + env(safe-area-inset-bottom))' }}>
              <button
                onClick={() => setFase('listo')}
                className="q gbtn"
                style={{ width: '100%', padding: 15, color: '#fff', background: 'var(--brand-logo)', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-md)', fontWeight: 700, '--edge': 'var(--brand-logo-edge)' }}
              >Continuar →</button>
            </div>
          </Fase>
        )}

        {/* PUERTA DE ENTRADA — resumen + promesa del tutorial acompañado */}
        {fase === 'listo' && (
          <Fase k="listo">
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ position: 'relative' }}>
                <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
                  <Rockie emotion={CARA.listo} size={140} still />
                </motion.div>
                <div style={{ position: 'absolute', left: '50%', top: '40%' }}>
                  <Confetti count={16} radius={85} />
                </div>
              </div>
              <motion.div
                initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.12, duration: 0.28 }}
                className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--ink)', marginTop: 'var(--space-5)' }}
              >Tu B+ está listo</motion.div>
              <motion.div
                initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.18, duration: 0.28 }}
                style={{ marginTop: 'var(--space-5)', padding: 'var(--space-4)', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--card)', border: '2px solid var(--card-line)', borderLeft: `3px solid ${usoElegido.color}`, borderRadius: 'var(--r-lg)', boxShadow: '0 3px 0 var(--card-edge)' }}
              >
                <i className={`ti ${usoElegido.icon}`} style={{ fontSize: 'var(--text-2xl)', color: usoElegido.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)' }}>{usoElegido.titulo}</div>
                  <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 2 }}>
                    {modo === 'areas' ? 'Tu mapa: áreas → metas → hábitos' : 'Tu mapa: metas → hábitos, sin áreas'}
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ y: 8 }} animate={{ y: 0 }} transition={{ delay: 0.24, duration: 0.28 }}
                className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', marginTop: 'var(--space-4)', lineHeight: 1.6 }}
              >
                Adentro, Rockie te acompaña a crear tu primer plan<br />
                <b>haciéndolo tú</b>, paso a paso y a tu ritmo.<br />
                Nada avanza hasta que tú lo hagas.
              </motion.div>
            </div>
            <div style={{ padding: 'var(--space-6) 0 calc(var(--space-8) + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', alignItems: 'center' }}>
              <motion.button
                initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.3, duration: 0.28 }}
                onClick={() => finish(true)}
                className="q gbtn"
                style={{ width: '100%', padding: 15, color: '#fff', background: 'var(--brand-logo)', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-md)', fontWeight: 700, '--edge': 'var(--brand-logo-edge)' }}
              >Entrar con Rockie →</motion.button>
              <button onClick={() => finish(false)} className="q" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-muted)', textDecoration: 'underline' }}>
                Prefiero explorar por mi cuenta
              </button>
            </div>
          </Fase>
        )}
      </AnimatePresence>
    </div>
  )
}

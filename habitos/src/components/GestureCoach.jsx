import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import Rockie from './Rockie.jsx'
import useDesktop from '../lib/useDesktop.js'

// ============================================================================
// TUTORIAL SPOTLIGHT — el usuario APRENDE HACIENDO (feedback beta: los slides
// pasaban solos y no daban tiempo a leer; esto NO tiene timers).
//
// Como funciona:
//  - Todo se oscurece MENOS el elemento que toca presionar (hueco recortado
//    sobre [data-coach="..."]). Los bloqueadores comen los taps de alrededor.
//  - Cada paso avanza cuando el usuario HACE la accion (cambio de ruta o de
//    datos del store), no por tiempo. Los pasos informativos tienen boton
//    "Entendido": cada quien lee a su ritmo.
//  - Si se abre un sheet (CrearMetaFlow marca [data-coach-pause]) el tutorial
//    se aparta solo y vuelve al cerrar.
//  - El paso actual persiste en localStorage: recargar no reinicia.
//  - Siempre saltable (tutorial entero o paso individual).
//
// El guion depende del cuestionario del onboarding: prefs.vidaMode ('areas'
// pasa por la rueda; 'metas' va directo) y prefs.compania ('juntos' agrega
// el paso de la pestana Juntos).
// ============================================================================

const KEY = 'bplus.seenGestureCoach'
const STEP_KEY = 'bplus.coachStep'
const OPEN_EVT = 'bplus:open-tutorial'

export function shouldShowGestureCoach() {
  try { return localStorage.getItem(KEY) !== '1' } catch { return false }
}
// Reabrir desde Ajustes: borra flags y avisa al AppShell (montado) que lo muestre
export function openGestureCoach() {
  resetCoach()
  window.dispatchEvent(new CustomEvent(OPEN_EVT))
}
export function subscribeOpenGestureCoach(fn) {
  window.addEventListener(OPEN_EVT, fn)
  return () => window.removeEventListener(OPEN_EVT, fn)
}
// Deja el tutorial "armado" desde cero (lo usa el onboarding al terminar)
export function resetCoach() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(STEP_KEY)
  } catch { /* sin almacenamiento */ }
}
export function markCoachSeen() {
  try {
    localStorage.setItem(KEY, '1')
    localStorage.removeItem(STEP_KEY)
  } catch { /* sin almacenamiento */ }
}

// ---- Guion. tipo 'card' = tarjeta centrada con boton (lee a su ritmo);
//      tipo 'spot' = hueco de luz sobre targets[] (data-coach), avanza con
//      done(ctx) o con cta manual. route = donde vive el paso (si el usuario
//      se va, aparece el chip de "sigamos"). round = hueco circular (FAB).
// desk = PC: se habla de clics y atajos, no de gestos; y el paso "toca Metas"
// sobra (en PC la lista de metas ya esta a la vista junto a la rueda).
function buildSteps(vidaMode, compania, desk = false) {
  const soloMetas = vidaMode === 'metas'
  const vidaLabel = soloMetas ? 'Metas' : 'Vida'
  return [
    {
      id: 'hola', tipo: 'card', cara: { eyes: 4, mouth: 6 }, color: 'var(--amber)',
      titulo: 'Hola, soy Rockie',
      texto: 'Te acompaño a armar tu primer plan haciendolo TU. Yo ilumino el camino y espero: nada avanza hasta que tu lo toques. Tomate tu tiempo.',
      cta: 'Vamos',
    },
    {
      id: 'vida', tipo: 'spot', targets: ['nav-vida'], color: 'var(--olive)',
      titulo: `Toca ${vidaLabel}`,
      texto: soloMetas
        ? 'En esa pestana viven tus metas y tus habitos.'
        : 'En esa pestana vive tu mapa: Areas, Metas y Habitos.',
      done: (ctx) => ctx.pathname.startsWith('/metas'),
    },
    // Celular y PC muestran el mapa y las metas en la misma pagina: sin paso
    // "toca Metas", de la rueda se pasa directo a crear la primera meta.
    ...(!soloMetas ? [
      {
        id: 'areas', tipo: 'spot', targets: ['rueda-areas'], route: '/metas/areas', color: 'var(--olive)',
        titulo: 'Tu rueda de la vida',
        texto: 'Cuerpo, Mente y Alma son tus areas. Cada meta alimentara una, y aqui veras como florece cada pedazo de tu vida.',
        cta: 'Entendido',
      },
    ] : []),
    {
      id: 'meta', tipo: 'spot', targets: ['crear-meta', 'crear'], route: '/metas', color: 'var(--olive)',
      titulo: 'Crea tu primera meta',
      texto: 'Algo que quieras lograr, en una frase. Adentro eliges tambien los habitos que te llevan ahi. Yo te espero aqui afuera.',
      done: (ctx) => ctx.metas > ctx.metasBase,
    },
    {
      id: 'meta-ok', tipo: 'card', cara: { eyes: 6, mouth: 7 }, color: 'var(--olive)',
      titulo: '¡Tu plan esta vivo!',
      texto: 'Meta declarada y habitos enlazados. Cada vez que cumplas un habito, tu meta avanza sola.',
      cta: 'Siguiente',
    },
    {
      id: 'hoy', tipo: 'spot', targets: ['fab-hoy'], round: true, color: 'var(--brand)',
      titulo: 'Toca Hoy',
      texto: desk
        ? 'En el menú de la izquierda. Ahí vive la mesa de tu día: tus hábitos en orden y el que toca ahora, en grande.'
        : 'El boton redondo. Ahi aparecen las cartas de tus habitos de cada dia.',
      done: (ctx) => ctx.pathname.startsWith('/hoy'),
    },
    {
      id: 'gestos', tipo: 'card', route: '/hoy', cara: { eyes: 1, mouth: 6 }, color: 'var(--green)',
      titulo: 'Asi se vive Hoy',
      gestos: desk ? [
        { icon: 'ti-camera', color: 'var(--green)', txt: 'Valida con un clic. Con foto vale más (la IA la confirma): también puedes soltarla o pegarla con Ctrl+V' },
        { icon: 'ti-hand-stop', color: 'var(--coral)', txt: '«Hoy no puede ser» la aplaza sin romper tu racha' },
        { icon: 'ti-keyboard', color: 'var(--berry)', txt: 'Atajos: flechas para moverte, F foto, H hecho, A aplazar' },
      ] : [
        { icon: 'ti-arrow-big-up', color: 'var(--green)', txt: 'Desliza la carta hacia ARRIBA para validar (con foto vale mas: la IA la confirma)' },
        { icon: 'ti-arrow-big-down', color: 'var(--coral)', txt: 'Hacia ABAJO la aplazas sin romper tu racha' },
        { icon: 'ti-hand-click', color: 'var(--berry)', txt: 'MANTEN presionada la carta para editarla' },
      ],
      cta: 'Entendido',
    },
    ...(compania === 'juntos' ? [
      {
        id: 'juntos', tipo: 'spot', targets: ['nav-juntos'], color: 'var(--berry)',
        titulo: 'Toca Juntos',
        texto: 'Dijiste que esto va en equipo: aqui viven tus amigos, grupos y retos. Si todos cumplen, todos ganan.',
        done: (ctx) => ctx.pathname.startsWith('/juntos'),
      },
    ] : []),
    {
      id: 'progreso', tipo: 'spot', targets: ['nav-progreso'], color: 'var(--coral)',
      titulo: 'Toca Progreso',
      texto: 'Tu mapa vivo: yo al centro y tus metas creciendo alrededor.',
      done: (ctx) => ctx.pathname.startsWith('/progreso'),
    },
    {
      id: 'fin', tipo: 'card', route: '/progreso', cara: { eyes: 6, mouth: 7 }, color: 'var(--amber)',
      titulo: 'Es todo tuyo',
      texto: 'Cumple, sube tu prueba y mirame crecer contigo. En Ajustes puedes repetir este tutorial y cambiar entre modo Areas y modo Metas cuando quieras.',
      cta: '¡A darle!',
    },
  ]
}

const SCRIM = 'rgba(24, 20, 35, 0.66)'
const PAD = 6 // aire alrededor del elemento iluminado

export default function GestureCoach({ onClose }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { metas, prefs } = useStore()
  const desk = useDesktop()
  // Guion congelado al montar (cambiar prefs a mitad no debe descolocar pasos)
  const [steps] = useState(() => buildSteps(prefs.vidaMode, prefs.compania, desk))
  const [idx, setIdx] = useState(() => {
    try {
      const saved = localStorage.getItem(STEP_KEY)
      const i = steps.findIndex(s => s.id === saved)
      return i >= 0 ? i : 0
    } catch { return 0 }
  })
  const [spot, setSpot] = useState(null)     // hueco {x,y,w,h} relativo al overlay
  const [paused, setPaused] = useState(false) // hay un sheet abierto encima
  const rootRef = useRef(null)
  const metasBase = useRef(metas.length)

  const step = steps[idx]

  const finish = (irAHoy) => {
    markCoachSeen()
    if (irAHoy) navigate('/hoy')
    onClose()
  }
  const next = () => {
    setIdx(i => {
      if (i >= steps.length - 1) { finish(true); return i }
      return i + 1
    })
  }

  // Entrada a un paso: fijar linea base de metas, persistir, y si el paso vive
  // en otra ruta, llevar al usuario (solo pasos de contexto; los de accion
  // apuntan a la barra, que siempre esta visible).
  useEffect(() => {
    metasBase.current = metas.length
    try { localStorage.setItem(STEP_KEY, step.id) } catch { /* sin almacenamiento */ }
    if (step.tipo === 'card' && step.route && !pathname.startsWith(step.route)) {
      navigate(step.route, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  // La accion del usuario completa el paso (ruta o datos): avanzar con un
  // respiro corto para que la transicion de pagina asiente.
  useEffect(() => {
    if (!step?.done) return
    const ctx = { pathname, metas: metas.length, metasBase: metasBase.current }
    if (step.done(ctx)) {
      const t = setTimeout(next, 380)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, metas.length, idx])

  // Medir el elemento iluminado (poll suave: aguanta transiciones de pagina,
  // resize y el shell de escritorio) + detectar sheets abiertos (pausa).
  useEffect(() => {
    const tick = () => {
      const pause = !!document.querySelector('[data-coach-pause]')
      setPaused(p => (p === pause ? p : pause))
      if (step.tipo !== 'spot' || pause) return
      const root = rootRef.current?.getBoundingClientRect()
      if (!root) return
      let r = null
      for (const t of step.targets) {
        for (const el of document.querySelectorAll(`[data-coach="${t}"]`)) {
          const b = el.getBoundingClientRect()
          // El overlay cubre TODA la ventana (portal a body), asi que tambien
          // vale un objetivo del rail de escritorio, fuera del telefono.
          if (b.width > 0 && b.height > 0) { r = b; break }
        }
        if (r) break
      }
      if (!r) { setSpot(s => (s === null ? s : null)); return }
      const nx = { x: r.left - root.left - PAD, y: r.top - root.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
      setSpot(s => (
        s && Math.abs(s.x - nx.x) < 1 && Math.abs(s.y - nx.y) < 1 && Math.abs(s.w - nx.w) < 1 && Math.abs(s.h - nx.h) < 1
          ? s : nx
      ))
    }
    tick()
    const iv = setInterval(tick, 250)
    window.addEventListener('resize', tick)
    return () => { clearInterval(iv); window.removeEventListener('resize', tick) }
  }, [idx, pathname, step])

  // Sheet abierto (CrearMetaFlow): el tutorial se aparta y espera su condicion
  if (paused) return null

  // Paso ya completado (esperando el respiro antes de avanzar): no ensenar el
  // chip de "sigamos" aunque la ruta ya sea otra.
  const completado = !!step.done?.({ pathname, metas: metas.length, metasBase: metasBase.current })
  const fueraDeRuta = !completado && step.tipo === 'spot' && step.route && !pathname.startsWith(step.route)

  // Chip flotante si el usuario se fue de la ruta del paso (boton atras, etc.)
  if (fueraDeRuta) {
    return createPortal(
      <motion.div
        ref={rootRef} data-gesture-coach
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', left: 0, right: 0, bottom: desk ? 'var(--space-6)' : 'calc(96px + env(safe-area-inset-bottom))', paddingLeft: desk ? 240 : 0, zIndex: 200, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
      >
        <button
          type="button"
          onClick={() => navigate(step.route)}
          className="q gbtn"
          style={{ pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 'var(--tap-min)', padding: '0 var(--space-4)', background: 'var(--brand)', color: '#fff', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-sm)', fontWeight: 700, '--edge': 'var(--brand-edge)' }}
        >
          <i className="ti ti-sparkles" /> Sigamos el tutorial
        </button>
      </motion.div>,
      document.body,
    )
  }

  const linkSaltar = (
    <button
      type="button"
      onClick={() => finish(false)}
      className="q"
      style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-muted)', textDecoration: 'underline', padding: 'var(--space-2) 0', minHeight: 'var(--tap-min)' }}
    >Saltar tutorial</button>
  )
  const contador = (
    <span className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-faint)', letterSpacing: 1 }}>
      {idx + 1}/{steps.length}
    </span>
  )

  // ---- Tarjeta centrada (pasos informativos, a ritmo del usuario) ----
  if (step.tipo === 'card') {
    return createPortal(
      <motion.div
        ref={rootRef} data-gesture-coach
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: SCRIM, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5) var(--screen-x)', touchAction: 'none' }}
      >
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
          style={{ width: '100%', maxWidth: 340, background: 'var(--card)', border: '2px solid var(--card-line)', borderRadius: 'var(--r-xl, 20px)', boxShadow: '0 4px 0 var(--card-edge), var(--shadow-card)', padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Rockie emotion={step.cara} size={96} float />
          </div>
          <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)', marginTop: 'var(--space-3)', lineHeight: 1.2 }}>{step.titulo}</div>
          {step.texto ? (
            <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', marginTop: 'var(--space-3)', lineHeight: 1.6 }}>{step.texto}</div>
          ) : null}
          {step.gestos && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)', textAlign: 'left' }}>
              {step.gestos.map(g => (
                <div key={g.icon} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ width: 38, height: 38, borderRadius: 'var(--r-sm, 10px)', flexShrink: 0, background: `color-mix(in srgb, ${g.color} 16%, var(--card))`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ${g.icon}`} style={{ fontSize: 'var(--text-lg)', color: g.color }} />
                  </span>
                  <span className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.45 }}>{g.txt}</span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={next}
            className="q gbtn"
            style={{ marginTop: 'var(--space-5)', width: '100%', minHeight: 'var(--tap-min)', padding: 'var(--space-3)', background: step.color, color: '#fff', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-md)', fontWeight: 700, '--edge': 'var(--edge-soft)' }}
          >{step.cta} →</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
            {linkSaltar}
            {contador}
          </div>
        </motion.div>
      </motion.div>,
      document.body,
    )
  }

  // ---- Spotlight: 4 bloqueadores oscuros + anillo + tarjeta guia ----
  const root = rootRef.current?.getBoundingClientRect()
  const rootH = root?.height || 0
  const rootW = root?.width || 0
  const abajo = spot ? spot.y + spot.h / 2 < rootH * 0.55 : false // tarjeta debajo si el hueco esta arriba
  const bloqueador = { position: 'absolute', background: SCRIM, pointerEvents: 'auto', touchAction: 'none' }
  // La guia se ancla al hueco tambien en horizontal (en PC el overlay es toda
  // la ventana: estirarla de borde a borde la dejaba lejisimos del objetivo)
  const tipW = Math.min(360, Math.max(240, rootW - 32))
  const tipLeft = spot
    ? Math.max(16, Math.min(spot.x + spot.w / 2 - tipW / 2, rootW - tipW - 16))
    : Math.max(16, rootW / 2 - tipW / 2)

  return createPortal(
    <motion.div
      ref={rootRef} data-gesture-coach
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none' }}
    >
      {spot ? (
        <>
          {/* Bloqueadores: todo lo que NO es el objetivo queda oscuro y sin taps */}
          <div style={{ ...bloqueador, left: 0, top: 0, right: 0, height: Math.max(0, spot.y) }} />
          <div style={{ ...bloqueador, left: 0, top: spot.y + spot.h, right: 0, bottom: 0 }} />
          <div style={{ ...bloqueador, left: 0, top: spot.y, width: Math.max(0, spot.x), height: spot.h }} />
          <div style={{ ...bloqueador, left: spot.x + spot.w, top: spot.y, right: 0, height: spot.h }} />
          {/* Anillo que respira sobre el objetivo (el tap pasa: pointerEvents none) */}
          <motion.div
            key={`ring-${step.id}`}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', left: spot.x - 3, top: spot.y - 3, width: spot.w + 6, height: spot.h + 6,
              borderRadius: step.round ? '50%' : 18,
              border: `3px solid ${step.color}`,
              boxShadow: `0 0 0 4px color-mix(in srgb, ${step.color} 30%, transparent)`,
              pointerEvents: 'none',
            }}
          />
        </>
      ) : (
        // El objetivo aun no esta en pantalla (transicion): scrim completo suave
        <div style={{ ...bloqueador, inset: 0 }} />
      )}

      {/* Tarjeta guia: arriba o abajo del hueco, nunca encima */}
      <motion.div
        key={`tip-${step.id}`}
        initial={{ opacity: 0, y: abajo ? 10 : -10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: 'easeOut', delay: 0.1 }}
        style={{
          position: 'absolute', left: tipLeft, width: tipW,
          ...(spot
            ? (abajo ? { top: Math.min(spot.y + spot.h + 16, rootH - 180) } : { bottom: rootH - spot.y + 16 })
            : { top: '50%', transform: 'translateY(-50%)' }),
          background: 'var(--card)', border: '2px solid var(--card-line)', borderRadius: 'var(--r-lg)',
          boxShadow: '0 4px 0 var(--card-edge), var(--shadow-card)', padding: 'var(--space-4)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            <Rockie emotion={{ eyes: 1, mouth: 6 }} size={44} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', lineHeight: 1.25 }}>{step.titulo}</div>
            <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 'var(--space-1)', lineHeight: 1.5 }}>{step.texto}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {linkSaltar}
            {contador}
          </div>
          {step.cta ? (
            <button
              type="button"
              onClick={next}
              className="q gbtn"
              style={{ minHeight: 'var(--tap-min)', padding: '0 var(--space-4)', background: step.color, color: '#fff', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-sm)', fontWeight: 700, '--edge': 'var(--edge-soft)' }}
            >{step.cta} →</button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="q"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)', minHeight: 'var(--tap-min)', padding: '0 var(--space-2)' }}
            >Omitir paso →</button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

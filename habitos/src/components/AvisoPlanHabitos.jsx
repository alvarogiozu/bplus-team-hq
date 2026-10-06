import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { irAPlanes, usePlanHq } from '../lib/planHq.js'
import { cookiesResueltas } from './CookieConsent.jsx'

// El aviso de tu plan dentro de Hábitos (cuando Hábitos está suelto, como en el celular; dentro del escritorio lo
// muestra Rockie OS). Lo mismo que src/features/planes/AvisoPlan.tsx, con el lenguaje visual de Hábitos:
// vence pronto, venció (3 días de gracia) o no se pudo renovar con tu tarjeta. «Renovar» abre Tu plan con la
// renovación lista. Comparte con Rockie OS cuándo lo cerraste (mismo localStorage), así no se repite.

const K = 'rockie.avisos'
const DIA = 864e5
const NOMBRE = { plus: 'Plus', pro: 'Pro' }

const enVentana = () => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
const cerrados = () => {
  try {
    return JSON.parse(localStorage.getItem(K) || '{}')
  } catch {
    return {}
  }
}
const inicio = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
function cuando(iso) {
  const d = new Date(iso)
  const dias = Math.round((inicio(d) - inicio(new Date())) / DIA)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias === -1) return 'ayer'
  return `el ${d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}`
}

function elegir(p) {
  const s = p?.suscripcion
  if (!s?.hasta) return null
  const nombre = NOMBRE[s.plan] ?? 'plan'
  const r = p.renovacion
  if (p.estado !== 'por_vencer' && p.estado !== 'gracia') return null
  if (r?.activa && r.intentos > 0) {
    return { clave: `falla:${s.hasta}:${r.intentos}`, titulo: `No pudimos renovar tu ${nombre}`, texto: `${r.error || 'El banco no aprobó el cobro.'} Renuévalo con Yape u otra tarjeta.` }
  }
  if (r?.activa) return null // se renueva solo: no hace falta molestar aquí
  if (p.estado === 'por_vencer') return { clave: `vence:${s.hasta}`, titulo: `Tu ${nombre} vence ${cuando(s.hasta)}`, texto: 'Renuévalo en dos toques y sigue sin límites.' }
  return { clave: `gracia:${s.hasta}`, titulo: `Tu ${nombre} venció`, texto: `Te lo guardamos hasta ${cuando(s.gracia_hasta ?? s.hasta)}. Renuévalo y no pierdes nada.` }
}

export default function AvisoPlanHabitos() {
  const plan = usePlanHq()
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)
  const [, refrescar] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(t)
  }, [])
  // nunca encima del cuestionario de bienvenida ni del aviso de cookies (que va primero)
  if (!visible || enVentana() || pathname.startsWith('/onboarding') || !cookiesResueltas()) return null
  const a = elegir(plan)
  if (!a || Date.now() - (cerrados()[a.clave] ?? 0) < DIA) return null
  const cerrar = () => {
    try {
      localStorage.setItem(K, JSON.stringify({ ...cerrados(), [a.clave]: Date.now() }))
    } catch {
      /* sin almacenamiento */
    }
    refrescar((n) => n + 1)
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Tu plan"
      style={{
        position: 'fixed', zIndex: 60, left: 'var(--screen-x, 20px)', right: 'var(--screen-x, 20px)',
        bottom: 'calc(var(--mnav-room, 96px) + var(--space-2, 8px))', maxWidth: 440, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4)',
        borderRadius: 'var(--r-lg, 18px)', background: 'var(--card)', color: 'var(--ink)',
        border: '2px solid var(--amber)', boxShadow: '0 4px 0 var(--amber-edge)',
      }}
    >
      <div className="q" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 800, fontSize: 'var(--text-base)' }}>
        <i className="ti ti-sparkles" style={{ color: 'var(--amber)' }} /> {a.titulo}
      </div>
      <div className="q" style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', lineHeight: 1.45 }}>{a.texto}</div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="q gbtn"
          onClick={() => irAPlanes('/planes?renovar=1')}
          style={{
            flex: 1, minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)', background: 'var(--amber)', color: '#fff',
            '--edge': 'var(--amber-edge)', fontWeight: 700, fontSize: 'var(--text-sm)',
          }}
        >
          Renovar
        </button>
        <button
          type="button"
          className="q"
          onClick={cerrar}
          style={{
            flex: 1, minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)', background: 'var(--card)', color: 'var(--ink-soft)',
            border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
          }}
        >
          Ahora no
        </button>
      </div>
    </aside>
  )
}

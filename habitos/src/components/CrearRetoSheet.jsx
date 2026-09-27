import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { typeOf } from '../data/habitTypes.js'
import Segmented from './Segmented.jsx'
import HabitPicker from './HabitPicker.jsx'
import DurationSlider from './DurationSlider.jsx'

// Crear reto (menu + de Amigos, o "+ Reto" dentro de la tarjeta de un grupo:
// `grupoInicial` llega preseleccionado). Panel a pantalla completa que entra
// de derecha a izquierda (igual que Crear grupo).
// Modelo anidado (17 jul 2026): el grupo es la sala y el reto es la actividad
// que corre dentro (o suelta/publica). "Compartido vs compromiso" NO es una
// categoria: es el MODO del reto (este toggle). El habito SIEMPRE sale de TU
// lista (pantalla Habitos): compartido = el habito de todos (se fija aqui);
// compromiso = TU traes el tuyo y cada quien fija el suyo AL UNIRSE.
// Crear AGREGA el reto de verdad (store.createReto) e invita amigos (RPC 0010).

const TIPOS = [
  { id: 'c', icon: '🤝', title: 'Compartido', sub: 'Todos el mismo', fill: 'var(--olive)', edge: 'var(--olive-edge)' },
  { id: 'p', icon: '🎯', title: 'Compromiso', sub: 'Cada quien el suyo', fill: 'var(--berry)', edge: 'var(--berry-edge)' },
]
const VIS_OPTS = [
  { id: 'grupos', label: 'Mis grupos' },
  { id: 'publico', label: 'Publico' },
]

export default function CrearRetoSheet({ onClose, flash, grupoInicial = null }) {
  const { createReto, allHabits, groups, inviteFriends } = useStore()
  const [tipo, setTipo] = useState('c')
  const [habit, setHabit] = useState(null)
  const [dur, setDur] = useState(7)
  const [vis, setVis] = useState('grupos')
  const [grupo, setGrupo] = useState(grupoInicial)
  const [nombre, setNombre] = useState('')
  const [invited, setInvited] = useState(() => new Set())
  const [creando, setCreando] = useState(false)

  const toggleInvite = (id) => {
    setInvited(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const listo = nombre.trim().length > 0 && habit !== null && !creando
  const crear = async () => {
    if (!listo) {
      flash(!nombre.trim() ? 'Ponle un nombre a tu reto 🙂' : (tipo === 'c' ? 'Elige el habito del reto 🙂' : 'Elige el habito que TU traes 🙂'))
      return
    }
    const h = allHabits.find(x => x.id === habit)
    setCreando(true)
    try {
      const res = await createReto({
        tipo, nombre: nombre.trim(), dur, vis,
        habito: h ? { id: h.id, name: h.name, emoji: typeOf(h.type).emoji } : null,
        grupo: vis === 'publico' ? null : grupo,
        invitados: invited,
      })
      onClose()
      const n = res?.invitedCount ?? invited.size
      const dondeVive = vis !== 'publico' && grupo ? `Ya corre en ${grupo}` : 'Miralo en Tus retos'
      if (n > 0) flash(`¡Reto "${nombre.trim()}" creado! ⚡ ${n} ${n === 1 ? 'amigo dentro' : 'amigos dentro'}. ${dondeVive}`)
      else flash(`¡Reto "${nombre.trim()}" creado! ⚡ ${dondeVive}`)
    } finally {
      setCreando(false)
    }
  }

  const target = document.querySelector('.app-phone')
  if (!target) return null

  return createPortal(
    <motion.div className="flow-screen"
      initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <div className="flow-head">
        <button className="flow-back" onClick={onClose}><i className="ti ti-arrow-left" /></button>
        <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>Crear reto</div>
      </div>

      <div className="flow-body">
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>MODO DEL RETO</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {TIPOS.map(t => {
              const on = tipo === t.id
              return (
                <motion.button
                  key={t.id} type="button" whileTap={{ y: 2 }} onClick={() => setTipo(t.id)}
                  style={{
                    flex: 1, padding: 'var(--space-3) var(--space-2)', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', textAlign: 'center',
                    border: on ? 'none' : '2px solid var(--card-line)',
                    background: on ? t.fill : 'var(--card)',
                    boxShadow: on ? `0 3px 0 ${t.edge}` : '0 3px 0 var(--card-edge)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xl)', marginBottom: 3 }}>{t.icon}</div>
                  <div className="q" style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: on ? '#fff' : 'var(--ink-soft)' }}>{t.title}</div>
                  <div className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 500, marginTop: 1, color: on ? 'rgba(255,255,255,0.85)' : 'var(--ink-muted)' }}>{t.sub}</div>
                </motion.button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>NOMBRE DEL RETO</div>
          <input className="amg-input q" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Madrugadores de mayo" />
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>
            {tipo === 'c' ? 'HABITO DEL RETO · DE TUS HABITOS' : 'TU APUESTA · DE TUS HABITOS'}
          </div>
          <HabitPicker habits={allHabits} value={habit} onChange={setHabit} />
          {tipo === 'p' && (
            <div className="q" style={{ marginTop: 6, fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
              Tu pones este; cada quien elige EL SUYO al unirse 🎯
            </div>
          )}
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>DURACION</div>
          <DurationSlider value={dur} onChange={setDur} />
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿DONDE CORRE?</div>
          <Segmented id="reto-vis" value={vis} onChange={setVis} options={VIS_OPTS} />
          {vis === 'grupos' && groups.length > 0 && (
            <div className="hscroll" style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', paddingBottom: 2 }}>
              {groups.map(g => {
                const on = grupo === g.name
                return (
                  <button
                    key={g.id} type="button" onClick={() => setGrupo(on ? null : g.name)}
                    className="q"
                    style={{
                      flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '6px var(--space-3)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                      fontSize: 'var(--text-xs)', fontWeight: 700,
                      border: on ? 'none' : '2px solid var(--card-line)',
                      background: on ? 'var(--olive)' : 'var(--card)',
                      color: on ? '#fff' : 'var(--ink-soft)',
                      boxShadow: on ? '0 2px 0 var(--olive-edge)' : '0 2px 0 var(--card-edge)',
                    }}
                  >
                    {g.icon} {g.name}
                  </button>
                )
              })}
            </div>
          )}
          {vis === 'grupos' && (
            <div className="q" style={{ marginTop: 6, fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
              {grupo ? `El reto sera la mision de ${grupo} ⚡` : 'Sin grupo elegido: corre entre tus amigos'}
            </div>
          )}
        </div>

        {/* Invitar amigos (amistades reales; RPC invite_friends_to_challenge) */}
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>INVITAR AMIGOS</div>
          <div className="amg-card" style={{ border: '1.5px solid var(--paper-alt)', overflow: 'hidden' }}>
            {inviteFriends.length === 0 ? (
              <div className="q" style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', textAlign: 'center', lineHeight: 1.4 }}>
                Aun no tienes amigos 🤔 Agregalos desde Juntos (codigo o QR) y vuelve aqui.
              </div>
            ) : inviteFriends.map(f => (
              <div key={f.id} className="opt-row" onClick={() => toggleInvite(f.id)}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: f.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-md)', flexShrink: 0,
                }}>{f.avatar}</div>
                <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 600, flex: 1 }}>{f.name}</div>
                <div className={`opt-check ${invited.has(f.id) ? 'on' : ''}`}>{invited.has(f.id) ? '✓' : ''}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="amg-cta amg-cta--brand q"
          onClick={crear}
          disabled={creando}
          style={{ opacity: listo ? 1 : 0.55, transition: 'opacity 0.2s ease' }}
        >
          {creando ? 'Creando...' : (invited.size ? 'Crear reto e invitar ⚡' : 'Crear reto ⚡')}
        </button>
      </div>
    </motion.div>,
    target,
  )
}

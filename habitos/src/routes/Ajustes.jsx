import { Children, Fragment, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import VincularAparatoSheet from '../components/VincularAparatoSheet.jsx'
import InviteQRSheet from '../components/InviteQRSheet.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import Confetti from '../components/Confetti.jsx'
import UserAvatar, { isPhotoAvatar } from '../components/UserAvatar.jsx'
import { openGestureCoach } from '../components/GestureCoach.jsx'
import TonoPicker from '../components/TonoPicker.jsx'
import { ROCKIE_COLORS } from '../data/rockieColors.js'
import { playSfx, setSfxEnabled } from '../lib/sfx.js'
import useDesktop from '../lib/useDesktop.js'
import './desk/AjustesDesk.css'

// ============================================================================
// Ajustes — la "tuerca" de B+ (movil: header de Progreso; PC: rail izquierdo).
// Identidad (avatar + nombre + codigo de amigo), apariencia (tema con preview
// vivo), preferencias (toggles 2.5D) y cuenta. Todo habla el lenguaje de juego
// del resto de la app: superficies gsurf, cantos, springs y micro-feedback.
// ============================================================================

// Avatares disponibles (emoji = columna profiles.avatar; se ve en lo social)
const AVATARES = [
  '😊', '😎', '🤓', '😇', '🥳', '🤠',
  '🦊', '🐼', '🐸', '🦁', '🐯', '🐨',
  '🐰', '🦄', '🐙', '🐺', '🦉', '🐢',
  '🌵', '🌟', '⚡', '🔥', '🌈', '🍀',
  '🍕', '⚽', '🎸', '🚀', '🎨', '💎',
]

// Los previews del selector de tema muestran SIEMPRE su tema (el claro se ve
// claro aunque la app este oscura), asi que sus colores son fijos por diseno:
// son los valores de --paper/--card/--ink de cada bloque de tokens.css.
const TEMAS = [
  { id: 'light',  label: 'Claro',  icon: 'ti-sun',      fondo: '#f0ebe5', carta: '#fdfbf7', tinta: '#575279' },
  { id: 'dark',   label: 'Oscuro', icon: 'ti-moon',     fondo: '#232136', carta: '#302c48', tinta: '#e0def4' },
  { id: 'system', label: 'Auto',   icon: 'ti-sun-moon', fondo: 'linear-gradient(105deg, #f0ebe5 48%, #232136 52%)', carta: '#b0a6a3', tinta: '#8a8299' },
]

// ─── Fila de ajuste: icono en squircle de color + label/caption + control ────
function Fila({ icon, tint = 'var(--azure)', soft = 'var(--azure-soft)', label, caption, right, onTap }) {
  const Tag = onTap ? 'button' : 'div'
  return (
    <Tag
      type={onTap ? 'button' : undefined}
      onClick={onTap}
      className="q"
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        width: '100%', minHeight: 'var(--tap-min)',
        padding: 'var(--space-2) var(--space-4)',
        background: 'none', border: 'none', textAlign: 'left',
        cursor: onTap ? 'pointer' : 'default', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: 12, background: soft, color: tint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--text-lg)', flexShrink: 0,
      }}>
        <i className={`ti ${icon}`} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
        {caption && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 1 }}>{caption}</span>}
      </span>
      {right}
    </Tag>
  )
}

// ─── Grupo de filas: kicker + tarjeta gsurf con divisores ────────────────────
function Seccion({ label, children }) {
  const filas = Children.toArray(children)
  return (
    <div style={{ padding: '0 var(--screen-x)' }}>
      <div className="q" style={{
        fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px',
        textTransform: 'uppercase', color: 'var(--ink-muted)',
        margin: '0 var(--space-2) var(--space-2)',
      }}>
        {label}
      </div>
      <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', padding: 'var(--space-1) 0' }}>
        {filas.map((f, i) => (
          <Fragment key={i}>
            {i > 0 && <div style={{ height: 1, background: 'var(--line)', margin: '0 var(--space-4)' }} />}
            {f}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ─── Switch 2.5D: riel excavado + perilla con canto que salta con spring ─────
function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 54, height: 32, borderRadius: 'var(--r-pill)', padding: 3,
        border: '2px solid', borderColor: on ? 'var(--olive-edge)' : 'var(--card-line)',
        background: on ? 'var(--olive)' : 'var(--paper-alt)',
        boxShadow: 'inset 0 2px 0 var(--edge-soft)',
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--card)', boxShadow: '0 2px 0 var(--card-edge)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: on ? 'var(--olive)' : 'var(--ink-faint)',
        }}
      >
        <i className={`ti ${on ? 'ti-check' : 'ti-minus'}`} />
      </motion.span>
    </button>
  )
}

// ─── Selector de tema: tres mini-telefonos; elegir aplica el tema AL INSTANTE ─
function TemaPicker({ tema, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4) var(--space-4)' }}>
      {TEMAS.map(t => {
        const on = tema === t.id
        return (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            whileTap={{ scale: 0.94 }}
            aria-pressed={on}
            style={{
              flex: 1, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
            }}
          >
            {/* Mini pantalla del tema: fondo + tarjetita + acento */}
            <span style={{
              position: 'relative', width: '100%', aspectRatio: '5 / 6',
              borderRadius: 'var(--r-md)', background: t.fondo,
              border: '2.5px solid', borderColor: on ? 'var(--brand)' : 'var(--card-line)',
              boxShadow: on ? '0 3px 0 var(--brand-edge)' : '0 3px 0 var(--card-edge)',
              overflow: 'hidden', display: 'block',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}>
              <span style={{ position: 'absolute', left: '14%', top: '16%', width: '52%', height: 6, borderRadius: 4, background: t.tinta, opacity: 0.85 }} />
              <span style={{ position: 'absolute', left: '14%', top: '38%', width: '72%', height: '34%', borderRadius: 8, background: t.carta }} />
              <span style={{ position: 'absolute', left: '22%', top: '48%', width: '34%', height: 5, borderRadius: 3, background: 'var(--coral)' }} />
              <span style={{ position: 'absolute', left: '22%', top: '60%', width: '46%', height: 4, borderRadius: 3, background: t.tinta, opacity: 0.4 }} />
              {/* Badge de seleccion: aparece con pop */}
              <AnimatePresence>
                {on && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                    style={{
                      position: 'absolute', right: 5, bottom: 5, width: 20, height: 20,
                      borderRadius: '50%', background: 'var(--brand)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                      boxShadow: '0 2px 0 var(--brand-edge)',
                    }}
                  >
                    <i className="ti ti-check" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="q" style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-xs)', fontWeight: 700,
              color: on ? 'var(--brand)' : 'var(--ink-soft)',
            }}>
              <i className={`ti ${t.icon}`} /> {t.label}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}


// ─── Selector de Color de Acento Mineral: 6 swatches con nombre ──────────────
function ColorAcentoPicker({ accent = null, onPick }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', padding: 'var(--space-3)' }}>
      {ROCKIE_COLORS.map(c => {
        const on = accent === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            aria-pressed={on}
            className="q"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
              padding: 'var(--space-2)', borderRadius: 'var(--r-md)',
              background: on ? 'var(--card)' : 'var(--paper-alt)',
              border: on ? '2.5px solid var(--brand)' : '2px solid var(--card-line)',
              boxShadow: on ? '0 2px 0 var(--brand-edge)' : '0 2px 0 var(--card-edge)',
              cursor: 'pointer', textAlign: 'center',
            }}
          >
            <span style={{
              width: 32, height: 32, borderRadius: '50%', background: c.swatch,
              boxShadow: `0 2px 0 color-mix(in srgb, ${c.swatch} 70%, #000), 0 0 0 2px color-mix(in srgb, var(--ink) 32%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 12,
            }}>
              {on && <i className="ti ti-check" />}
            </span>
            <span className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: on ? 'var(--ink)' : 'var(--ink-soft)' }}>
              {c.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function Ajustes() {
  const navigate = useNavigate()
  const wide = useDesktop()
  const {
    me, user, live, prefs, setPref, updateProfile, uploadAvatar, signOut, deleteAccount, level, streak,
    gcalConnected, connectCalendar, disconnectCalendar,
  } = useStore()

  const [avatarSheet, setAvatarSheet] = useState(false)
  const [qrSheet, setQrSheet] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [subiendoAvatar, setSubiendoAvatar] = useState(false)
  const [borrarSheet, setBorrarSheet] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const fileRef = useRef(null)
  // Easter egg: 5 toques a la version = confetti (a Rockie le gusta la tuerca)
  const [toques, setToques] = useState(0)
  const [fiesta, setFiesta] = useState(false)

  const email = user?.email || ''
  const tieneFoto = isPhotoAvatar(me.avatar)

  const elegirFoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSubiendoAvatar(true)
    try {
      const res = await uploadAvatar(file)
      if (res?.ok) setAvatarSheet(false)
      else window.alert('No se pudo subir la foto. Prueba con otra imagen.')
    } finally {
      setSubiendoAvatar(false)
    }
  }

  const guardarNombre = (valor) => {
    setEditandoNombre(false)
    if (valor.trim() && valor.trim() !== me.name) updateProfile({ name: valor })
  }

  const copiarCodigo = async () => {
    if (!me.code) return
    try {
      await navigator.clipboard.writeText(me.code)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch { /* sin clipboard: el QR sigue siendo la via */ }
  }

  const tocarVersion = () => {
    const n = toques + 1
    if (n >= 5) { setFiesta(true); setToques(0) } else setToques(n)
  }

  const verTutorial = () => {
    openGestureCoach()
    navigate('/hoy')
  }

  const [salirSheet, setSalirSheet] = useState(false)
  const salir = () => setSalirSheet(true)

  // Borrado de cuenta (Apple 5.1.1(v)): accion irreversible, se confirma en un
  // sheet propio. Al terminar, deleteAccount cierra sesion y App.jsx vuelve al
  // login; solo hace falta apagar el estado de "borrando".
  const eliminarCuenta = async () => {
    if (borrando) return
    setBorrando(true)
    const res = await deleteAccount()
    if (!res?.ok) {
      setBorrando(false)
      window.alert('No se pudo eliminar la cuenta. Revisa tu conexion e intenta de nuevo.')
      return
    }
    // Sesion ya cerrada: el gate de auth desmonta esta pantalla. Cerramos el
    // sheet por si el desmontaje tarda un frame.
    setBorrarSheet(false)
    setBorrando(false)
  }

  // Conectar abre el consent de Google (scope de Calendar); desconectar borra
  // el calendario "B+" entero de su cuenta, asi que se confirma antes.
  const tocarCalendar = () => {
    if (gcalConnected) {
      if (window.confirm('Desconectar Google Calendar? El calendario "B+" se borrara de tu cuenta.')) {
        disconnectCalendar()
      }
    } else {
      connectCalendar()
    }
  }

  return (
    <div
      className={wide ? 'dk-page aj-desk' : undefined}
      style={wide ? undefined : { display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: 'var(--space-8)' }}
    >
      {/* PC: cabecera editorial (sin volver: la barra lateral ya lleva a todos lados) */}
      {wide && (
        <header className="dk-head">
          <div>
            <div className="q dk-eyebrow">Tu espacio</div>
            <h1 className="dk-title">Ajustes</h1>
            <p className="q dk-sub">Tu perfil, cómo se ve B+ y cómo te acompaña Rockie.</p>
          </div>
        </header>
      )}
      {/* Cabecera editorial con volver (mismo lenguaje que ScreenHeader) */}
      {!wide && <div style={{ padding: 'var(--space-6) var(--screen-x) 0', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="gbtn"
          style={{
            width: 40, height: 40, borderRadius: '50%', background: 'var(--card)',
            border: '2px solid var(--card-line)', '--edge': 'var(--card-edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-soft)', fontSize: 'var(--text-lg)', flexShrink: 0, marginTop: 2,
          }}
        >
          <i className="ti ti-chevron-left" />
        </button>
        <div>
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>Tu espacio</div>
          <div className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--title)', lineHeight: 1.1, marginTop: 3, letterSpacing: '-0.3px' }}>Ajustes</div>
          <div className="editorial-line" />
        </div>
      </div>}

      <div
        className={wide ? 'aj-sections' : undefined}
        style={wide ? undefined : { display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginTop: 'var(--space-5)' }}
      >
        {/* ── Tarjeta de identidad: avatar tocable + nombre editable + codigo ── */}
        <div style={{ padding: '0 var(--screen-x)' }}>
          <div className="gsurf" style={{
            borderRadius: 'var(--r-xl)', padding: 'var(--space-5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
          }}>
            <motion.button
              type="button"
              onClick={() => setAvatarSheet(true)}
              whileTap={{ scale: 0.88, rotate: -6 }}
              aria-label="Cambiar foto de perfil"
              style={{
                position: 'relative', width: 76, height: 76, borderRadius: '50%',
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              }}
            >
              <UserAvatar
                avatar={me.avatar}
                size={76}
                fontSize={38}
                background="var(--azure-soft)"
                style={{ border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)' }}
              />
              <span style={{
                position: 'absolute', right: -3, bottom: -3, width: 26, height: 26,
                borderRadius: '50%', background: 'var(--brand)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, boxShadow: '0 2px 0 var(--brand-edge)',
              }}>
                <i className="ti ti-pencil" />
              </span>
            </motion.button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={elegirFoto}
            />

            {editandoNombre ? (
              <input
                className="s"
                autoFocus
                defaultValue={me.name}
                maxLength={24}
                onBlur={(e) => guardarNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                style={{
                  fontSize: 'var(--text-2xl)', color: 'var(--ink)', textAlign: 'center',
                  background: 'var(--paper-alt)', border: '2px solid var(--azure)',
                  borderRadius: 'var(--r-sm)', padding: '2px var(--space-3)',
                  width: 'min(240px, 100%)', outline: 'none',
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditandoNombre(true)}
                aria-label="Editar nombre"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '2px var(--space-2)',
                }}
              >
                <span className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>{me.name}</span>
                <i className="ti ti-pencil" style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }} />
              </button>
            )}

            {email && <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>{email}</div>}

            {/* Mini stats: la identidad tambien presume nivel y racha */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <span className="q gpill" style={{ fontSize: 'var(--text-xs)', color: 'var(--brand)' }}>💎 Nivel {level}</span>
              <span className="q gpill" style={{ fontSize: 'var(--text-xs)', color: 'var(--coral)' }}>🔥 {streak} dias</span>
            </div>

            {/* Codigo de amigo: copiar + QR (la puerta a lo social) */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', width: '100%', justifyContent: 'center' }}>
              {me.code && (
                <button type="button" onClick={copiarCodigo} className="q gsurf gsurf--tap" style={{
                  borderRadius: 'var(--r-pill)', padding: 'var(--space-1) var(--space-3)',
                  display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer',
                  fontSize: 'var(--text-s)', fontWeight: 700, color: copiado ? 'var(--olive)' : 'var(--ink-soft)',
                  letterSpacing: 1,
                }}>
                  <i className={`ti ${copiado ? 'ti-check' : 'ti-copy'}`} /> {copiado ? 'Copiado' : me.code}
                </button>
              )}
              <button type="button" onClick={() => setQrSheet(true)} className="q gbtn" style={{
                borderRadius: 'var(--r-pill)', padding: 'var(--space-1) var(--space-3)',
                background: 'var(--brand)', color: '#fff', '--edge': 'var(--brand-edge)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                fontSize: 'var(--text-s)', fontWeight: 700,
              }}>
                <i className="ti ti-qrcode" /> Mi QR
              </button>
            </div>
          </div>
        </div>

        {/* ── Apariencia: el tema cambia EN VIVO al tocar un preview ── */}
        <div style={{ padding: '0 var(--screen-x)' }}>
          <div className="q" style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px',
            textTransform: 'uppercase', color: 'var(--ink-muted)',
            margin: '0 var(--space-2) var(--space-2)',
          }}>
            Apariencia
          </div>
          <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            <TemaPicker tema={prefs.theme} onPick={(t) => setPref('theme', t)} />
          </div>
        </div>

        {/* ── Color de acento mineral: cambia el color vivo de la interfaz ── */}
        <div style={{ padding: '0 var(--screen-x)' }}>
          <div className="q" style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px',
            textTransform: 'uppercase', color: 'var(--ink-muted)',
            margin: '0 var(--space-2) var(--space-2)',
          }}>
            Color de Acento Mineral
          </div>
          <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            <ColorAcentoPicker accent={prefs.accentColor} onPick={(c) => setPref('accentColor', c)} />
          </div>
        </div>

        {/* ── Tono de Rockie: como te acompana y habla Rockie ── */}
        <div style={{ padding: '0 var(--screen-x)' }}>
          <div className="q" style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px',
            textTransform: 'uppercase', color: 'var(--ink-muted)',
            margin: '0 var(--space-2) var(--space-2)',
          }}>
            Voz de Rockie
          </div>
          <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            <TonoPicker tone={prefs.rockieTone || 'motivador'} onPick={(t) => setPref('rockieTone', t)} />
          </div>
        </div>

        {/* ── Tu mapa: modo areas completas vs solo metas (misma pregunta del
            onboarding; cambiar NO borra nada — las metas conservan su area) ── */}
        <div style={{ padding: '0 var(--screen-x)' }}>
          <div className="q" style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px',
            textTransform: 'uppercase', color: 'var(--ink-muted)',
            margin: '0 var(--space-2) var(--space-2)',
          }}>
            Tu mapa
          </div>
          <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {[
                { id: 'areas', icon: 'ti-circles', titulo: 'Areas y metas', caption: 'Cuerpo, Mente y Alma', color: 'var(--olive)', edge: 'var(--olive-edge)' },
                { id: 'metas', icon: 'ti-target-arrow', titulo: 'Solo metas', caption: 'Directo al grano', color: 'var(--azure)', edge: 'var(--azure-edge)' },
              ].map(o => {
                const on = (prefs.vidaMode === 'metas' ? 'metas' : 'areas') === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPref('vidaMode', o.id)}
                    aria-pressed={on}
                    className="q"
                    style={{
                      flex: 1, minHeight: 'var(--tap-min)', padding: 'var(--space-3)', cursor: 'pointer',
                      borderRadius: 'var(--r-md)', textAlign: 'center',
                      background: 'var(--card)',
                      border: on ? `2.5px solid ${o.color}` : '2px solid var(--card-line)',
                      boxShadow: on ? `0 2px 0 ${o.edge}` : '0 2px 0 var(--card-edge)',
                      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    <i className={`ti ${o.icon}`} style={{ fontSize: 'var(--text-xl)', color: on ? o.color : 'var(--ink-faint)' }} />
                    <span className="q" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: on ? 'var(--ink)' : 'var(--ink-soft)', marginTop: 4 }}>{o.titulo}</span>
                    <span className="q" style={{ display: 'block', fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', marginTop: 1 }}>{o.caption}</span>
                  </button>
                )
              })}
            </div>
            <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', textAlign: 'center', padding: 'var(--space-2) var(--space-2) 0', lineHeight: 1.45 }}>
              Cambiar de modo no borra nada: tus metas recuerdan su area.
            </div>
          </div>
        </div>

        {/* Planes / Suscripcion oculto temporalmente. Reactivar: descomentar.
        <Seccion label="Suscripción">
          <Fila
            icon="ti-sparkles" tint="var(--amber)" soft="var(--amber-soft)"
            label={prefs?.userPlan === 'pro' ? 'B+ Pro Activo' : prefs?.userPlan === 'family' ? 'B+ Círculo Activo' : 'Plan Inicial (Gratis)'}
            caption={prefs?.userPlan === 'pro' || prefs?.userPlan === 'family' ? 'Gestionar plan y facturación Culqi' : 'Mejora a Pro: hábitos ilimitados y gemas x2'}
            onTap={() => navigate('/planes')}
            right={<i className="ti ti-chevron-right" style={{ color: 'var(--amber)' }} />}
          />
        </Seccion>
        */}

        <Seccion label="Preferencias">
          <Fila
            icon="ti-volume" tint="var(--amber)" soft="var(--title-soft)"
            label="Sonidos" caption="Celebraciones y efectos"
            right={<Toggle on={prefs.sounds} onChange={(v) => {
              setPref('sounds', v)
              setSfxEnabled(v)
              if (v) playSfx('tap')
            }} />}
          />
          <Fila
            icon="ti-bell" tint="var(--berry)" soft="var(--berry-soft)"
            label="Recordatorios" caption="Avisos a la hora de tus habitos"
            right={<Toggle on={prefs.reminders} onChange={(v) => setPref('reminders', v)} />}
          />
          <Fila
            icon="ti-sparkles" tint="var(--brand)" soft="var(--azure-soft)"
            label="Guia interactiva y gestos" caption="Aprende a validar con foto, deslizar y cuidar a Rockie"
            onTap={verTutorial}
            right={<i className="ti ti-chevron-right" style={{ color: 'var(--brand)' }} />}
          />
        </Seccion>

        {/* ── Conexiones: Google Calendar (solo con sesion real) ── */}
        {live && user && (
          <Seccion label="Conexiones">
            <Fila
              icon={gcalConnected ? 'ti-calendar-check' : 'ti-calendar-plus'}
              tint={gcalConnected ? 'var(--olive)' : 'var(--azure)'}
              soft={gcalConnected ? 'var(--paper-alt)' : 'var(--azure-soft)'}
              label="Google Calendar"
              caption={gcalConnected
                ? 'Conectado · tus habitos viven en tu calendario'
                : 'Lleva tus habitos y metas a tu calendario'}
              onTap={tocarCalendar}
              right={<i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)' }} />}
            />
          </Seccion>
        )}

        <Seccion label="Cuenta">
          {live && user ? (
            <Fila
              icon="ti-logout" tint="var(--berry)" soft="var(--berry-soft)"
              label="Cerrar sesion" caption={email}
              onTap={salir}
              right={<i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)' }} />}
            />
          ) : (
            <Fila
              icon="ti-flask" tint="var(--olive)" soft="var(--paper-alt)"
              label="Modo demo" caption="Entra con Google para guardar tu progreso en la nube"
            />
          )}
          {live && user && (
            <Fila
              icon="ti-trash" tint="var(--coral)" soft="var(--berry-soft)"
              label="Eliminar cuenta" caption="Borra tu cuenta y todos tus datos"
              onTap={() => setBorrarSheet(true)}
              right={<i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)' }} />}
            />
          )}
          <Fila
            icon="ti-mood-kid" tint="var(--berry)" soft="var(--berry-soft)"
            label="Control parental" caption="Administra el Rockie Companion de tu hijo/a"
            onTap={() => navigate('/familia')}
            right={<i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)' }} />}
          />
          {/* Vincular MI aparato: el Rockie no tiene login (teclear una clave
              en un resistivo de 3.5" es un suplicio, y su flash se vuelca por
              UART). Ensena un codigo y lo reclamamos desde aqui, con la
              sesion que ya tenemos. */}
          <Fila
            icon="ti-device-ipad-horizontal" tint="var(--brand)" soft="var(--brand-soft)"
            label="Vincular aparato" caption="Conecta tu Rockie Companion a esta cuenta"
            onTap={() => setVinculando(true)}
            right={<i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)' }} />}
          />
          <Fila
            icon="ti-shield-lock" tint="var(--azure)" soft="var(--azure-soft)"
            label="Privacidad y terminos" caption="Como tratamos tus datos y las reglas de uso"
            onTap={() => navigate('/legal')}
            right={<i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)' }} />}
          />
          <Fila
            icon="ti-diamond" tint="var(--brand)" soft="var(--azure-soft)"
            label="Version" caption="B+ · Victorias reales"
            onTap={tocarVersion}
            right={
              <span style={{ position: 'relative' }}>
                <span className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-muted)' }}>1.0</span>
                {fiesta && (
                  <span style={{ position: 'absolute', right: 8, top: 8 }}>
                    <Confetti onDone={() => setFiesta(false)} />
                  </span>
                )}
              </span>
            }
          />
        </Seccion>
      </div>

      {/* ── Sheet: foto de perfil + emojis ── */}
      <BottomSheet open={avatarSheet} onClose={() => setAvatarSheet(false)} title="Tu foto de perfil">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
          <button
            type="button"
            className="q gbtn"
            disabled={subiendoAvatar}
            onClick={() => fileRef.current?.click()}
            style={{
              minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
              background: 'var(--azure)', color: '#fff', '--edge': 'var(--azure-edge)',
              fontWeight: 700, fontSize: 'var(--text-sm)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
              opacity: subiendoAvatar ? 0.6 : 1,
            }}
          >
            <i className="ti ti-camera" />
            {subiendoAvatar ? 'Subiendo...' : (tieneFoto ? 'Cambiar foto' : 'Subir una foto')}
          </button>

          {tieneFoto && (
            <button
              type="button"
              className="q"
              onClick={() => { updateProfile({ avatar: '😊' }); setAvatarSheet(false) }}
              style={{
                minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
                background: 'var(--card)', color: 'var(--ink-soft)',
                border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
                fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
              }}
            >
              Quitar foto y usar emoji
            </button>
          )}

          <div className="amg-label q" style={{ margin: 0 }}>O ELIGE UN EMOJI</div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)',
          }}>
            {AVATARES.map(a => {
              const on = me.avatar === a
              return (
                <motion.button
                  key={a}
                  type="button"
                  whileTap={{ scale: 0.8 }}
                  onClick={() => { updateProfile({ avatar: a }); setAvatarSheet(false) }}
                  aria-label={`Avatar ${a}`}
                  style={{
                    aspectRatio: '1', minHeight: 'var(--tap-min)', borderRadius: 'var(--r-md)',
                    fontSize: 26, cursor: 'pointer',
                    background: on ? 'var(--azure-soft)' : 'var(--paper-alt)',
                    border: '2px solid', borderColor: on ? 'var(--brand)' : 'var(--card-line)',
                    boxShadow: on ? '0 2px 0 var(--brand-edge)' : '0 2px 0 var(--card-edge)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {a}
                </motion.button>
              )
            })}
          </div>
          {!live && (
            <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', textAlign: 'center' }}>
              Sin sesion la foto solo vive en este dispositivo.
            </div>
          )}
        </div>
      </BottomSheet>

      {/* ── Modal: mi QR de invitacion (reutiliza el del perfil social) ── */}
      <InviteQRSheet open={qrSheet} onClose={() => setQrSheet(false)} />
      <VincularAparatoSheet open={vinculando} onClose={() => setVinculando(false)} />

      {/* ── Modal: confirmar cierre de sesion (propio, no window.confirm) ── */}
      <ConfirmModal
        open={salirSheet}
        onClose={() => setSalirSheet(false)}
        onConfirm={signOut}
        title="Cerrar sesion"
        message={<>Tu racha y tu progreso quedan guardados en tu cuenta. ¿Cerrar la sesion de <b style={{ color: 'var(--ink)' }}>{email}</b>?</>}
        confirmLabel="Si, cerrar sesion"
        confirmIcon="ti-logout"
        icon="ti-logout"
        tint="var(--berry)" soft="var(--berry-soft)" edge="var(--berry-edge)"
      />

      {/* ── Sheet: eliminar cuenta (accion irreversible, doble confirmacion) ── */}
      <BottomSheet
        open={borrarSheet}
        onClose={() => { if (!borrando) setBorrarSheet(false) }}
        title="Eliminar tu cuenta"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-4) 0 0',
          }}>
            <span style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--berry-soft)', color: 'var(--coral)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
            }}>
              <i className="ti ti-alert-triangle" />
            </span>
            <div className="q" style={{ fontSize: 'var(--text-base)', color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.5, maxWidth: 320 }}>
              Esto borra <b style={{ color: 'var(--ink)' }}>para siempre</b> tu cuenta y todos tus datos:
              habitos, racha, fotos, metas y amistades. <b style={{ color: 'var(--ink)' }}>No se puede deshacer.</b>
            </div>
          </div>

          <button
            type="button"
            className="q gbtn"
            disabled={borrando}
            onClick={eliminarCuenta}
            style={{
              minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
              background: 'var(--coral)', color: '#fff', '--edge': 'var(--coral-edge)',
              fontWeight: 700, fontSize: 'var(--text-sm)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
              opacity: borrando ? 0.6 : 1,
            }}
          >
            <i className={`ti ${borrando ? 'ti-loader-2' : 'ti-trash'}`} />
            {borrando ? 'Eliminando...' : 'Si, eliminar mi cuenta'}
          </button>

          <button
            type="button"
            className="q"
            disabled={borrando}
            onClick={() => setBorrarSheet(false)}
            style={{
              minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
              background: 'var(--card)', color: 'var(--ink-soft)',
              border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
              fontWeight: 700, fontSize: 'var(--text-sm)', cursor: borrando ? 'default' : 'pointer',
            }}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

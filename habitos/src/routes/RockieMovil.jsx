import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { ROCKIE_TONES, rockieArt } from '../data/rockie.js'
import { acercarThumb } from '../data/shop.js'
import { guardarVoz, leerVoz } from '../lib/vozPrefs.js'
import Rockie from '../components/Rockie.jsx'
import TonoPicker from '../components/TonoPicker.jsx'
import './RockieMovil.css'

// ============================================================================
// Tu Rockie en el celular (lienzo «B+ móvil»): arriba «‹ Tu Rockie» y tu saldo;
// Rockie grande con su nivel y la barra de XP; cómo crece tu geoda (4 etapas);
// lo que lleva puesto y en la mochila (con la Tienda a mano); y la voz de Rockie.
// El resto de la pantalla (resumen, logros, amigos, inventario) sigue en
// RockieScreen.jsx, igual que antes.
// ============================================================================

export function RockiePerfilTop({ coins, onBack, onAjustes }) {
  return (
    <div className="rkm-top">
      <button type="button" className="rkm-ibtn" onClick={onBack} aria-label="Volver">
        <i className="ti ti-chevron-left" />
      </button>
      <h1 className="s rkm-title">Tu Rockie</h1>
      <span className="q gpill rkm-coins">
        <span aria-hidden="true">🪙</span> {coins}
      </span>
      <button type="button" className="rkm-ibtn" onClick={onAjustes} aria-label="Ajustes" title="Ajustes">
        <i className="ti ti-settings" />
      </button>
    </div>
  )
}

export function RockieHeroCard({ nombre, nivel, etapa, piedra, xp, xpToNext, fondo, emotion, equipped, color, stage, levelUpFx, onEvo, onQr }) {
  const pct = Math.min(100, Math.round((xp / Math.max(1, xpToNext)) * 100))
  return (
    <section className="dk-card rkm-hero">
      <motion.button type="button" className="rkm-stage" onClick={onEvo} whileTap={{ scale: 0.97 }} aria-label="Ver la evolución de Rockie">
        <span className="rkm-halo" style={fondo ? { background: fondo } : undefined} aria-hidden="true" />
        <Rockie emotion={emotion} size={196} moods={false} float equipped={equipped} color={color} stage={stage} fx={levelUpFx ? 'levelup' : null} fxKey={levelUpFx} />
      </motion.button>
      <button type="button" className="rkm-qr" onClick={onQr} aria-label="Invitar amigos con QR" title="Invitar amigos con QR">
        <i className="ti ti-qrcode" />
      </button>
      <div className="s rkm-name">{nombre}</div>
      <span className="q rkm-level">
        Nv {nivel} · {etapa} de {piedra.toLowerCase()}
      </span>
      <div className="rkm-xp">
        <div className="q rkm-xp-row">
          <span>XP</span>
          <span>
            {xp} de {xpToNext} para Nv {nivel + 1}
          </span>
        </div>
        <div className="rkm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={xpToNext} aria-valuenow={xp} aria-label="XP hacia el siguiente nivel">
          <motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      </div>
    </section>
  )
}

/** Las 4 etapas de la geoda (Leyenda comparte la gema: no suma un paso más). */
export function EvolucionCard({ evo, nivel, onOpen }) {
  const pasos = evo.slice(0, 4)
  const actual = Math.max(0, pasos.filter((e) => nivel >= e.lvl).length - 1)
  return (
    <section className="dk-card rkm-evo">
      <button type="button" className="rkm-evo-in" onClick={onOpen} aria-label="Ver la evolución completa">
        <span className="q dk-label">Tu geoda crece contigo</span>
        <span className="rkm-steps">
          {pasos.map((e, i) => (
            <span key={e.name} className={`rkm-step${i <= actual ? ' on' : ''}${i === actual ? ' now' : ''}`}>
              {i < pasos.length - 1 && <span className={`rkm-line${i < actual ? ' on' : ''}`} aria-hidden="true" />}
              <b className="s">{i + 1}</b>
              <span className="q rkm-step-n">{e.name}</span>
              <small className="q">Nv {e.lvl}</small>
            </span>
          ))}
        </span>
        <span className="q rkm-evo-note">Cada victoria abre la piedra un poco más.</span>
      </button>
    </section>
  )
}

/** Lo que lleva puesto, lo que guarda en la mochila y algo de la Tienda. */
export function LoQueLleva({ items, onTienda, onInventario }) {
  return (
    <section className="dk-card rkm-lleva">
      <div className="dk-sechead">
        <span className="q dk-label">Lo que lleva</span>
        <button type="button" className="gbtn dk-btn rkm-tienda" style={{ '--bg': 'var(--amber)', '--edge': 'var(--amber-edge)' }} onClick={onTienda}>
          <i className="ti ti-building-store" /> Tienda
        </button>
      </div>
      <div className="rkm-items">
        {items.map(({ item, estado }) => (
          <button key={item.id} type="button" className="rkm-item" onClick={estado === 'tienda' ? onTienda : onInventario}>
            <span className="rkm-thumb">
              <img src={rockieArt(`acc/${item.id}`)} alt="" loading="lazy" decoding="async" style={acercarThumb(item.thumb)} />
            </span>
            <b className="q">{item.name}</b>
            <small className={`q ${estado}`}>{estado === 'puesto' ? 'Puesto' : estado === 'mochila' ? 'En tu mochila' : `Tienda · ${item.price}`}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function Fila({ icono, color, titulo, sub, children, onClick, abierto }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`rkm-row${onClick ? ' tap' : ''}`} onClick={onClick} aria-expanded={onClick ? abierto : undefined}>
      <span className="rkm-row-ic" style={{ '--c': color }}>
        <i className={`ti ${icono}`} aria-hidden="true" />
      </span>
      <span className="rkm-row-t">
        <b className="q">{titulo}</b>
        <small className="q">{sub}</small>
      </span>
      {children}
    </Tag>
  )
}

function Interruptor({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`rkm-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <b />
    </button>
  )
}

/** Voz de Rockie: cómo le hablas, manos libres, si elige la app solo, su tono y su idioma. */
export function VozDeRockie() {
  const { prefs, setPref } = useStore()
  const [manos, setManos] = useState(() => leerVoz('manosLibres'))
  const [autoApp, setAutoApp] = useState(() => leerVoz('autoApp'))
  const [tonos, setTonos] = useState(false)
  const tono = ROCKIE_TONES[prefs?.rockieTone || 'motivador'] || ROCKIE_TONES.motivador
  return (
    <section className="dk-card rkm-voz">
      <span className="q dk-label">Voz de Rockie</span>
      <Fila icono="ti-microphone" color="var(--brand)" titulo="Toca y habla" sub="Toca otra vez para terminar: no te corta en las pausas" />
      <Fila icono="ti-headphones" color="var(--green-edge)" titulo="Manos libres" sub="Te contesta en voz alta; di «listo» para cerrar">
        <Interruptor
          on={manos}
          label="Manos libres"
          onChange={(v) => {
            setManos(v)
            guardarVoz('manosLibres', v)
          }}
        />
      </Fila>
      <Fila icono="ti-apps" color="var(--azure)" titulo="Rockie elige la app" sub="Agenda, Equipo o Cuaderno, sin preguntar">
        <Interruptor
          on={autoApp}
          label="Rockie elige la app"
          onChange={(v) => {
            setAutoApp(v)
            guardarVoz('autoApp', v)
          }}
        />
      </Fila>
      <Fila icono="ti-message-circle" color="var(--amber-edge)" titulo="Tono de voz" sub={tono.label} onClick={() => setTonos((v) => !v)} abierto={tonos}>
        <i className={`ti ti-chevron-${tonos ? 'up' : 'down'} rkm-row-go`} aria-hidden="true" />
      </Fila>
      <AnimatePresence initial={false}>
        {tonos && (
          <motion.div key="tonos" className="rkm-tonos" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24 }}>
            <TonoPicker tone={prefs?.rockieTone || 'motivador'} onPick={(t) => setPref('rockieTone', t)} />
          </motion.div>
        )}
      </AnimatePresence>
      <Fila icono="ti-language" color="var(--berry)" titulo="Idioma" sub="Español" />
    </section>
  )
}

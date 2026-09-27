import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../data/mockStore.jsx'
import { evoOf, rockieArt, stoneArt, stageOfLevel, EYE_OPTIONS, MOUTH_OPTIONS, NEUTRAL_EYES, NEUTRAL_MOUTH } from '../data/rockie.js'
import { ROCKIE_COLORS } from '../data/rockieColors.js'
import { SHOP_ITEMS, itemById, acercarThumb } from '../data/shop.js'
import Rockie from '../components/Rockie.jsx'
import CenterModal from '../components/CenterModal.jsx'
import FullScreenSheet from '../components/FullScreenSheet.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import InviteQRSheet from '../components/InviteQRSheet.jsx'
import useDesktop from '../lib/useDesktop.js'
import OsSwitcher from '../components/OsSwitcher.jsx'
import './desk/RockieDesk.css'
import LogroUnlockModal from '../components/LogroUnlockModal.jsx'
import Flame from '../components/Flame.jsx'
import CountUp from '../components/CountUp.jsx'
import { playSfx } from '../lib/sfx.js'

// ============================================================================
// Pantalla Rockie — hero-first: el personaje grande domina y todo orbita
// a su alrededor. Ahora TODO sale del store real:
//  - accesorios equipados se VEN sobre el personaje (capas de la tienda)
//  - el fondo del hero es el fondo equipado en la tienda
//  - inventario real: equipar/quitar de verdad (persistido)
//  - logros derivados de racha / completados / nivel reales
// La tienda vive en /rockie/tienda (banner de acceso con el saldo).
// ============================================================================

// Arbol de evolucion (15_pantalla_rockie.md). La etapa actual se deriva del
// nivel REAL con evoOf(); nada hardcodeado. Nombres = narrativa mineral:
// Rockie es una geoda que revela la piedra preciosa de su interior.
// Cada hito muestra la etapa del ARTE de TU piedra (stoneArt): la geoda se abre.
// Leyenda comparte la gema (etapa 4) — es el mismo cristal, pulido por 50 niveles.
const EVO = [
  { stage: 1, name: 'Guijarro', lvl: 1,  desc: 'Una piedrita con mucho futuro' },
  { stage: 2, name: 'Geoda',    lvl: 5,  desc: 'Algo brilla en su interior' },
  { stage: 3, name: 'Cristal',  lvl: 10, desc: 'Las primeras facetas a la vista' },
  { stage: 4, name: 'Gema',     lvl: 20, desc: 'Pulida por la constancia' },
  { stage: 4, name: 'Leyenda',  lvl: 50, desc: 'La joya de los habitos' },
]

// Posiciones de las chispas que orbitan al heroe (transform/opacity via keyframe shine)
const SPARKLES = [
  { top: '10%', left: '10%', size: 14, color: 'var(--ink-faint)', delay: 0 },
  { top: '4%', right: '20%', size: 10, color: 'var(--purple)', delay: 0.9 },
  { top: '38%', right: '4%', size: 12, color: 'var(--ink-faint)', delay: 1.6 },
  { bottom: '22%', left: '3%', size: 11, color: 'var(--amber)', delay: 2.2 },
]

const FONDO_DEFAULT = 'linear-gradient(180deg, var(--card-2) 0%, transparent 88%)'

// Al volver de la tienda la pantalla entra deslizando como una sola pieza (ver
// AppShell): apagamos la cascada de entrada de secciones/iconos para que nada
// re-aparezca elemento por elemento. true = animar entrada (visita normal).
const EntranceCtx = createContext(true)

// Categorias de objetos del inventario (mismo lenguaje que la tienda)
const INV_CATS = [
  { id: 'acc', label: 'Accesorios' },
  { id: 'bg', label: 'Fondos' },
  { id: 'food', label: 'Comida' },
]

// ─── Miniatura recortada de un accesorio (misma tecnica que la tienda) ───────
function AccThumb({ item, size = 34 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 'var(--r-sm)', overflow: 'hidden', position: 'relative', margin: '0 auto' }}>
      <img
        src={rockieArt(`acc/${item.id}`)} alt={item.name} loading="lazy" decoding="async"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', ...acercarThumb(item.thumb) }}
      />
    </div>
  )
}

// ─── Casilla del inventario (grid estilo juego): tap = poner/quitar ──────────
// Puesta = marco ambar + check verde en la esquina (como el item elegido en los
// inventarios de juego). Libre = casilla elevada neutra.
function AccTile({ item, puesto, onTap }) {
  return (
    <motion.button
      type="button"
      whileTap={{ y: 2 }}
      onClick={onTap}
      aria-label={puesto ? `Quitar ${item.name}` : `Ponerse ${item.name}`}
      title={item.name}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 'var(--r-md)', cursor: 'pointer', padding: 0,
        background: puesto ? 'var(--amber-soft)' : 'var(--paper-alt)',
        border: `2px solid ${puesto ? 'var(--amber)' : 'var(--card-line)'}`,
        boxShadow: puesto ? '0 3px 0 color-mix(in srgb, var(--amber) 45%, transparent)' : '0 3px 0 var(--card-edge)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <AccThumb item={item} size={40} />
      {puesto && (
        <span style={{
          position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%',
          background: 'var(--olive)', color: '#fff', border: '2px solid var(--card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-3xs)', fontWeight: 900,
        }}>
          <i className="ti ti-check" />
        </span>
      )}
    </motion.button>
  )
}

// ─── Casilla vacia del inventario: "+" punteado que lleva a la tienda ─────────
function HuecoTile({ onTap }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onTap}
      aria-label="Conseguir mas en la tienda"
      style={{
        aspectRatio: '1', borderRadius: 'var(--r-md)', cursor: 'pointer', padding: 0,
        background: 'transparent', border: '2px dashed var(--paper-dark)', color: 'var(--ink-faint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-lg)',
      }}
    >
      <i className="ti ti-plus" />
    </motion.button>
  )
}

// ─── Casilla de fondo del hero: muestra el gradiente; tap = poner/quitar ──────
function BgTile({ item, puesto, onTap }) {
  return (
    <motion.button
      type="button" whileTap={{ y: 2 }} onClick={onTap}
      aria-label={puesto ? `Quitar fondo ${item.name}` : `Poner fondo ${item.name}`}
      title={item.name}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 'var(--r-md)', cursor: 'pointer', padding: 3,
        background: puesto ? 'var(--amber-soft)' : 'var(--paper-alt)',
        border: `2px solid ${puesto ? 'var(--amber)' : 'var(--card-line)'}`,
        boxShadow: puesto ? '0 3px 0 color-mix(in srgb, var(--amber) 45%, transparent)' : '0 3px 0 var(--card-edge)',
        display: 'flex',
      }}
    >
      <div style={{ flex: 1, borderRadius: 'calc(var(--r-md) - 5px)', background: item.bg.replace('transparent 100%', 'var(--card-2) 100%') }} />
      {puesto && (
        <span style={{
          position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%',
          background: 'var(--olive)', color: '#fff', border: '2px solid var(--card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-3xs)', fontWeight: 900,
        }}>
          <i className="ti ti-check" />
        </span>
      )}
    </motion.button>
  )
}

// ─── Casilla de comida: consumible. Tap = comprarla y Rockie se la come ya ────
function FoodTile({ item, alcanza, onTap }) {
  return (
    <motion.button
      type="button" whileTap={{ y: 2 }} onClick={onTap}
      aria-label={`Darle ${item.name} a Rockie`} title={item.name}
      style={{
        aspectRatio: '1', borderRadius: 'var(--r-md)', cursor: 'pointer', padding: 0,
        background: 'var(--paper-alt)', border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1 }}>{item.emoji}</span>
      <span className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: alcanza ? 'var(--amber)' : 'var(--ink-faint)' }}>
        🪙 {item.price}
      </span>
    </motion.button>
  )
}

// ─── Boton de icono del header: circulo de color solido con su canto 3D ───────
// Comunica con imagen (tienda = bolsa, inventario = mochila) y con color
// (tienda = ambar nuestro, inventario = azul). bg/color/edge lo pintan.
function HeaderIcon({ icon, label, onTap, delay = 0, bg = 'var(--card)', color = 'var(--ink-soft)', edge = 'var(--card-edge)', border = 'var(--card-line)' }) {
  const anim = useContext(EntranceCtx)
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      initial={false}
      animate={{ y: 0 }}
      transition={anim ? { delay, duration: 0.25, ease: 'easeOut' } : { duration: 0 }}
      whileTap={{ y: 3 }}
      onClick={onTap}
      className="q"
      style={{
        width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: '50%',
        background: bg, border: `2px solid ${border}`, boxShadow: `0 3px 0 ${edge}`,
        color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--text-xl)', cursor: 'pointer', flexShrink: 0,
      }}
    >
      <i className={`ti ${icon}`} />
    </motion.button>
  )
}

// ─── Seccion estilo perfil: etiqueta en mayusculas + flecha a la vista completa.
// El contenido va plano sobre el papel (sin caja): limpio, respira. ─────────────
function Section({ label, onMore, delay = 0, children }) {
  const anim = useContext(EntranceCtx)
  return (
    <motion.section
      initial={false}
      animate={{ y: 0 }}
      transition={anim ? { delay, duration: 0.28, ease: 'easeOut' } : { duration: 0 }}
      style={{ padding: 'var(--space-5) var(--screen-x) 0' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <span className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>{label}</span>
        {onMore && (
          <button
            type="button"
            aria-label={`Ver ${label.toLowerCase()} completo`}
            onClick={onMore}
            className="q"
            style={{
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-muted)',
              minWidth: 'var(--tap-min)', minHeight: 32, margin: '-6px 0', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 'var(--text-md)',
            }}
          >
            <i className="ti ti-chevron-right" />
          </button>
        )}
      </div>
      {children}
    </motion.section>
  )
}

// ─── Disco 2.5D de la racha: llama con anillo hacia los 21 dias ───────────────
const HABITO_DIAS = 21

function StreakPlate({ value, goal = HABITO_DIAS, children }) {
  const size = 72
  const sw = 6
  const r = size / 2 - sw / 2 - 1
  const c = 2 * Math.PI * r
  const pct = Math.min(1, value / goal)
  const done = value >= goal
  const stroke = done ? 'var(--green)' : 'var(--coral)'
  const edge = done ? 'var(--green-edge)' : 'var(--coral-edge)'
  return (
    <div style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
      borderRadius: '50%',
      background: 'var(--card)',
      border: '2px solid var(--card-line)',
      boxShadow: `0 3px 0 ${edge}`,
    }}>
      {/* width/height 100%: el viewBox se escala al padding-box (sin contar el borde),
          asi el aro queda concentrico. Atributos fijos de size lo corrían. */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          transform: 'rotate(-90deg)', transformOrigin: '50% 50%',
          overflow: 'visible',
        }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-alt)" strokeWidth={sw} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={sw}
          strokeLinecap="round"
          initial={false}
          animate={{ strokeDasharray: `${c * pct} ${c}` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* La llama es un pelin mas alta: sube 1px para el centro optico */}
        <div style={{ display: 'flex', transform: 'translateY(-1px)' }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Stat del resumen: gpill 2.5D (mismo idioma que el HUD de Hoy) ────────────
function ResumenChip({ icon, value, label, color = 'var(--ink)', edge = 'var(--card-edge)' }) {
  return (
    <div className="q gpill" style={{
      flex: 1,
      minWidth: 0,
      gap: 'var(--space-1)',
      padding: '6px var(--space-2)',
      boxShadow: `0 2px 0 ${edge}`,
      minHeight: 'var(--tap-min)',
      justifyContent: 'center',
    }}>
      <span style={{ fontSize: 'var(--text-s)', lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <span className="s" style={{ fontSize: 'var(--text-lg)', color, lineHeight: 1 }}>{value}</span>
      <span style={{
        fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700,
        letterSpacing: '0.4px', textTransform: 'uppercase',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
    </div>
  )
}

// Clip-path de hexagono (insignia). Misma pieza en la fila de Rockie y el sheet.
const HEX = 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)'

// ─── Insignia hexagonal plana (estetica B+): color solido + canto duro 3px,
// sin degradados ni drop-shadow. Tap abre el modal central. ───────────────────
function LogroCard({ a, onTap, wide = false }) {
  const size = wide ? 88 : 72
  const fill = a.done
    ? a.color
    : `color-mix(in srgb, ${a.color} 28%, var(--paper-alt))`
  const edge = a.done
    ? `color-mix(in srgb, ${a.color} 55%, transparent)`
    : 'var(--card-edge)'

  return (
    <motion.button
      type="button"
      whileTap={{ y: 3 }}
      onClick={onTap}
      aria-label={a.done ? `${a.name}: conseguido` : `${a.name}: ${a.pct}%`}
      title={a.name}
      className="q"
      style={{
        border: 'none', background: 'none', padding: 0,
        cursor: 'pointer', textAlign: 'center',
        width: wide ? '100%' : 84, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
      }}
    >
      <div style={{ position: 'relative', width: size, height: size * 1.12 }}>
        {/* Canto duro debajo (sombra B+: offset plano, sin blur) */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, top: 3,
          clipPath: HEX, background: edge,
        }} />
        {/* Cuerpo del hexagono */}
        <div style={{
          position: 'absolute', inset: 0,
          clipPath: HEX, background: 'var(--card)',
        }} />
        <div style={{
          position: 'absolute', inset: 4,
          clipPath: HEX, background: fill,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Circulo plano del icono */}
          <div style={{
            width: size * 0.46, height: size * 0.46, borderRadius: '50%',
            background: 'var(--card)',
            border: `2px solid ${a.done ? a.color : 'var(--card-line)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: wide ? 26 : 22, lineHeight: 1,
          }}>
            <span style={{
              filter: a.done ? 'none' : 'grayscale(1)',
              opacity: a.done ? 1 : 0.7,
            }}>{a.icon}</span>
          </div>
        </div>

        {/* Check (mismo lenguaje que AccTile) */}
        {a.done && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            style={{
              position: 'absolute', bottom: 2, right: -2,
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--olive)', color: '#fff',
              border: '2px solid var(--card)',
              fontSize: 'var(--text-3xs)', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <i className="ti ti-check" />
          </motion.span>
        )}

        {/* % en pill plana */}
        {!a.done && a.pct > 0 && (
          <span className="q" style={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--card)', border: '2px solid var(--card-line)',
            borderRadius: 'var(--r-pill)', padding: '1px 6px',
            fontSize: 'var(--text-3xs)', fontWeight: 800, color: a.color,
            boxShadow: '0 2px 0 var(--card-edge)', zIndex: 2, whiteSpace: 'nowrap',
          }}>
            {a.pct}%
          </span>
        )}
      </div>

      <div className="q" style={{
        fontSize: 'var(--text-3xs)', fontWeight: 700,
        color: a.done ? 'var(--ink)' : 'var(--ink-muted)',
        letterSpacing: '0.3px', lineHeight: 1.2,
        maxWidth: wide ? 110 : 80,
      }}>
        {a.short}
      </div>
    </motion.button>
  )
}

// ─── Muestra de color de la piedra (selector del inventario) ─────────────────
// `locked` = piedra sin comprar: se ve apagada con candado; tocarla avisa que
// se desbloquea en la Tienda (las piedras se COMPRAN, no se regalan).
function ColorSwatch({ c, on, locked, onTap }) {
  return (
    <motion.button
      type="button" whileTap={{ scale: 0.9 }} onClick={onTap}
      aria-label={`Piedra ${c.name}`} title={c.name}
      style={{
        position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '50%', cursor: 'pointer', padding: 0,
        background: c.swatch,
        opacity: locked ? 0.45 : 1,
        border: `3px solid ${on ? 'var(--amber)' : 'var(--card)'}`,
        boxShadow: on ? '0 3px 0 color-mix(in srgb, var(--amber) 45%, transparent)' : '0 2px 0 var(--card-edge)',
      }}
    >
      {on && (
        <span style={{
          position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
          background: 'var(--olive)', color: '#fff', border: '2px solid var(--card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-3xs)', fontWeight: 900,
        }}>
          <i className="ti ti-check" />
        </span>
      )}
      {locked && (
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 'var(--text-sm)',
        }}>
          <i className="ti ti-lock" />
        </span>
      )}
    </motion.button>
  )
}

// ─── Casilla de parte de la cara (ojos o boca): mini cara real, o ✨ = Auto ───
// kind='eyes' muestra ese ojo con boca neutra; kind='mouth' al reves. idx null =
// Automatico (esa parte sigue el cumplimiento del dia).
function FacePartTile({ kind, idx, on, onTap, color, stage }) {
  const capa = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }
  const eyes = kind === 'eyes' ? idx : NEUTRAL_EYES
  const mouth = kind === 'mouth' ? idx : NEUTRAL_MOUTH
  return (
    <motion.button
      type="button" whileTap={{ scale: 0.92 }} onClick={onTap}
      aria-label={idx == null ? `${kind === 'eyes' ? 'Ojos' : 'Boca'} automatico` : `${kind === 'eyes' ? 'Ojos' : 'Boca'} ${idx}`}
      style={{
        position: 'relative', width: '100%', borderRadius: 'var(--r-md)', cursor: 'pointer', padding: 'var(--space-1) 0 3px',
        background: on ? 'var(--amber-soft)' : 'var(--paper-alt)',
        border: `2px solid ${on ? 'var(--amber)' : 'var(--card-line)'}`,
        boxShadow: on ? '0 3px 0 color-mix(in srgb, var(--amber) 45%, transparent)' : '0 3px 0 var(--card-edge)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}
    >
      <div style={{ position: 'relative', width: 60, height: 60 }}>
        {idx == null ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>✨</div>
        ) : (
          <>
            {/* La base es la piedra del color y etapa actuales (como el Rockie real) */}
            <img src={stoneArt(color, stage)} alt="" style={capa} loading="lazy" decoding="async" />
            <img src={rockieArt(`eyes/ojos${eyes}`)} alt="" style={capa} loading="lazy" decoding="async" />
            <img src={rockieArt(`mouth/boca${mouth}`)} alt="" style={capa} loading="lazy" decoding="async" />
          </>
        )}
      </div>
      <span className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: on ? 'var(--amber)' : 'var(--ink-muted)' }}>{idx == null ? 'Auto' : idx}</span>
    </motion.button>
  )
}

// ─── Casilla "aleatorio": tira una parte de la cara al azar (reemplaza al Auto) ─
function RandomTile({ onTap }) {
  return (
    <motion.button
      type="button" whileTap={{ scale: 0.9, rotate: -10 }} onClick={onTap}
      aria-label="Aleatorio"
      style={{
        position: 'relative', width: '100%', borderRadius: 'var(--r-md)', cursor: 'pointer', padding: 'var(--space-1) 0 3px',
        background: 'var(--paper-alt)', border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}
    >
      <div style={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🎲</div>
      <span className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>Random</span>
    </motion.button>
  )
}

// ─── Encabezado de fila (Ojos / Boca) con su propio "Ver todo" ────────────────
function FacePartHeader({ label, onAll }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <div className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: 'var(--ink-soft)' }}>{label}</div>
      <button
        type="button" onClick={onAll} aria-label={`Ver todos los ${label.toLowerCase()}`} className="q"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer',
          color: 'var(--ink-muted)', fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: 0.5,
          textTransform: 'uppercase', minHeight: 28, padding: 0,
        }}
      >
        Ver todo <i className="ti ti-layout-grid" style={{ fontSize: 'var(--text-sm)' }} />
      </button>
    </div>
  )
}

// ─── Carrusel horizontal de una parte de la cara (ojos o boca): desliza L/R ────
// Una sola fila (poco alto). En tactil manda el scroll nativo (touch-action
// 'pan-x pan-y' = deja pasar el arrastre VERTICAL a la hoja: si el dedo baja/sube
// sobre una casilla, la hoja scrollea igual que sobre el resto). En desktop se
// arrastra con el raton (pointer). Primer item = aleatorio; el resto las opciones.
function FaceCarousel({ kind, options, currentIdx, onPick, onRoll, color, stage }) {
  const ref = useRef(null)
  const drag = useRef({ down: false, moved: false, x: 0, left: 0 })

  const onDown = (e) => {
    if (e.pointerType === 'touch') return // en tactil manda el scroll nativo
    drag.current = { down: true, moved: false, x: e.clientX, left: ref.current.scrollLeft }
  }
  const onMove = (e) => {
    if (!drag.current.down) return
    const dx = e.clientX - drag.current.x
    if (Math.abs(dx) > 4) drag.current.moved = true
    ref.current.scrollLeft = drag.current.left - dx
  }
  const onUp = () => { drag.current.down = false }
  // Si hubo arrastre, cancela el click del tile (no selecciona al soltar)
  const onClickCapture = (e) => {
    if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false }
  }

  return (
    <div
      ref={ref}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      onClickCapture={onClickCapture}
      style={{
        display: 'flex', gap: 'var(--space-2)', overflowX: 'auto',
        padding: '3px 3px var(--space-1)', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y', cursor: 'grab',
      }}
    >
      <div style={{ width: 86, flexShrink: 0 }}>
        <RandomTile onTap={onRoll} />
      </div>
      {options.map(n => (
        <div key={n} style={{ width: 86, flexShrink: 0 }}>
          <FacePartTile kind={kind} idx={n} on={currentIdx === n} onTap={() => onPick(n)} color={color} stage={stage} />
        </div>
      ))}
    </div>
  )
}

export default function RockieScreen() {
  const {
    rockie, emotion, allHabits,
    coins, level, streak, totalDone, lastLevelUp,
    equipped, shopOwned, equipItem, buyItem, friends, groups,
    rockieColor, rockieFace, setRockieColor, setRockieEyes, setRockieMouth,
    me, user,
  } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const wide = useDesktop()
  // Volviendo de la tienda: entrada como una sola pieza (sin cascada interna)
  const fromTienda = !!location.state?.fromTienda
  const anim = !fromTienda   // mismo flag que EntranceCtx: revela el hero por partes
  const invRoute = location.pathname === '/rockie/inventario'
  const [panel, setPanel] = useState(invRoute ? 'inv' : null)        // null | 'inv' | 'evo' | 'logros' | 'amigos' | 'qr'
  const [faceAll, setFaceAll] = useState(null)    // vista completa: null | 'eyes' | 'mouth'
  const [invCat, setInvCat] = useState('acc')     // categoria de objetos del inventario (como la tienda)
  const [invFx, setInvFx] = useState(0)           // festejo del preview del inventario al darle comida
  const [busca, setBusca] = useState('')          // buscador de la pantalla Rockies amigos
  const [toast, setToast] = useState('')
  const [logroFocus, setLogroFocus] = useState(null) // logro abierto en modal central
  const [levelUpFx, setLevelUpFx] = useState(0)
  const prevLevel = useRef(level)
  const toastTimer = useRef(null)

  // Reacciona y celebra inmediatamente al subir de nivel
  useEffect(() => {
    if (prevLevel.current && level > prevLevel.current) {
      setLevelUpFx(Date.now())
      playSfx('unlock')
    }
    prevLevel.current = level
  }, [level])

  useEffect(() => () => { clearTimeout(toastTimer.current) }, [])

  // Rail desktop / deep link: /rockie/inventario abre el sheet; salir de la
  // ruta lo cierra. Misma pantalla (pageKey compartido), sin remount.
  useEffect(() => {
    if (invRoute) setPanel('inv')
    else setPanel(p => (p === 'inv' ? null : p))
  }, [invRoute])

  const flash = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1800)
  }

  // Aleatorio: tira una parte de la cara al azar (evita repetir la actual)
  const rollPart = (options, current, setter, label) => {
    const pool = options.filter(n => n !== current)
    const pick = pool[Math.floor(Math.random() * pool.length)]
    setter(pick)
    flash(`${label} ${pick} 🎲`)
  }
  const rollEyes = () => rollPart(EYE_OPTIONS, rockieFace?.eyes, setRockieEyes, 'Ojos')
  const rollMouth = () => rollPart(MOUTH_OPTIONS, rockieFace?.mouth, setRockieMouth, 'Boca')

  // Darle comida desde el inventario: compra el antojo y Rockie celebra al instante
  const darComida = async (item) => {
    const res = await buyItem(item.id)
    if (!res.ok) {
      playSfx('softFail')
      flash(res.error === 'saldo' ? `Te faltan ${item.price - coins} monedas 🪙` : 'Ahora no se pudo 🔒')
      return
    }
    playSfx('purchase')
    setInvFx(Date.now())
    flash(res.frase || '¡Nam! Gracias 🍪')
  }

  // Abrir / cerrar inventario: URL propia para el rail; en movil el boton
  // mochila hace lo mismo (asi el historial y el item activo coinciden).
  const abrirInventario = () => navigate('/rockie/inventario')
  const cerrarInventario = () => {
    setPanel(null)
    if (invRoute) navigate('/rockie', { replace: true })
  }

  // Ir a la Tienda desde el inventario: cierra la hoja y entra la tienda
  // deslizando de derecha a izquierda (pager 'toTienda' del AppShell). `replace`
  // consume la entrada fantasma del inventario en el historial: al retroceder
  // desde la tienda se vuelve a Rockie, NO al inventario.
  const irATienda = () => { setPanel(null); navigate('/rockie/tienda', { replace: true }) }

  // Festejo de subida de nivel (el store la dispara al cruzar el XP)
  useEffect(() => {
    if (!lastLevelUp || Date.now() - lastLevelUp > 4000) return
    flash(`¡Nivel ${level}! 🎉`)
  }, [lastLevelUp]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Derivados del estado real ----
  const xpPct = Math.min(100, Math.round((rockie.xp / rockie.xpToNext) * 100))
  const dias = rockie.daysTogether
  // Etapa de evolucion actual segun nivel real
  const stageIdx = Math.max(0, EVO.filter(e => rockie.level >= e.lvl).length - 1)

  // Inventario real por categoria (mismo corte que la tienda: acc / bg / food).
  // Memoizado: RockieScreen re-renderiza ante cualquier cambio del store; estas
  // listas solo dependen de shopOwned/equipped, no de coins/xp/etc.
  const ownedAcc = useMemo(() => shopOwned.map(itemById).filter(i => i && i.type === 'acc'), [shopOwned])
  const accTotal = SHOP_ITEMS.filter(i => i.type === 'acc').length
  // Huecos del grid: rellena hasta 2 filas de 4 (y deja siempre al menos un "+")
  const huecos = Math.max(1, Math.max(8, Math.ceil(ownedAcc.length / 4) * 4) - ownedAcc.length)
  const ownedBg = useMemo(() => shopOwned.map(itemById).filter(i => i && i.type === 'bg'), [shopOwned])
  const bgTotal = SHOP_ITEMS.filter(i => i.type === 'bg').length
  const foods = SHOP_ITEMS.filter(i => i.type === 'food')
  const fondoItem = itemById(equipped?.fondo)

  // Mejor racha de un habito concreto (accion → habito a los 21 dias)
  const bestHabitStreak = useMemo(
    () => allHabits.reduce((m, h) => Math.max(m, h.streak || 0), 0),
    [allHabits],
  )
  const rachaHabito = Math.max(streak, bestHabitStreak)

  // Logros DERIVADOS de datos reales (nada hardcodeado).
  const logros = useMemo(() => [
    {
      id: 'primer_habito',
      icon: '💎', name: 'Primera Grieta', short: '1.er Habito',
      done: totalDone >= 1,
      meta: totalDone >= 1 ? 'Tu primera victoria real' : 'Completa tu primer habito',
      color: 'var(--azure)', pct: Math.min(100, totalDone >= 1 ? 100 : 0),
    },
    {
      id: 'racha_7',
      icon: '🔥', name: 'Cristal Asomando', short: '7 dias',
      done: streak >= 7,
      meta: streak >= 7 ? '7 dias seguidos' : `Te faltan ${Math.max(0, 7 - streak)} dias`,
      color: 'var(--amber)', pct: Math.min(100, Math.round((streak / 7) * 100)),
    },
    {
      id: 'nivel_5',
      icon: '✨', name: 'Joven Geoda', short: 'Nivel 5',
      done: level >= 5,
      meta: level >= 5 ? 'Rockie revelo sus primeros cristales' : `Nivel ${level} de 5`,
      color: 'var(--brand)', pct: Math.min(100, Math.round((level / 5) * 100)),
    },
    {
      id: 'habito_21',
      icon: '🌱', name: 'Veta Forjada', short: '21 dias',
      done: rachaHabito >= HABITO_DIAS,
      meta: rachaHabito >= HABITO_DIAS
        ? '21 dias: ya es parte de ti'
        : `${rachaHabito} de ${HABITO_DIAS} dias para consolidarlo`,
      color: 'var(--green)', pct: Math.min(100, Math.round((rachaHabito / HABITO_DIAS) * 100)),
    },
    {
      id: 'racha_30',
      icon: '⭐', name: 'Gema Formada', short: '30 dias',
      done: streak >= 30,
      meta: streak >= 30 ? '30 dias: leyenda viva' : `Te faltan ${Math.max(0, 30 - streak)} dias`,
      color: 'var(--coral)', pct: Math.min(100, Math.round((streak / 30) * 100)),
    },
    {
      id: 'veta_grupal',
      icon: '🤝', name: 'Veta Grupal', short: 'Comunidad',
      done: (groups?.length || 0) >= 1 || (friends?.length || 0) >= 1,
      meta: ((groups?.length || 0) >= 1 || (friends?.length || 0) >= 1)
        ? 'Conectado con tu grupo de apoyo'
        : 'Unete a un grupo o suma un amigo',
      color: 'var(--azure)', pct: ((groups?.length || 0) >= 1 || (friends?.length || 0) >= 1) ? 100 : 0,
    },
    {
      id: 'nivel_15',
      icon: '👑', name: 'Maestro Mineral', short: 'Nivel 15',
      done: level >= 15,
      meta: level >= 15 ? 'Rockie en su etapa superior' : `Nivel ${level} de 15`,
      color: 'var(--berry)', pct: Math.min(100, Math.round((level / 15) * 100)),
    },
    {
      id: 'habitos_100',
      icon: '💪', name: 'Cien Victorias', short: '100 Hechos',
      done: totalDone >= 100,
      meta: totalDone >= 100 ? `${totalDone} habitos completados` : `Vas ${totalDone} de 100 habitos`,
      color: 'var(--olive)', pct: Math.min(100, Math.round((totalDone / 100) * 100)),
    },
  ], [totalDone, streak, level, rachaHabito, groups, friends])

  // Deep links: ?panel=logros | ?logro=<id>
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const p = params.get('panel')
    if (p && ['inv', 'evo', 'logros', 'amigos', 'qr'].includes(p)) setPanel(p)
    const logParam = params.get('logro')
    if (logParam) {
      const found = logros.find(l => l.id === logParam)
      if (found) setLogroFocus(found)
    }
  }, [location.search, logros])

  // Deteccion de logros nuevos: SOLO se dispara en la vista principal en reposo (sin paneles abiertos)
  // y nunca interrumpe cuando el usuario esta personalizando en el inventario o la tienda.
  const isFirstMount = useRef(true)
  useEffect(() => {
    try {
      const vistosRaw = localStorage.getItem('bplus.logrosVistos')
      const vistos = vistosRaw ? JSON.parse(vistosRaw) : null

      // En el primer montaje en frio, si no habia historial, registrar los preexistentes silenciosamente
      if (isFirstMount.current) {
        isFirstMount.current = false
        if (!vistos) {
          const yaHechos = logros.filter(l => l.done).map(l => l.id || l.name)
          localStorage.setItem('bplus.logrosVistos', JSON.stringify(yaHechos))
          return
        }
      }

      // Si el usuario esta en un panel secundario (inventario, seleccion de cara/color, amigos), NO interrumpir
      if (panel !== null || invRoute || faceAll !== null) return

      const listaVistos = vistos || []
      const nuevo = logros.find(l => l.done && !listaVistos.includes(l.id || l.name))
      if (nuevo) {
        setLogroFocus(nuevo)
        const actualizados = [...listaVistos, nuevo.id || nuevo.name]
        localStorage.setItem('bplus.logrosVistos', JSON.stringify(actualizados))
      }
    } catch { /* sin localStorage */ }
  }, [logros, panel, invRoute, faceAll])
  const logrosHechos = logros.filter(a => a.done).length
  // Rockies de amigos derivados de los amigos reales (ordenados por nivel)
  const friendRockies = useMemo(() => [...friends]
    .sort((a, b) => b.level - a.level)
    .slice(0, 8)
    .map(f => ({
      name: f.name, img: evoOf(f.level), level: f.level,
      mood: f.done >= f.total && f.total > 0 ? '🤩' : f.done > 0 ? '😊' : '😴',
      risk: f.done === 0,
    })), [friends])

  // Ranking completo para la pantalla Rockies amigos: tus amigos + TU Rockie,
  // ordenados por nivel (asi ves donde vas tu). pos se fija ANTES de filtrar
  // para que el buscador no invente posiciones. El orden/pos solo depende de
  // los amigos y tu nivel; el filtro del buscador se aplica aparte.
  const filtro = busca.trim().toLowerCase()
  const rankFull = useMemo(() => [
    { id: 'yo', name: rockie.name, level, streak, img: evoOf(level), self: true },
    ...friends.map(f => ({
      id: f.id, name: f.name, level: f.level, streak: f.streak, img: evoOf(f.level),
      risk: f.done === 0,
    })),
  ]
    .sort((a, b) => b.level - a.level)
    .map((f, i) => ({ ...f, pos: i + 1 })), [friends, rockie.name, level, streak])
  const rankAmigos = useMemo(
    () => rankFull.filter(f => !filtro || f.name.toLowerCase().includes(filtro)),
    [rankFull, filtro],
  )

  // Piezas compartidas movil / PC
  const resumenCard = (
    <div className="gsurf" style={{ borderRadius: 'var(--r-xl)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <StreakPlate value={streak} goal={HABITO_DIAS}>
          <Flame size={32} lit={streak > 0} embers />
        </StreakPlate>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--coral)', lineHeight: 1 }}>
              <CountUp value={streak} />
            </span>
            <span className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', fontWeight: 700 }}>
              {streak === 1 ? 'dia de racha' : 'dias de racha'}
            </span>
          </div>
          <div className="q" style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, marginTop: 'var(--space-1)',
            color: streak >= HABITO_DIAS ? 'var(--green)' : 'var(--ink-muted)',
          }}>
            {streak <= 0
              ? 'Empieza hoy: 21 dias y se vuelve habito'
              : streak >= HABITO_DIAS
                ? 'Ya es habito — sigue la cadena'
                : `${HABITO_DIAS - streak} dias mas para consolidarlo`}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
          <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: 0.5 }}>
            HACIA HABITO
          </span>
          <span className="q" style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700,
            color: streak >= HABITO_DIAS ? 'var(--green)' : 'var(--coral)',
          }}>
            {Math.min(streak, HABITO_DIAS)} / {HABITO_DIAS}
          </span>
        </div>
        <ProgressBar
          value={Math.min(100, (streak / HABITO_DIAS) * 100)}
          height={14}
          fill={streak >= HABITO_DIAS
            ? 'linear-gradient(90deg, var(--olive), var(--green))'
            : 'linear-gradient(90deg, var(--amber), var(--coral))'}
          fillEdge={streak >= HABITO_DIAS ? 'var(--green-edge)' : 'var(--coral-edge)'}
        />
      </div>

      <div style={{
        display: 'flex', flexWrap: 'nowrap', gap: 'var(--space-2)',
        marginTop: 'var(--space-4)', width: '100%',
      }}>
        <ResumenChip icon="🏅" value={level} label={EVO[stageIdx].name} color="var(--azure)" edge="var(--azure-edge)" />
        <ResumenChip icon="💪" value={totalDone} label="hechos" color="var(--olive)" edge="var(--olive-edge)" />
        <ResumenChip icon="🪙" value={coins} label="monedas" color="var(--amber)" edge="var(--amber-edge)" />
      </div>
    </div>
  )
  const friendTiles = (
    <>
      {friendRockies.map(f => (
        <motion.div
          key={f.name}
          whileTap={{ y: 2 }}
          onClick={() => flash(f.risk ? `💪 ¡Animo enviado a ${f.name}!` : `🤗 Abrazo enviado a ${f.name}`)}
          style={{ textAlign: 'center', cursor: 'pointer', flexShrink: 0, width: 62 }}
        >
          <div style={{
            width: 58, height: 58, borderRadius: '50%', margin: '0 auto',
            background: 'var(--card)', border: `2px solid ${f.risk ? 'var(--coral)' : 'var(--card-line)'}`,
            boxShadow: '0 3px 0 var(--card-edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={rockieArt(`evo/${f.img}`)} alt={f.name} loading="lazy" decoding="async" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          </div>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-soft)', fontWeight: 600, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--green)', fontWeight: 700 }}>Lvl {f.level} {f.mood}</div>
        </motion.div>
      ))}
      {/* Huecos por llenar: invitan a traer amigos (abren el QR) */}
      {Array.from({ length: Math.max(1, 4 - friendRockies.length) }).map((_, i) => (
        <motion.div
          key={`invitar-${i}`}
          whileTap={{ scale: 0.94 }}
          onClick={() => setPanel('qr')}
          style={{ textAlign: 'center', cursor: 'pointer', flexShrink: 0, width: 62 }}
        >
          <div style={{
            width: 58, height: 58, borderRadius: '50%', margin: '0 auto',
            border: '2px dashed var(--paper-dark)', color: 'var(--ink-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xl)',
          }}>
            <i className="ti ti-plus" />
          </div>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 600, marginTop: 4 }}>Invitar</div>
        </motion.div>
      ))}
    </>
  )
  const dueno = (me?.name && me.name !== 'Tu')
    ? me.name.split(' ')[0]
    : (user?.user_metadata?.full_name?.split(' ')[0] || user?.user_metadata?.name?.split(' ')[0] || null)

  // ==== PC: la sala de Rockie ====
  // Escenario grande con su fondo (tocar = evolucion), resumen y amigos al
  // lado, logros en rejilla. El inventario se abre como probador lateral y
  // Rockie sigue a la vista mientras lo vistes.
  const deskRoom = (
    <div className="dk-page rkd">
      <header className="dk-head">
        <div>
          <div className="q dk-eyebrow">{rockie.name}{dueno ? ` · de ${dueno}` : ''} · {dias} {dias === 1 ? 'día' : 'días'} juntos</div>
          <h1 className="dk-title">Rockie</h1>
          <p className="q dk-sub">Tu compañero crece contigo: cada victoria real lo hace brillar un poco más.</p>
        </div>
        <div className="dk-head-actions">
          <span className="gpill q rkd-coins">🪙 <b className="s">{coins}</b></span>
          <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => setPanel('qr')}><i className="ti ti-qrcode" /> Invitar</button>
          <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--azure)', '--edge': 'var(--azure-edge)' }} onClick={abrirInventario}><i className="ti ti-backpack" /> Inventario</button>
          <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--amber)', '--edge': 'var(--amber-edge)' }} onClick={() => navigate('/rockie/tienda')}><i className="ti ti-building-store" /> Tienda</button>
        </div>
      </header>

      <div className="rkd-room">
        <section className="rkd-stage" style={{ background: fondoItem?.bg || FONDO_DEFAULT }}>
          {SPARKLES.map((sp, i) => (
            <span key={i} aria-hidden="true" className="rkd-spark" style={{
              top: sp.top, left: sp.left, right: sp.right, bottom: sp.bottom,
              fontSize: sp.size, color: sp.color, animationDelay: `${sp.delay}s`,
            }}>✦</span>
          ))}
          <motion.div
            whileTap={{ scale: 0.97 }}
            onClick={() => setPanel('evo')}
            role="button"
            aria-label="Ver la evolución de Rockie"
            className="rkd-rockie"
          >
            <Rockie
              emotion={emotion}
              size={300}
              moods={false}
              equipped={equipped}
              color={rockieColor}
              stage={stageOfLevel(level)}
              fx={levelUpFx ? 'levelup' : null}
              fxKey={levelUpFx}
            />
          </motion.div>
          <div aria-hidden="true" className="rkd-shadow" />
          <button type="button" className="q rkd-evo" onClick={() => setPanel('evo')}>
            💎 {EVO[stageIdx].name} · ver su evolución <i className="ti ti-chevron-right" />
          </button>
          <div className="rkd-xp">
            <div className="rkd-xp-head q">
              <span>Nivel {rockie.level} → {rockie.level + 1}</span>
              <b>{rockie.xp} / {rockie.xpToNext} XP</b>
            </div>
            <ProgressBar value={xpPct} height={16} fill="linear-gradient(90deg, var(--amber), var(--coral))" fillEdge="var(--coral-edge)" />
          </div>
        </section>

        <aside className="rkd-side">
          <section>
            <div className="dk-sechead"><span className="q dk-label">Resumen</span></div>
            {resumenCard}
          </section>
          <section className="dk-card">
            <div className="dk-sechead">
              <span className="q dk-label">Rockies amigos</span>
              <button type="button" className="dk-link" onClick={() => { setBusca(''); setPanel('amigos') }}>Ver ranking <i className="ti ti-arrow-right" /></button>
            </div>
            <div className="rkd-friends">{friendTiles}</div>
          </section>
        </aside>
      </div>

      <section className="dk-card">
        <div className="dk-sechead">
          <span className="q dk-label">Logros · {logros.filter(l => l.done).length} de {logros.length}</span>
          <button type="button" className="dk-link" onClick={() => setPanel('logros')}>Ver todos <i className="ti ti-arrow-right" /></button>
        </div>
        <div className="rkd-logros">
          {logros.map((lg) => (
            <div key={lg.name} className="rkd-logro">
              <LogroCard a={lg} onTap={() => setLogroFocus(lg)} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  return (
    <EntranceCtx.Provider value={!fromTienda}>
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 'var(--space-4)', overflowX: 'clip' }}>
      {/* Contenido principal como PAGINA: al abrir el inventario se desliza a la
          izquierda mientras el panel entra por la derecha (pager de una sola
          pieza, igual que la Tienda) — Rockie deja de verse detras. Los paneles
          usan portal, asi que este transform no los arrastra; el toast queda
          FUERA del slider para seguir visible sobre el inventario. */}
      {/* Transicion CSS (no framer: el animate se ignoraba aqui por los
          AnimatePresence anidados de las secciones). translateX -100% =
          Rockie sale por la izquierda mientras el inventario entra por la
          derecha; el ease casa con el spring casi-critico del sheet. */}
      {wide ? deskRoom : (
      <div
        style={{
          display: 'flex', flexDirection: 'column',
          transform: panel === 'inv' ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.44s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
      {/* Rockie OS: selector de apps (Inicio, Agenda, Equipo, Cuaderno) */}
      <div style={{ padding: 'var(--space-5) var(--screen-x) 0' }}><OsSwitcher /></div>
      {/* ── Header estilo perfil: identidad + saldo + accesos por color/icono
          (tienda = ambar a la izquierda · inventario = azul a la derecha) ── */}
      <div style={{ padding: 'var(--space-4) var(--screen-x) 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <motion.div
          style={{ minWidth: 0 }}
          initial={false}
          animate={{ y: 0 }}
          transition={anim ? { duration: 0.28, ease: 'easeOut' } : { duration: 0 }}
        >
          <div className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--title)', lineHeight: 1, letterSpacing: '-0.3px' }}>Rockie</div>
          {(() => {
            return (
              <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginTop: 5, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rockie.name} {dueno ? `· de ${dueno}` : ''} · {dias} {dias === 1 ? 'dia' : 'dias'}
              </div>
            )
          })()}
        </motion.div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
          <motion.span
            className="q gpill" style={{ fontSize: 'var(--text-sm)' }}
            initial={false}
            animate={{ y: 0 }}
            transition={anim ? { delay: 0.03, duration: 0.25, ease: 'easeOut' } : { duration: 0 }}
          >
            <span style={{ fontSize: 'var(--text-md)' }}>🪙</span>
            <span className="s" style={{ color: 'var(--amber)', fontSize: 'var(--text-base)' }}>{coins}</span>
          </motion.span>
          <HeaderIcon icon="ti-building-store" label="Tienda de Rockie" onTap={() => navigate('/rockie/tienda')} bg="var(--amber)" color="#fff" edge="var(--amber-edge)" border="transparent" />
          <HeaderIcon icon="ti-backpack" label="Inventario de Rockie" onTap={abrirInventario} bg="var(--azure)" color="#fff" edge="var(--azure-edge)" border="transparent" delay={0.06} />
          {/* Ajustes: la ruedita vive aqui (pantalla de identidad); estilo neutro
              para leerse como utilidad, no como las acciones de color de al lado */}
          <HeaderIcon icon="ti-settings" label="Ajustes" onTap={() => navigate('/ajustes')} delay={0.09} />
        </div>
      </div>

      {/* ── HERO: Rockie con sus accesorios sobre el fondo equipado.
          Tocar a Rockie abre su Evolucion. El QR de invitar vive abajo, en la
          esquina del hero (boton circular). ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-2) 0 0' }}>
        <motion.div
          initial={false}
          animate={{ y: 0, scale: 1 }}
          transition={anim ? { delay: 0.06, type: 'spring', stiffness: 260, damping: 22 } : { duration: 0 }}
          style={{
            position: 'relative', padding: 'var(--space-2) var(--space-8)',
            background: fondoItem?.bg || FONDO_DEFAULT,
            borderRadius: 'var(--r-xl)', margin: '0 var(--screen-x)', alignSelf: 'stretch',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}
        >
          {SPARKLES.map((s, i) => (
            <span key={i} aria-hidden="true" style={{
              position: 'absolute', top: s.top, left: s.left, right: s.right, bottom: s.bottom,
              fontSize: s.size, color: s.color, pointerEvents: 'none',
              animation: `shine 3.2s ease-in-out ${s.delay}s infinite`,
            }}>✦</span>
          ))}
          {/* Sin fx ni tap-cara propio: la cara es la configurada (nada la pisa).
              El tap lo maneja este wrapper -> abre Evolucion. */}
          <motion.div
            whileTap={{ scale: 0.96 }}
            onClick={() => setPanel('evo')}
            role="button"
            aria-label="Ver la evolucion de Rockie"
            style={{ cursor: 'pointer' }}
          >
            <Rockie
              emotion={emotion}
              size={225}
              moods={false}
              equipped={equipped}
              color={rockieColor}
              stage={stageOfLevel(level)}
              fx={levelUpFx ? 'levelup' : null}
              fxKey={levelUpFx}
            />
          </motion.div>
          {/* Sombra eliptica: ancla al suelo y respira con el float */}
          <div aria-hidden="true" style={{
            width: 110, height: 16, borderRadius: '50%', background: 'rgba(87, 82, 121, 0.13)',
            margin: 'var(--space-2) auto 0', animation: 'shadow-pulse 3s ease-in-out infinite',
          }} />

          {/* Invitar por QR: boton circular en la esquina inferior del hero */}
          <motion.button
            type="button"
            whileTap={{ y: 3 }}
            onClick={() => setPanel('qr')}
            aria-label="Invitar amigos con QR"
            title="Invitar amigos con QR"
            className="q"
            style={{
              position: 'absolute', bottom: 'var(--space-2)', right: 'var(--space-2)',
              width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: '50%',
              background: 'var(--card)', border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
              color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-lg)', cursor: 'pointer',
            }}
          >
            <i className="ti ti-qrcode" />
          </motion.button>
        </motion.div>

        {/* Pista + acceso a Evolucion: pildora con la etapa actual (toca a Rockie) */}
        <motion.button
          type="button"
          whileTap={{ y: 2 }}
          onClick={() => setPanel('evo')}
          className="q"
          initial={false}
          animate={{ y: 0 }}
          transition={anim ? { delay: 0.12, duration: 0.26, ease: 'easeOut' } : { duration: 0 }}
          style={{
            marginTop: 'var(--space-3)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
            background: 'var(--card)', border: '2px solid var(--card-line)', boxShadow: '0 2px 0 var(--card-edge)',
            borderRadius: 'var(--r-pill)', padding: '5px var(--space-3)', color: 'var(--ink-soft)',
            fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: 0.3,
          }}
        >
          💎 {EVO[stageIdx].name} · toca a Rockie <i className="ti ti-chevron-right" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }} />
        </motion.button>

        {/* Barra hacia el siguiente nivel (XP real; anima al ganar) */}
        <motion.div
          initial={false}
          animate={{ y: 0 }}
          transition={anim ? { delay: 0.16, duration: 0.28, ease: 'easeOut' } : { duration: 0 }}
          style={{ width: '100%', padding: '0 var(--screen-x)', marginTop: 'var(--space-3)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
            <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: 0.5 }}>HACIA NIVEL {rockie.level + 1}</span>
            <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--amber)', fontWeight: 700 }}>{rockie.xp} / {rockie.xpToNext} XP</span>
          </div>
          <ProgressBar value={xpPct} height={16} fill="linear-gradient(90deg, var(--amber), var(--coral))" fillEdge="var(--coral-edge)" />
        </motion.div>
      </div>

      {/* ── RESUMEN 2.5D: racha con canto + ProgressBar hacia 21 + gpills ── */}
      <Section label="Resumen" delay={0.08}>
        {resumenCard}
      </Section>

      {/* ── LOGROS: insignias hexagonales; tap abre modal central de celebracion ── */}
      <Section label="Logros" onMore={() => setPanel('logros')} delay={0.12}>
        <div style={{
          display: 'flex', gap: 'var(--space-3)', overflowX: 'auto',
          paddingTop: 'var(--space-2)', paddingBottom: 'var(--space-3)',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}>
          {logros.map((a) => (
            <div key={a.name}>
              <LogroCard a={a} onTap={() => setLogroFocus(a)} />
            </div>
          ))}
        </div>
      </Section>

      {/* ── ROCKIES AMIGOS: avatares en fila + circulos punteados para invitar (QR);
          flecha = pantalla completa con buscador y ranking ── */}
      <Section label="Rockies amigos" onMore={() => { setBusca(''); setPanel('amigos') }} delay={0.16}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', overflowX: 'auto', paddingBottom: 'var(--space-1)', scrollbarWidth: 'none' }}>
          {friendTiles}
        </div>
      </Section>
      </div>
      )}

      {/* ── Toast propio (FUERA del slider: sigue visible sobre el inventario) ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            className="q"
            style={{
              position: 'absolute', top: 'var(--space-6)', left: '50%', transform: 'translateX(-50%)',
              zIndex: 95,
              background: 'var(--card)',
              color: 'var(--ink)',
              border: '2px solid var(--brand)',
              borderRadius: 'var(--r-pill)',
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)', fontWeight: 800,
              boxShadow: '0 8px 24px var(--shadow-card), 0 2px 0 var(--brand-edge)',
              whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal: Inventario estilo juego — Rockie centrado + grid de casillas ── */}
      <FullScreenSheet open={panel === 'inv'} onClose={cerrarInventario} title="🎒 Inventario">
        {/* Rockie al centro con lo puesto: equipar aqui se refleja al instante.
            Mismo tamano/estilo que el preview de la Tienda (hero grande).
            moods={false}: el preview muestra la cara configurada tal cual. */}
        <div style={{
          borderRadius: 'var(--r-xl)', border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
          background: fondoItem?.bg || FONDO_DEFAULT,
          display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-3) 0 var(--space-2)',
        }}>
          <Rockie size={120} emotion={emotion} equipped={equipped} color={rockieColor} stage={stageOfLevel(level)} moods={false} fx={invFx ? 'celebrate' : null} fxKey={invFx} />
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: 0.5, marginTop: 'var(--space-1)' }}>ASI SE VE HOY</div>
        </div>

        {/* Color de la piedra: recolorea el cuerpo al instante (persistido) */}
        <div>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: 1, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>Color de la piedra</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)' }}>
            {ROCKIE_COLORS.map(c => (
              // Todos los colores vienen desbloqueados: tocar = vestir esa piedra
              <ColorSwatch
                key={c.id} c={c} on={rockieColor === c.id} locked={false}
                onTap={() => { setRockieColor(c.id); playSfx('equip'); flash(`Piedra ${c.name} ✨`) }}
              />
            ))}
          </div>
        </div>

        {/* Expresion: dos carruseles (ojos / boca) que se deslizan L/R en una fila
            cada uno (ocupan poco alto). Cada fila tiene su propio "Ver todo" que
            abre SOLO esa parte en rejilla (pestaña central con blur). */}
        <div>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: 1, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>Expresion</div>

          <FacePartHeader label="Ojos" onAll={() => setFaceAll('eyes')} />
          <FaceCarousel kind="eyes" options={EYE_OPTIONS} currentIdx={rockieFace?.eyes} onPick={(n) => { setRockieEyes(n); flash(`Ojos ${n} ✓`) }} onRoll={rollEyes} color={rockieColor} stage={stageOfLevel(level)} />

          <div style={{ height: 'var(--space-2)' }} />
          <FacePartHeader label="Boca" onAll={() => setFaceAll('mouth')} />
          <FaceCarousel kind="mouth" options={MOUTH_OPTIONS} currentIdx={rockieFace?.mouth} onPick={(n) => { setRockieMouth(n); flash(`Boca ${n} ✓`) }} onRoll={rollMouth} color={rockieColor} stage={stageOfLevel(level)} />
        </div>

        {/* ── OBJETOS: lo tuyo dividido como la tienda (acc/fondos/comida).
            Equipar aqui es real: accesorios y fondos con tap, comida se le da. ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <div className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: 1, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Objetos</div>
            <span className="q gpill" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-soft)' }}>
              {invCat === 'acc' ? `${ownedAcc.length} / ${accTotal}` : invCat === 'bg' ? `${ownedBg.length} / ${bgTotal}` : `🪙 ${coins}`}
            </span>
          </div>

          {/* Categorias: mismas pildoras que la tienda */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            {INV_CATS.map(c => {
              const on = invCat === c.id
              return (
                <motion.button
                  key={c.id}
                  type="button"
                  whileTap={{ y: 3 }}
                  onClick={() => setInvCat(c.id)}
                  className="q"
                  style={{
                    flex: 1, cursor: 'pointer', minHeight: 40,
                    border: `2px solid ${on ? 'transparent' : 'var(--card-line)'}`,
                    boxShadow: `0 3px 0 ${on ? 'var(--azure-edge)' : 'var(--card-edge)'}`,
                    borderRadius: 'var(--r-pill)', fontWeight: 700, fontSize: 'var(--text-s)',
                    background: on ? 'var(--azure)' : 'var(--card)', color: on ? '#fff' : 'var(--ink-soft)',
                    transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.1s ease',
                  }}
                >
                  {c.label}
                </motion.button>
              )
            })}
          </div>

          {/* Grid por categoria (entra suave al cambiar de pestana) */}
          <motion.div key={invCat} initial={{ y: 8 }} animate={{ y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            {invCat === 'acc' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
                {ownedAcc.map(item => {
                  const puesto = equipped?.[item.slot] === item.id
                  return (
                    <AccTile
                      key={item.id}
                      item={item}
                      puesto={puesto}
                      onTap={() => {
                        equipItem(item.id)
                        playSfx('equip')
                        flash(puesto ? `${item.name} guardado 🎒` : `${item.name} puesto ✓`)
                      }}
                    />
                  )
                })}
                {Array.from({ length: huecos }).map((_, i) => (
                  <HuecoTile key={`hueco-${i}`} onTap={irATienda} />
                ))}
              </div>
            )}

            {invCat === 'bg' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
                {ownedBg.map(item => {
                  const puesto = equipped?.fondo === item.id
                  return (
                    <BgTile
                      key={item.id}
                      item={item}
                      puesto={puesto}
                      onTap={() => {
                        equipItem(item.id)
                        playSfx('equip')
                        flash(puesto ? 'Fondo guardado 🎒' : `Fondo ${item.name} puesto ✨`)
                      }}
                    />
                  )
                })}
                {Array.from({ length: Math.max(1, bgTotal - ownedBg.length) }).map((_, i) => (
                  <HuecoTile key={`bg-hueco-${i}`} onTap={irATienda} />
                ))}
              </div>
            )}

            {invCat === 'food' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
                  {foods.map(item => (
                    <FoodTile key={item.id} item={item} alcanza={coins >= item.price} onTap={() => darComida(item)} />
                  ))}
                </div>
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginTop: 'var(--space-2)' }}>
                  Los antojos se compran con monedas y Rockie se los come al momento 😋
                </div>
              </>
            )}
          </motion.div>
        </div>

        <motion.button
          whileTap={{ y: 4 }}
          onClick={irATienda}
          className="q gbtn"
          style={{
            width: '100%', minHeight: 'var(--tap-min)',
            borderRadius: 'var(--r-pill)', background: 'var(--amber)', color: '#fff', fontWeight: 700, fontSize: 'var(--text-sm)',
            '--edge': 'var(--amber-edge)',
          }}
        >
          Conseguir mas en la tienda 🛍️
        </motion.button>
      </FullScreenSheet>

      {/* ── Pantalla: Rockies amigos — buscador + ranking por nivel (tu incluido) ── */}
      <FullScreenSheet open={panel === 'amigos'} onClose={() => setPanel(null)} title="🪨 Rockies amigos">
        {/* Buscador */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          background: 'var(--card)', border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
          borderRadius: 'var(--r-pill)', padding: '0 var(--space-4)', minHeight: 'var(--tap-min)',
        }}>
          <i className="ti ti-search" style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-md)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar amigo..."
            aria-label="Buscar amigo"
            className="q"
            style={{
              border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0,
              fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 600,
            }}
          />
          {busca && (
            <button
              type="button" onClick={() => setBusca('')} aria-label="Limpiar busqueda"
              style={{
                border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-muted)',
                minWidth: 32, minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <i className="ti ti-x" />
            </button>
          )}
        </div>

        {/* Ranking por nivel: medallas al podio, tu fila resaltada en ambar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {rankAmigos.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ y: 10 }}
              animate={{ y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.22, ease: 'easeOut' }}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                background: f.self ? 'var(--amber-soft)' : 'var(--card)',
                border: `2px solid ${f.self ? 'var(--amber)' : 'var(--card-line)'}`,
                boxShadow: `0 3px 0 ${f.self ? 'color-mix(in srgb, var(--amber) 45%, transparent)' : 'var(--card-edge)'}`,
                borderRadius: 'var(--r-lg)', padding: 'var(--space-2) var(--space-3)', minHeight: 'var(--tap-min)',
              }}
            >
              <div className="s" style={{ width: 26, textAlign: 'center', fontSize: f.pos <= 3 ? 'var(--text-lg)' : 'var(--text-sm)', color: 'var(--ink-muted)', flexShrink: 0 }}>
                {f.pos === 1 ? '🥇' : f.pos === 2 ? '🥈' : f.pos === 3 ? '🥉' : f.pos}
              </div>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: 'var(--paper-alt)',
                border: `2px solid ${f.risk ? 'var(--coral)' : 'var(--card-line)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <img src={rockieArt(`evo/${f.img}`)} alt={f.name} loading="lazy" decoding="async" style={{ width: 34, height: 34, objectFit: 'contain' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  {f.self && (
                    <span className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 800, color: '#fff', background: 'var(--amber)', borderRadius: 'var(--r-pill)', padding: '1px var(--space-2)', flexShrink: 0 }}>TU</span>
                  )}
                </div>
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 600 }}>
                  Lvl {f.level} · 🔥 {f.streak} {f.streak === 1 ? 'dia' : 'dias'}
                </div>
              </div>
              {f.self ? (
                <span style={{ fontSize: 'var(--text-xl)', flexShrink: 0 }}>{emotion.emoji}</span>
              ) : (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={() => flash(f.risk ? `💪 ¡Animo enviado a ${f.name}!` : `🤗 Abrazo enviado a ${f.name}`)}
                  aria-label={f.risk ? `Enviar animo a ${f.name}` : `Enviar abrazo a ${f.name}`}
                  style={{
                    width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: '50%',
                    border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
                    background: 'var(--paper-alt)', fontSize: 'var(--text-lg)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {f.risk ? '💪' : '🤗'}
                </motion.button>
              )}
            </motion.div>
          ))}
          {rankAmigos.length === 0 && (
            <div className="q" style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-6) 0' }}>
              Nadie se llama asi por aqui 👀
            </div>
          )}
        </div>

        {/* Traer mas rockies: abre el QR de invitacion */}
        <motion.button
          whileTap={{ y: 4 }}
          onClick={() => setPanel('qr')}
          className="q gbtn"
          style={{
            width: '100%', minHeight: 'var(--tap-min)',
            borderRadius: 'var(--r-pill)', background: 'var(--azure)', color: '#fff', fontWeight: 700, fontSize: 'var(--text-sm)',
            '--edge': 'var(--azure-edge)',
          }}
        >
          Invitar amigos con QR 📲
        </motion.button>
      </FullScreenSheet>

      {/* ── Modal: parte de la cara completa (ojos O boca) — se abre desde el
          "Ver todo" de cada fila. Pestaña central con blur sobre la hoja. ── */}
      <CenterModal open={faceAll != null} onClose={() => setFaceAll(null)} title={faceAll === 'mouth' ? '🙂 Boca' : '👀 Ojos'}>
        {faceAll === 'eyes' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
            <RandomTile onTap={rollEyes} />
            {EYE_OPTIONS.map(n => (
              <FacePartTile key={n} kind="eyes" idx={n} on={rockieFace?.eyes === n} onTap={() => { setRockieEyes(n); flash(`Ojos ${n} ✓`) }} color={rockieColor} stage={stageOfLevel(level)} />
            ))}
          </div>
        )}
        {faceAll === 'mouth' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
            <RandomTile onTap={rollMouth} />
            {MOUTH_OPTIONS.map(n => (
              <FacePartTile key={n} kind="mouth" idx={n} on={rockieFace?.mouth === n} onTap={() => { setRockieMouth(n); flash(`Boca ${n} ✓`) }} color={rockieColor} stage={stageOfLevel(level)} />
            ))}
          </div>
        )}
      </CenterModal>

      {/* ── Pantalla: Evolucion — camino vertical de la geoda (la piedra preciosa
          se revela etapa a etapa) + progreso real a la siguiente ── */}
      <FullScreenSheet open={panel === 'evo'} onClose={() => setPanel(null)} title="💎 Evolucion">
        {/* Donde va Rockie hoy + cuanto falta para la siguiente etapa */}
        <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', padding: 'var(--space-4)' }}>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: 1, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Rockie hoy</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
            <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>{EVO[stageIdx].name}</div>
            <div className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-muted)', fontWeight: 600 }}>Nivel {level}</div>
          </div>
          {stageIdx < EVO.length - 1 && (() => {
            const cur = EVO[stageIdx]
            const next = EVO[stageIdx + 1]
            const evoPct = Math.min(100, Math.round(((level - cur.lvl) / (next.lvl - cur.lvl)) * 100))
            const faltan = next.lvl - level
            return (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <ProgressBar value={evoPct} height={12} fill="linear-gradient(90deg, var(--amber), var(--coral))" fillEdge="var(--coral-edge)" />
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 600, marginTop: 'var(--space-1)' }}>
                  {faltan === 1 ? 'Te falta 1 nivel' : `Te faltan ${faltan} niveles`} para {next.name} ✨
                </div>
              </div>
            )
          })()}
        </div>

        {/* Camino de etapas: hilo vertical, lo recorrido en ambar */}
        <div>
          {EVO.map((e, i) => {
            const estado = i < stageIdx ? 'past' : i === stageIdx ? 'current' : 'future'
            const future = estado === 'future'
            return (
              <div key={e.name} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 58, height: 58, borderRadius: '50%',
                    background: future ? 'var(--paper-alt)' : 'var(--card)',
                    border: `2px solid ${estado === 'current' ? 'var(--amber)' : 'var(--card-line)'}`,
                    boxShadow: future ? 'none' : `0 3px 0 ${estado === 'current' ? 'color-mix(in srgb, var(--amber) 45%, transparent)' : 'var(--card-edge)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img src={stoneArt(rockieColor, e.stage)} alt={e.name} loading="lazy" decoding="async"
                      style={{ width: 38, height: 38, objectFit: 'contain', filter: future ? 'grayscale(1)' : 'none', opacity: future ? 0.55 : 1 }} />
                  </div>
                  {i < EVO.length - 1 && (
                    <div style={{
                      width: 3, flex: 1, minHeight: 20, borderRadius: 'var(--r-pill)',
                      background: i < stageIdx ? 'var(--amber)' : 'var(--card-line)', margin: 'var(--space-1) 0',
                    }} />
                  )}
                </div>
                <div style={{ paddingTop: 2, paddingBottom: i < EVO.length - 1 ? 'var(--space-4)' : 0, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <div className="s" style={{ fontSize: 'var(--text-md)', color: future ? 'var(--ink-muted)' : 'var(--ink)' }}>{e.name}</div>
                    {estado === 'current' && (
                      <span className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 800, color: '#fff', background: 'var(--amber)', borderRadius: 'var(--r-pill)', padding: '1px var(--space-2)' }}>ESTAS AQUI</span>
                    )}
                    {estado === 'past' && <i className="ti ti-check" style={{ color: 'var(--olive)', fontSize: 'var(--text-md)' }} />}
                  </div>
                  <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 600, marginTop: 1 }}>
                    {future && <i className="ti ti-lock" style={{ fontSize: 'var(--text-2xs)', marginRight: 3 }} />}
                    Nivel {e.lvl}
                  </div>
                  <div className="q" style={{ fontSize: 'var(--text-xs)', color: future ? 'var(--ink-faint)' : 'var(--ink-soft)', marginTop: 2 }}>{e.desc}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', textAlign: 'center' }}>
          Completa habitos para ganar XP y evolucionar a Rockie ✨
        </div>
      </FullScreenSheet>

      {/* ── Pantalla: Logros — pills de conteo + grid de insignias ── */}
      <FullScreenSheet open={panel === 'logros'} onClose={() => setPanel(null)} title="🏅 Logros">
        {/* Resumen de progreso global */}
        <div style={{
          background: 'var(--card)', borderRadius: 'var(--r-xl)',
          border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
          padding: 'var(--space-4) var(--space-5)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
              Tus insignias
            </div>
            <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 600, marginTop: 2 }}>
              {logrosHechos} de {logros.length} conseguidos
            </div>
          </div>
          <div style={{
            width: 56, height: 8, borderRadius: 'var(--r-pill)',
            background: 'var(--paper-alt)', overflow: 'hidden', flexShrink: 0,
          }}>
            <motion.div
              initial={false}
              animate={{ width: `${Math.round((logrosHechos / Math.max(1, logros.length)) * 100)}%` }}
              transition={{ type: 'spring', stiffness: 160, damping: 22 }}
              style={{
                height: '100%', borderRadius: 'var(--r-pill)',
                background: 'linear-gradient(90deg, var(--amber), var(--coral))',
              }}
            />
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4) var(--space-2)',
          paddingTop: 'var(--space-2)',
          justifyItems: 'center',
        }}>
          {logros.map((a) => (
            <div
              key={a.name}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <LogroCard
                a={a}
                wide
                onTap={() => setLogroFocus(a)}
              />
              <div className="q" style={{
                marginTop: 'var(--space-1)', padding: '0 var(--space-1)',
                fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 600,
                textAlign: 'center', lineHeight: 1.3, maxWidth: 100,
              }}>
                {a.meta}
              </div>
            </div>
          ))}
        </div>
      </FullScreenSheet>

      {/* Modal central: celebracion / progreso del logro tocado */}
      <LogroUnlockModal
        open={!!logroFocus}
        logro={logroFocus}
        onClose={() => setLogroFocus(null)}
      />

      {/* ── Modal: QR de invitacion (el "+" de Rockies amigos y el icono del header llegan aqui) ── */}
      <InviteQRSheet open={panel === 'qr'} onClose={() => setPanel(null)} />
    </div>
    </EntranceCtx.Provider>
  )
}

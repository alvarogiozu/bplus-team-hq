import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { SHOP_ITEMS, itemById, acercarThumb, lockLabel } from '../data/shop.js'
import { rockieArt, stoneArt, stageOfLevel } from '../data/rockie.js'
import Rockie from '../components/Rockie.jsx'
import Confetti from '../components/Confetti.jsx'
import { playSfx } from '../lib/sfx.js'
import useDesktop from '../lib/useDesktop.js'
import './desk/TiendaDesk.css'

// ============================================================================
// Tienda de Rockie: aqui se gastan las monedas ganadas validando habitos
// (+10 check · +25 foto · +50 dia completo). Tres categorias:
//  - Accesorios: se equipan y se VEN sobre Rockie (capas del canvas).
//  - Fondos: cambian el cielo del hero en la pantalla Rockie.
//  - Comida: consumible, Rockie celebra y dice su frase.
// Ruta anidada /rockie/tienda: la pestaña Rockie de la barra sigue encendida.
// Estados de item: comprar / saldo insuficiente (shake) / candado de progreso /
// equipado (toggle). Compra = confetti + rebote de Rockie + saldo animado.
// ============================================================================

// La tienda vende OBJETOS: accesorios, fondos y comida. Los colores de la
// piedra ya no se compran aqui (vienen todos desbloqueados en el inventario).
const CATS = [
  { id: 'acc', label: 'Accesorios' },
  { id: 'bg', label: 'Fondos' },
  { id: 'food', label: 'Comida' },
]

const FONDO_DEFAULT = 'linear-gradient(180deg, var(--card-2) 0%, transparent 90%)'

// Miniatura segun tipo: roca del color (stone) / recorte del SVG (acc) /
// muestra del gradiente (bg) / emoji (food)
function Thumb({ item }) {
  const caja = { width: 64, height: 64, borderRadius: 'var(--r-md)', flexShrink: 0 }
  if (item.type === 'stone') {
    return (
      <div style={{ ...caja, background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={stoneArt(item.colorId, 1)} alt={item.name} loading="lazy" decoding="async"
          style={{ width: '84%', height: '84%', objectFit: 'contain' }}
        />
      </div>
    )
  }
  if (item.type === 'acc') {
    return (
      <div style={{ ...caja, background: 'var(--paper)', overflow: 'hidden', position: 'relative' }}>
        <img
          src={rockieArt(`acc/${item.id}`)} alt={item.name} loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', ...acercarThumb(item.thumb) }}
        />
      </div>
    )
  }
  if (item.type === 'bg') {
    return <div style={{ ...caja, background: item.bg.replace('transparent 100%', 'var(--card-2) 100%') }} />
  }
  return (
    <div style={{ ...caja, background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
      {item.emoji}
    </div>
  )
}

// Tarjeta de item con su boton de estado y sus animaciones de compra/rechazo
function ItemCard({ item, index, coins, level, days, owned, equipped, rockieColor, onBuy, onEquip, notify }) {
  const [burst, setBurst] = useState(0)
  const [shake, setShake] = useState(0)
  const esComida = item.type === 'food'
  const esPiedra = item.type === 'stone'
  const tuyo = !esComida && owned.includes(item.id)
  const slotKey = item.type === 'bg' ? 'fondo' : item.slot
  // Piedra "puesta" = es el color actual de Rockie (no ocupa slot)
  const puesto = esPiedra ? (tuyo && rockieColor === item.colorId) : (tuyo && equipped?.[slotKey] === item.id)
  const lock = lockLabel(item, { level, days })
  const alcanza = coins >= item.price

  const onTap = () => {
    if (lock) {
      playSfx('softFail')
      notify(`🔒 Se desbloquea con ${lock}`)
      setShake(Date.now())
      return
    }
    if (tuyo && esPiedra) {
      if (!puesto) onEquip(item, true)  // ya puesta = no hay nada que alternar
      return
    }
    if (tuyo) {
      onEquip(item, !puesto)
      return
    }
    if (!alcanza) {
      playSfx('softFail')
      notify(`Te faltan ${item.price - coins} monedas 🪙`)
      setShake(Date.now())
      return
    }
    playSfx('tap')
    const res = onBuy(item)
    if (res?.ok) setBurst(Date.now())
  }

  // Boton segun estado del item (cada estado con su canto 3D)
  let btnContent
  let btnStyle
  if (lock) {
    btnContent = <><i className="ti ti-lock" /> {lock}</>
    btnStyle = { background: 'var(--paper-alt)', color: 'var(--ink-muted)', boxShadow: 'none' }
  } else if (puesto) {
    btnContent = <><i className="ti ti-check" /> {esPiedra ? 'Puesta' : 'Puesto'}</>
    btnStyle = { background: 'var(--olive)', color: '#fff', boxShadow: '0 3px 0 var(--olive-edge)' }
  } else if (tuyo) {
    btnContent = esPiedra ? 'Usar' : 'Equipar'
    btnStyle = { background: 'var(--olive-soft)', color: 'var(--olive)', boxShadow: '0 3px 0 var(--edge-soft)' }
  } else {
    btnContent = <>🪙 {item.price} · {esComida ? 'Darle' : 'Comprar'}</>
    btnStyle = alcanza
      ? { background: 'var(--amber)', color: '#fff', boxShadow: '0 3px 0 var(--amber-edge)' }
      : { background: 'var(--paper-alt)', color: 'var(--ink-faint)', boxShadow: 'none' }
  }

  return (
    <motion.div
      initial={false}
      style={{
        position: 'relative', background: 'var(--card)', borderRadius: 'var(--r-lg)',
        padding: 'var(--space-3)', boxShadow: '0 3px 0 var(--card-edge)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
        border: puesto ? '2px solid var(--olive)' : '2px solid var(--card-line)',
      }}
    >
      <motion.div key={shake} animate={{ x: shake ? [0, -7, 7, -5, 5, 0] : 0 }} transition={{ duration: 0.4 }}>
        <Thumb item={item} />
      </motion.div>
      <div style={{ textAlign: 'center', minHeight: 34 }}>
        <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>{item.name}</div>
        <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginTop: 1 }}>{item.desc || (esComida ? 'A Rockie le encanta' : '')}</div>
      </div>
      <motion.button
        type="button"
        whileTap={{ y: 3 }}
        onClick={onTap}
        className="q"
        style={{
          border: 'none', width: '100%', minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
          fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
          transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.1s ease',
          ...btnStyle,
        }}
      >
        {btnContent}
      </motion.button>
      {burst > 0 && (
        <span style={{ position: 'absolute', left: '50%', top: '30%', pointerEvents: 'none', zIndex: 5 }}>
          <Confetti burstKey={burst} radius={52} onDone={() => setBurst(0)} />
        </span>
      )}
    </motion.div>
  )
}

export default function Tienda() {
  const { coins, level, rockie, emotion, equipped, shopOwned, buyItem, equipItem, rockieColor } = useStore()
  const navigate = useNavigate()
  const wide = useDesktop()
  const [cat, setCat] = useState('acc')
  const [toast, setToast] = useState('')
  const [fxT, setFxT] = useState(0)   // dispara el festejo del preview al comprar
  const toastTimer = useRef(null)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const notify = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }

  const comprar = async (item) => {
    const res = await buyItem(item.id)
    if (!res.ok) {
      if (res.error === 'saldo') {
        playSfx('softFail')
        notify(`Te faltan ${item.price - coins} monedas 🪙`)
      }
      return res
    }
    playSfx('purchase')
    setFxT(Date.now())
    if (item.type === 'food') notify(res.frase || '"¡Ñam! Gracias."')
    else if (item.type === 'bg') notify(`Fondo "${item.name}" puesto ✨`)
    else notify(`¡${item.name} comprado y puesto! 🎉`)
    return res
  }

  const alternar = (item, willWear) => {
    equipItem(item.id)
    playSfx('equip')
    if (item.type === 'stone') { notify(`Piedra ${item.name} puesta ✨`); return }
    notify(willWear ? `${item.name} puesto ✓` : `${item.name} guardado en la mochila 🎒`)
  }

  const items = SHOP_ITEMS.filter(i => i.type === cat)
  const fondo = itemById(equipped?.fondo)
  const dias = rockie.daysTogether

  const toastEl = (
    <>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            className="q"
            style={{
              position: 'absolute', top: 'var(--space-6)', left: '50%', transform: 'translateX(-50%)', zIndex: 95,
              background: 'var(--card)', color: 'var(--ink)',
              border: '2px solid var(--brand)', borderRadius: 'var(--r-pill)',
              padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-sm)', fontWeight: 800,
              boxShadow: '0 8px 24px var(--shadow-card), 0 2px 0 var(--brand-edge)',
              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )

  // PC: vitrina (Rockie probandose lo que compras) + catalogo en rejilla
  if (wide) {
    return (
      <div className="dk-page td">
        <header className="dk-head">
          <div>
            <div className="q dk-eyebrow">La tienda de Rockie</div>
            <h1 className="dk-title">Tienda</h1>
            <p className="q dk-sub">Gasta lo que ganas cumpliendo. Todo lo que compras, Rockie se lo pone al instante.</p>
          </div>
          <div className="dk-head-actions">
            <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => navigate('/rockie', { state: { fromTienda: true } })}>
              <i className="ti ti-arrow-left" /> Volver a Rockie
            </button>
            <motion.span
              key={coins}
              className="gpill q td-coins"
              initial={{ scale: 1.18 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16 }}
            >
              🪙 <b className="s">{coins}</b>
            </motion.span>
          </div>
        </header>

        <div className="td-grid">
          <aside className="td-vitrina">
            <div className="td-stage" style={{ background: fondo?.bg || FONDO_DEFAULT }}>
              <Rockie size={220} emotion={emotion} equipped={equipped} color={rockieColor} stage={stageOfLevel(level)} fx={fxT ? 'celebrate' : null} fxKey={fxT} />
              <div className="q td-stage-label">Así se ve hoy</div>
            </div>
            <div className="dk-well td-earn">
              <div className="q dk-label">Cómo ganar monedas</div>
              <div className="q td-earn-row"><i className="ti ti-camera" style={{ color: 'var(--green-photo)' }} /> Validar con foto <b>+25 🪙</b></div>
              <div className="q td-earn-row"><i className="ti ti-check" style={{ color: 'var(--olive)' }} /> Marcar «Lo hice» <b>+10 🪙</b></div>
              <div className="q td-earn-row"><i className="ti ti-trophy" style={{ color: 'var(--amber)' }} /> Completar el día <b>+50 🪙</b></div>
            </div>
          </aside>

          <section className="td-catalog">
            <div className="td-cats" role="tablist" aria-label="Categorías">
              {CATS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={cat === c.id}
                  className={`gbtn q td-cat${cat === c.id ? ' on' : ''}`}
                  onClick={() => setCat(c.id)}
                >{c.label}</button>
              ))}
            </div>
            <motion.div
              key={cat}
              className="td-items"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {items.map((item, i) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  index={i}
                  coins={coins}
                  level={level}
                  days={dias}
                  owned={shopOwned}
                  equipped={equipped}
                  rockieColor={rockieColor}
                  onBuy={comprar}
                  onEquip={alternar}
                  notify={notify}
                />
              ))}
            </motion.div>
          </section>
        </div>
        {toastEl}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: 'var(--space-6)' }}>
      {/* ── Header: volver + titulo + saldo vivo ── */}
      <div style={{ padding: 'var(--space-6) var(--screen-x) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <motion.button
          type="button"
          whileTap={{ y: 3 }}
          onClick={() => navigate('/rockie', { state: { fromTienda: true } })}
          aria-label="Volver a Rockie"
          className="q"
          style={{
            width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: '50%',
            border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
            background: 'var(--card)', color: 'var(--ink-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-lg)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <i className="ti ti-arrow-left" />
        </motion.button>
        <div style={{ flex: 1 }}>
          <div className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--title)', lineHeight: 1.05, letterSpacing: '-0.3px' }}>Tienda</div>
          <div className="editorial-line" />
        </div>
        {/* Saldo: hace "pop" cada vez que cambia */}
        <motion.div
          key={coins}
          initial={{ scale: 1.18 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16 }}
          style={{
            background: 'var(--card)', borderRadius: 'var(--r-pill)', padding: '6px var(--space-3)',
            border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 'var(--text-md)' }}>🪙</span>
          <span className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--amber)' }}>{coins}</span>
        </motion.div>
      </div>

      {/* ── Preview: asi se ve Rockie con lo equipado (festeja al comprar) ── */}
      <motion.div
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{
          margin: 'var(--space-4) var(--screen-x) 0', borderRadius: 'var(--r-xl)',
          background: fondo?.bg || FONDO_DEFAULT,
          border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: 'var(--space-3) 0 var(--space-2)',
        }}
      >
        <Rockie size={120} emotion={emotion} equipped={equipped} color={rockieColor} stage={stageOfLevel(level)} fx={fxT ? 'celebrate' : null} fxKey={fxT} />
        <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: 0.5, marginTop: 'var(--space-1)' }}>
          ASI SE VE HOY
        </div>
      </motion.div>

      {/* ── Categorias (4 pestañas: si no entran, la fila se desliza) ── */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3) var(--screen-x) 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATS.map(c => {
          const on = cat === c.id
          return (
            <motion.button
              key={c.id}
              type="button"
              whileTap={{ y: 3 }}
              onClick={() => setCat(c.id)}
              className="q"
              style={{
                flex: '1 0 auto', padding: '0 var(--space-3)', cursor: 'pointer', minHeight: 40,
                border: `2px solid ${on ? 'transparent' : 'var(--card-line)'}`,
                boxShadow: `0 3px 0 ${on ? 'var(--azure-edge)' : 'var(--card-edge)'}`,
                borderRadius: 'var(--r-pill)', fontWeight: 700, fontSize: 'var(--text-sm)',
                background: on ? 'var(--azure)' : 'var(--card)', color: on ? '#fff' : 'var(--ink-soft)',
                transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.1s ease',
              }}
            >
              {c.label}
            </motion.button>
          )
        })}
      </div>

      {/* ── Grid de items (entra con cascada por categoria) ── */}
      <motion.div
        key={cat}
        initial={{ y: 8 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', padding: 'var(--space-3) var(--screen-x) 0' }}
      >
        {items.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            index={i}
            coins={coins}
            level={level}
            days={dias}
            owned={shopOwned}
            equipped={equipped}
            rockieColor={rockieColor}
            onBuy={comprar}
            onEquip={alternar}
            notify={notify}
          />
        ))}
      </motion.div>

      {/* ── Como ganar monedas (cierra el ciclo de la economia) ── */}
      <div style={{ margin: 'var(--space-3) var(--screen-x) 0', background: 'var(--paper-alt)', border: '2px solid var(--card-line)', borderRadius: 'var(--r-md)', padding: 'var(--space-3) var(--space-4)' }}>
        <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>
          COMO GANAR MONEDAS
        </div>
        <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          Valida con foto <b style={{ color: 'var(--ink)' }}>+25</b> · marca "Lo hice" <b style={{ color: 'var(--ink)' }}>+10</b> · completa el dia <b style={{ color: 'var(--ink)' }}>+50</b> 🪙
        </div>
      </div>

      {/* ── Toast ── */}
      {toastEl}
    </div>
  )
}

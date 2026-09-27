// TIENDA + EDITAR — personalizacion completa de Rockie en el aparato.
//
// UNA pantalla, DOS billeteras: en modo usuario opera sobre useStore() (la
// cuenta del adulto, sincronizada con el telefono); en modo nino opera sobre
// family.js (la billetera del nino, que el padre alimenta aprobando tareas).
// El adaptador `wallet` que llega por props decide, y la UI no se entera.
//
// Restricciones resistivas aplicadas:
//   - compra en DOS toques (tocar item -> boton "Comprar por N" -> confirmar):
//     un modal de confirmacion seria otra pantalla; el segundo toque ya es la
//     confirmacion y un toque accidental nunca gasta monedas.
//   - rejilla de 2 columnas (celdas ~144px), nada de carruseles horizontales
//     (arrastrar en resistivo = loteria).
//   - los selectores de ojos/boca/color son rejillas de celdas 64px+.

import { useMemo, useState } from 'react'
import { SHOP_ITEMS, SLOT_LABELS } from '../../data/shop.js'
import { ROCKIE_COLORS } from '../../data/rockieColors.js'
import { EYE_OPTIONS, MOUTH_OPTIONS, NEUTRAL_EYES, NEUTRAL_MOUTH, rockieArt } from '../../data/rockie.js'
import Rockie from '../../components/Rockie.jsx'
import { Screen, Label } from '../ui/Screen.jsx'

export default function Tienda({ wallet, emotion, stage }) {
  const [vista, setVista] = useState('tienda') // tienda | editar
  return (
    <Screen title="Rockie Shop" scroll gap="var(--space-2)">
      {/* Monedas + conmutador de vista */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'stretch' }}>
        <div
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 var(--space-3)', minHeight: 56,
            background: 'var(--dev-surface)', borderRadius: 'var(--dev-r)',
            boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
          }}
        >
          <i className="ti ti-coin" style={{ fontSize: 20, color: 'var(--amber)' }} />
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-emph)', fontWeight: 700 }}>
            {wallet.coins}
          </span>
        </div>
        <Segmentado
          opciones={[{ id: 'tienda', label: 'Tienda' }, { id: 'editar', label: 'Editar' }]}
          activo={vista}
          onCambio={setVista}
        />
      </div>

      {vista === 'tienda'
        ? <VistaTienda wallet={wallet} />
        : <VistaEditar wallet={wallet} emotion={emotion} stage={stage} />}
    </Screen>
  )
}

function Segmentado({ opciones, activo, onCambio }) {
  return (
    <div
      style={{
        flex: 1, display: 'grid', gridTemplateColumns: `repeat(${opciones.length}, 1fr)`,
        gap: 4, padding: 4, background: 'var(--dev-surface)',
        borderRadius: 'var(--dev-r)', boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
      }}
    >
      {opciones.map(o => (
        <button
          key={o.id}
          type="button"
          className="bp-tap"
          onClick={() => onCambio(o.id)}
          style={{
            minHeight: 56,
            borderRadius: 10,
            background: activo === o.id ? 'var(--brand)' : 'transparent',
            color: activo === o.id ? '#fff' : 'var(--dev-ink-soft)',
            fontSize: 'var(--dev-body)', fontWeight: 800,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// TIENDA: comprar con confirmacion en dos toques
// ============================================================================
function VistaTienda({ wallet }) {
  const [confirmando, setConfirmando] = useState(null) // id del item esperando 2do toque
  const [flash, setFlash] = useState(null)             // { id, ok, msg } feedback de compra

  const secciones = useMemo(() => ([
    { titulo: 'Piedras', items: SHOP_ITEMS.filter(i => i.type === 'stone' && i.price > 0) },
    { titulo: 'Accesorios', items: SHOP_ITEMS.filter(i => i.type === 'acc') },
    { titulo: 'Comida', items: SHOP_ITEMS.filter(i => i.type === 'food') },
  ]), [])

  // async: en modo usuario buyItem puede ir a Supabase (spend_coins) y tarda
  const comprar = async (item) => {
    if (confirmando !== item.id) { setConfirmando(item.id); return }
    setConfirmando(null)
    const r = await wallet.buy(item)
    const MSG = {
      saldo: 'Te faltan monedas', nivel: `Se abre en nivel ${item.req?.level}`,
      dias: `Se abre a los ${item.req?.days} dias`, ya_tuyo: 'Ya es tuyo',
    }
    setFlash({ id: item.id, ok: r.ok, msg: r.ok ? (item.type === 'food' ? '¡Nom nom!' : '¡Tuyo!') : (MSG[r.error] || 'No se pudo') })
    setTimeout(() => setFlash(null), 1600)
  }

  return (
    <>
      {secciones.map(sec => (
        <div key={sec.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Label>{sec.titulo}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            {sec.items.map(item => {
              const tuyo = item.type !== 'food' && wallet.owned.includes(item.id)
              const puesto = tuyo && wallet.estaPuesto(item)
              const enConfirm = confirmando === item.id
              const fl = flash?.id === item.id ? flash : null
              return (
                <button
                  key={item.id}
                  type="button"
                  className="bp-tap"
                  onClick={() => (tuyo ? wallet.equip(item) : comprar(item))}
                  style={{
                    minHeight: 96,
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    justifyContent: 'space-between', gap: 4,
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--dev-surface)',
                    border: puesto ? '2px solid var(--brand)' : '2px solid transparent',
                    borderRadius: 'var(--dev-r)',
                    boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                    <Miniatura item={item} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--dev-body)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                  </span>
                  {fl ? (
                    <span style={{ fontSize: 'var(--dev-micro)', fontWeight: 800, color: fl.ok ? 'var(--green-photo)' : 'var(--coral)' }}>
                      {fl.msg}
                    </span>
                  ) : tuyo ? (
                    <span style={{ fontSize: 'var(--dev-micro)', fontWeight: 800, color: puesto ? 'var(--brand)' : 'var(--dev-ink-soft)' }}>
                      {puesto ? 'PUESTO' : 'Tocar para poner'}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '6px 10px', borderRadius: 999,
                        background: enConfirm ? 'var(--amber)' : 'var(--dev-paper)',
                        color: enConfirm ? '#fff' : 'var(--dev-ink)',
                        fontSize: 'var(--dev-micro)', fontWeight: 800,
                      }}
                    >
                      <i className="ti ti-coin" style={{ fontSize: 14 }} />
                      {enConfirm ? `¿Comprar por ${item.price}?` : item.price}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p style={{ margin: 0, fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', textAlign: 'center', lineHeight: 1.4 }}>
        Toca un precio y confirma con un segundo toque.
      </p>
    </>
  )
}

function Miniatura({ item }) {
  if (item.type === 'food') return <span style={{ fontSize: 24 }}>{item.emoji}</span>
  if (item.type === 'stone') {
    const c = ROCKIE_COLORS.find(x => x.id === item.colorId)
    return <span style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: c?.swatch || '#888', border: '2px solid var(--dev-line)' }} />
  }
  // Accesorio: el PNG alineado al canvas, recortado a su zona
  return (
    <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, overflow: 'hidden', background: 'var(--dev-paper)' }}>
      <img
        src={rockieArt(`acc/${item.id}`)}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: item.thumb ? `scale(${item.thumb.z}) translate(${50 - item.thumb.cx}%, ${50 - item.thumb.cy}%)` : undefined }}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
    </span>
  )
}

// ============================================================================
// EDITAR: color + ojos + boca + lo puesto, con vista previa en vivo
// ============================================================================
function VistaEditar({ wallet, emotion, stage }) {
  // Cara efectiva de la preview: lo fijado manda; lo automatico hereda del dia
  const cara = {
    eyes: wallet.face?.eyes ?? emotion.eyes,
    mouth: wallet.face?.mouth ?? emotion.mouth,
  }
  const puestos = Object.entries(wallet.equipped || {}).filter(([, v]) => v)

  const celda = (activo) => ({
    width: 64, height: 64,
    display: 'grid', placeItems: 'center',
    background: 'var(--dev-surface)',
    border: activo ? '3px solid var(--brand)' : '2px solid var(--dev-line)',
    borderRadius: 'var(--dev-r)',
    boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
    position: 'relative', overflow: 'hidden',
  })

  return (
    <>
      {/* Preview en vivo: el mismo componente Rockie de la app, con lo puesto */}
      <div style={{ display: 'grid', placeItems: 'center', padding: 'var(--space-1) 0' }}>
        <Rockie
          emotion={cara}
          size={96}
          float={false}
          moods={false}
          color={wallet.color}
          stage={stage}
          equipped={wallet.equipped}
        />
      </div>

      <Label>Piedra</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {ROCKIE_COLORS.map(c => {
          const item = SHOP_ITEMS.find(i => i.type === 'stone' && i.colorId === c.id)
          const tuyo = !item?.price || wallet.owned.includes(item.id)
          return (
            <button
              key={c.id}
              type="button"
              className="bp-tap"
              disabled={!tuyo}
              onClick={() => wallet.setColor(c.id)}
              aria-label={c.name}
              style={celda(wallet.color === c.id)}
            >
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: c.swatch }} />
              {!tuyo && (
                <i className="ti ti-lock" style={{ position: 'absolute', right: 4, bottom: 3, fontSize: 14, color: 'var(--dev-ink-soft)' }} />
              )}
            </button>
          )
        })}
      </div>

      <Label>Ojos</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <CeldaAuto activo={wallet.face?.eyes == null} onClick={() => wallet.setEyes(null)} estilo={celda} />
        {EYE_OPTIONS.map(n => (
          <button key={n} type="button" className="bp-tap" onClick={() => wallet.setEyes(n)} style={celda(wallet.face?.eyes === n)}>
            <CaraMini eyes={n} mouth={NEUTRAL_MOUTH} />
          </button>
        ))}
      </div>

      <Label>Boca</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <CeldaAuto activo={wallet.face?.mouth == null} onClick={() => wallet.setMouth(null)} estilo={celda} />
        {MOUTH_OPTIONS.map(n => (
          <button key={n} type="button" className="bp-tap" onClick={() => wallet.setMouth(n)} style={celda(wallet.face?.mouth === n)}>
            <CaraMini eyes={NEUTRAL_EYES} mouth={n} />
          </button>
        ))}
      </div>

      {puestos.length > 0 && (
        <>
          <Label>Puesto ahora</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {puestos.map(([slot, id]) => {
              const item = SHOP_ITEMS.find(i => i.id === id)
              if (!item) return null
              return (
                <button
                  key={slot}
                  type="button"
                  className="bp-tap"
                  onClick={() => wallet.equip(item)}
                  style={{
                    minHeight: 64, display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--dev-surface)', borderRadius: 'var(--dev-r)',
                    boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)', textAlign: 'left',
                  }}
                >
                  <Miniatura item={item} />
                  <span style={{ flex: 1, fontSize: 'var(--dev-body)', fontWeight: 700 }}>
                    {item.name}
                    <span style={{ display: 'block', fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)' }}>
                      {SLOT_LABELS[slot] || slot}
                    </span>
                  </span>
                  <span style={{ fontSize: 'var(--dev-micro)', fontWeight: 800, color: 'var(--coral)' }}>QUITAR</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

function CeldaAuto({ activo, onClick, estilo }) {
  return (
    <button type="button" className="bp-tap" onClick={onClick} style={estilo(activo)} aria-label="Automatico">
      <i className="ti ti-wand" style={{ fontSize: 22, color: activo ? 'var(--brand)' : 'var(--dev-ink-soft)' }} />
    </button>
  )
}

/** Carita en miniatura: base neutra + la parte que se elige (mismos SVG de la app). */
function CaraMini({ eyes, mouth }) {
  const capa = { position: 'absolute', inset: 0, width: '100%', height: '100%' }
  return (
    <span style={{ position: 'relative', width: 52, height: 52, display: 'block' }}>
      <img src={rockieArt('base')} alt="" style={capa} />
      <img src={rockieArt(`eyes/ojos${eyes}`)} alt="" style={capa} />
      <img src={rockieArt(`mouth/boca${mouth}`)} alt="" style={capa} />
    </span>
  )
}

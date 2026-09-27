import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import CenterModal from './CenterModal.jsx'
import { AREA_COLOR_OPTS, AREA_ICON_OPTS } from '../data/areas.js'

function colorIndexOf(area, fallback = 0) {
  if (!area?.color) return fallback
  const i = AREA_COLOR_OPTS.findIndex(c => c.color === area.color)
  return i >= 0 ? i : fallback
}

// Sheet para crear O editar un area. Mismo formulario; en edicion aparece
// "Eliminar" solo si no es builtin (Cuerpo/Mente/Alma no se borran).
export default function CrearAreaSheet({
  open, onClose, onCreate, onUpdate, onDelete,
  area = null, colorIndex = 0,
}) {
  const editing = !!area
  const [nombre, setNombre] = useState('')
  const [icon, setIcon] = useState(AREA_ICON_OPTS[0])
  const [colorIdx, setColorIdx] = useState(colorIndex % AREA_COLOR_OPTS.length)
  const [desc, setDesc] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const look = AREA_COLOR_OPTS[colorIdx] || AREA_COLOR_OPTS[0]

  // Iconos: si el area trae uno fuera del catalogo, lo mostramos igual
  const iconOpts = icon && !AREA_ICON_OPTS.includes(icon)
    ? [icon, ...AREA_ICON_OPTS]
    : AREA_ICON_OPTS

  useEffect(() => {
    if (!open) return
    setConfirmDel(false)
    if (area) {
      setNombre(area.name || '')
      setIcon(area.icon || AREA_ICON_OPTS[0])
      setColorIdx(colorIndexOf(area, colorIndex % AREA_COLOR_OPTS.length))
      setDesc(area.desc || '')
    } else {
      setNombre('')
      setIcon(AREA_ICON_OPTS[0])
      setColorIdx(colorIndex % AREA_COLOR_OPTS.length)
      setDesc('')
    }
  }, [open, area, colorIndex])

  const cerrar = () => { setConfirmDel(false); onClose() }

  const guardar = () => {
    const n = nombre.trim()
    if (!n) return
    const payload = {
      nombre: n,
      icon,
      color: look.color,
      edge: look.edge,
      soft: look.soft,
      desc: desc.trim() || `Tu area "${n}"`,
    }
    if (editing) onUpdate?.(area.id, payload)
    else onCreate?.(payload)
  }

  const eliminar = () => {
    if (!editing) return
    if (!confirmDel) { setConfirmDel(true); return }
    onDelete?.(area.id)
  }

  const listo = nombre.trim().length > 0
  const pushEase = [0.32, 0.72, 0, 1]
  const pushTransition = { duration: 0.28, ease: pushEase }

  return (
    <CenterModal open={open} onClose={cerrar} title={editing ? 'Editar area' : 'Nueva area'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: look.color,
            boxShadow: `0 3px 0 ${look.edge}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 'var(--text-3xl)',
          }}>
            <i className={`ti ${icon}`} />
          </div>
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿COMO SE LLAMA?</div>
          <input
            className="amg-input q"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Trabajo, Familia, Arte…"
            autoFocus={!editing}
            style={{ fontSize: 'var(--text-base)' }}
          />
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>ICONO</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {iconOpts.map(ic => {
              const on = icon === ic
              return (
                <button
                  key={ic} type="button" onClick={() => setIcon(ic)}
                  className="q"
                  style={{
                    width: 44, height: 44, borderRadius: 'var(--r-md)', cursor: 'pointer',
                    border: on ? 'none' : '2px solid var(--card-line)',
                    background: on ? look.color : 'var(--card)',
                    color: on ? '#fff' : 'var(--ink-soft)',
                    boxShadow: on ? `0 2px 0 ${look.edge}` : '0 2px 0 var(--card-edge)',
                    fontSize: 'var(--text-lg)',
                  }}
                ><i className={`ti ${ic}`} /></button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>COLOR</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {AREA_COLOR_OPTS.map((c, i) => {
              const on = colorIdx === i
              return (
                <button
                  key={c.color} type="button" onClick={() => setColorIdx(i)}
                  aria-label={`Color ${i + 1}`}
                  style={{
                    width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                    background: c.color, border: on ? '3px solid var(--ink)' : '2px solid transparent',
                    boxShadow: on ? `0 0 0 2px ${c.soft}` : 'none',
                  }}
                />
              )
            })}
          </div>
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿PARA QUE? · OPCIONAL</div>
          <input
            className="amg-input q"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Ej: Proyectos y clientes"
            style={{ fontSize: 'var(--text-base)' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <motion.button
            type="button"
            whileTap={{ y: 3 }}
            onClick={guardar}
            disabled={!listo}
            className="q gbtn"
            style={{
              '--edge': look.edge, background: look.color, color: '#fff',
              borderRadius: 'var(--r-pill)', minHeight: 'var(--tap-min)',
              fontWeight: 700, fontSize: 'var(--text-sm)',
              opacity: listo ? 1 : 0.5, cursor: listo ? 'pointer' : 'default',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
            }}
          >
            <i className="ti ti-check" /> {editing ? 'Guardar' : 'Crear area'}
          </motion.button>

          {/* Empuje fluido (patron Vida): Eliminar aparece/desaparece sin salto */}
          <motion.div
            initial={false}
            animate={{
              height: editing ? 44 : 0,
              opacity: editing ? 1 : 0,
              marginTop: editing ? 8 : 0,
            }}
            transition={pushTransition}
            style={{ overflow: 'hidden', width: '100%', flexShrink: 0 }}
          >
            <button
              type="button"
              onClick={eliminar}
              className="q"
              tabIndex={editing ? 0 : -1}
              aria-hidden={!editing}
              style={{
                minHeight: 'var(--tap-min)', height: 'var(--tap-min)', width: '100%',
                borderRadius: 'var(--r-pill)',
                border: confirmDel ? 'none' : '2px solid var(--card-line)',
                background: confirmDel ? 'var(--coral)' : 'transparent',
                color: confirmDel ? '#fff' : 'var(--ink-muted)',
                boxShadow: confirmDel ? '0 2px 0 var(--coral-edge)' : 'none',
                fontWeight: 700, fontSize: 'var(--text-sm)',
                cursor: editing ? 'pointer' : 'default',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                pointerEvents: editing ? 'auto' : 'none',
              }}
            >
              <i className="ti ti-trash" />
              {confirmDel ? '¿Seguro? Toca otra vez' : 'Eliminar area'}
            </button>
          </motion.div>
        </div>
      </div>
    </CenterModal>
  )
}

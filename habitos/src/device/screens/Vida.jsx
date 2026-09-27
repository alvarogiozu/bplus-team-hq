// [FUERA DE LAS PESTANAS desde el 7-ago-2026] El aparato se enfoco en DOS
// cosas (Hoy + Rockie/Tienda) y Vida salio de la barra inferior. Las metas
// y areas se administran desde el telefono; el agente del chat puede seguir
// creandolas. Para reactivar esta pantalla: anadirla en nav/Tabs.jsx y en el
// switch de DeviceApp.jsx.
//
// VIDA — la jerarquia Area -> Meta -> Habito (doc 23) en tres niveles de toque.
//
// LO QUE CAMBIA RESPECTO AL MOVIL:
// la app usa RuedaAreas, una rueda que se GIRA con el dedo. En resistivo un
// giro es lo peor posible (arrastre continuo + precision). Aqui la rueda se
// convierte en una REJILLA de 2 columnas: 144x90 por celda, imposible fallar.
//
// Navegacion de tres pisos, cada uno una pantalla completa con boton atras:
//   areas -> metas del area -> detalle de la meta

import { useState } from 'react'
import { useStore } from '../../data/mockStore.jsx'
import { AREA_LIBRE } from '../../data/areas.js'
import { typeOf } from '../../data/habitTypes.js'
import { Screen, Label, Empty, Bar } from '../ui/Screen.jsx'
import { TapRow } from '../ui/Tap.jsx'

export default function Vida() {
  const { areas, metas, today, allHabits } = useStore()
  const [areaId, setAreaId] = useState(undefined) // undefined = raiz
  const [metaId, setMetaId] = useState(null)

  const habitos = allHabits?.length ? allHabits : today

  // --- Piso 3: detalle de una meta ---
  if (metaId) {
    const meta = metas.find((m) => m.id === metaId)
    if (meta) {
      const suyos = habitos.filter((h) => meta.habitIds?.includes(h.id))
      return (
        <Screen title={meta.name} onBack={() => setMetaId(null)}>
          <div
            style={{
              padding: 'var(--space-3)',
              background: 'var(--dev-surface)',
              borderRadius: 'var(--dev-r)',
              boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-title)', fontWeight: 700 }}>
                {meta.pct}%
              </span>
              <span style={{ fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', fontWeight: 700 }}>
                {meta.deadline}
              </span>
            </div>
            <Bar pct={meta.pct} color={meta.color || 'var(--berry)'} />
          </div>

          <Label>Habitos que la alimentan</Label>
          {suyos.length === 0 ? (
            <Empty icon="ti-link-off" text="Todavia no cuelga ningun habito. Dile a Rockie cual quieres." />
          ) : (
            suyos.map((h) => {
              const t = typeOf(h.type)
              return (
                <TapRow
                  key={h.id}
                  title={h.name}
                  sub={`${h.time} · ${h.freq}`}
                  icon={h.icon || t.icon}
                  iconBg={h.color || t.color}
                  right={
                    h.done ? <i className="ti ti-circle-check-filled" style={{ fontSize: 24, color: 'var(--green-photo)' }} /> : null
                  }
                />
              )
            })
          )}
        </Screen>
      )
    }
  }

  // --- Piso 2: metas de un area ---
  if (areaId !== undefined) {
    const area = areaId === null ? AREA_LIBRE : areas.find((a) => a.id === areaId)
    const suyas = metas.filter((m) => (m.areaId ?? null) === areaId)
    return (
      <Screen title={area?.name || 'Libre'} onBack={() => setAreaId(undefined)}>
        {suyas.length === 0 ? (
          <Empty icon="ti-target-off" text={`Nada en ${area?.name || 'Libre'} todavia. Pide una meta en Hablar.`} />
        ) : (
          suyas.map((m) => (
            <TapRow
              key={m.id}
              title={m.name}
              sub={`${m.pct}% · ${m.deadline}`}
              icon={m.icon || 'ti-target-arrow'}
              iconBg={m.color || area?.color || 'var(--berry)'}
              onClick={() => setMetaId(m.id)}
              right={<i className="ti ti-chevron-right" style={{ fontSize: 22, color: 'var(--dev-ink-soft)' }} />}
            />
          ))
        )}
      </Screen>
    )
  }

  // --- Piso 1: rejilla de areas ---
  const sueltas = metas.filter((m) => (m.areaId ?? null) === null)
  const celdas = [...areas, ...(sueltas.length ? [AREA_LIBRE] : [])]

  return (
    <Screen title="Vida">
      <Label>Tus areas</Label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
        {celdas.map((a) => {
          const n = metas.filter((m) => (m.areaId ?? null) === a.id).length
          return (
            <button
              key={a.id ?? 'libre'}
              type="button"
              className="bp-tap"
              onClick={() => setAreaId(a.id)}
              style={{
                height: 92,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: 6,
                padding: 'var(--space-3)',
                background: 'var(--dev-surface)',
                borderRadius: 'var(--dev-r)',
                borderLeft: `5px solid ${a.color}`,
                boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
                textAlign: 'left',
              }}
            >
              <i className={`ti ${a.icon}`} style={{ fontSize: 24, color: a.color }} />
              <span style={{ fontSize: 'var(--dev-body)', fontWeight: 800, color: 'var(--dev-ink)' }}>{a.name}</span>
              <span style={{ fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)' }}>
                {n === 0 ? 'Vacia' : `${n} meta${n > 1 ? 's' : ''}`}
              </span>
            </button>
          )
        })}
      </div>

      {metas.length === 0 && (
        <Empty icon="ti-target-arrow" text="Aun no tienes metas. Cuentale a Rockie que quieres lograr." />
      )}
    </Screen>
  )
}

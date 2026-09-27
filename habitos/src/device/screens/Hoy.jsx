// HOY — los habitos del dia y su validacion.
//
// LO QUE CAMBIA RESPECTO AL MOVIL:
// en la app se valida DESLIZANDO la tarjeta. Aqui es imposible: el panel
// resistivo no sigue un arrastre con fiabilidad. Asi que el gesto se
// convierte en: tocar la fila -> se abre el detalle -> tres botones grandes.
// Un toque mas que en el movil, pero con 0% de fallo.

import { useState } from 'react'
import { useStore } from '../../data/mockStore.jsx'
import { typeOf } from '../../data/habitTypes.js'
import { Screen, Label, Empty, Bar } from '../ui/Screen.jsx'
import { Tap, TapRow } from '../ui/Tap.jsx'

export default function Hoy() {
  const { today, doneCount, totalCount, pct, streak, validateHabit } = useStore()
  const [abierto, setAbierto] = useState(null)

  const habito = today.find((h) => h.id === abierto)
  if (habito) return <Detalle h={habito} onBack={() => setAbierto(null)} onValidar={validateHabit} />

  const pendientes = today.filter((h) => !h.done)
  const hechos = today.filter((h) => h.done)

  return (
    <Screen title="Hoy">
      {/* Resumen del dia: una barra y dos numeros. Nada mas cabe. */}
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
          <span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-title)', fontWeight: 700 }}>
              {doneCount}
            </span>
            <span style={{ fontSize: 'var(--dev-body)', color: 'var(--dev-ink-soft)' }}> / {totalCount}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--amber)', fontWeight: 800 }}>
            <i className="ti ti-flame" style={{ fontSize: 20 }} />
            <span style={{ fontSize: 'var(--dev-emph)' }}>{streak}</span>
          </span>
        </div>
        <Bar pct={pct} color="var(--olive)" />
      </div>

      {today.length === 0 && <Empty icon="ti-calendar-off" text="No tienes habitos para hoy. Pideselo a Rockie en Hablar." />}

      {pendientes.length > 0 && (
        <>
          <Label>Pendientes</Label>
          {pendientes.map((h) => (
            <Fila key={h.id} h={h} onClick={() => setAbierto(h.id)} />
          ))}
        </>
      )}

      {hechos.length > 0 && (
        <>
          <Label style={{ marginTop: 'var(--space-2)' }}>Hechos</Label>
          {hechos.map((h) => (
            <Fila key={h.id} h={h} hecho onClick={() => setAbierto(h.id)} />
          ))}
        </>
      )}
    </Screen>
  )
}

function Fila({ h, hecho = false, onClick }) {
  const t = typeOf(h.type)
  return (
    <TapRow
      title={h.name}
      sub={`${h.time} · ${h.freq}`}
      icon={h.icon || t.icon}
      iconBg={hecho ? 'var(--green-photo)' : h.color || t.color}
      onClick={onClick}
      style={hecho ? { opacity: 0.72 } : undefined}
      right={
        hecho ? (
          <i className="ti ti-circle-check-filled" style={{ fontSize: 26, color: 'var(--green-photo)' }} />
        ) : (
          <i className="ti ti-chevron-right" style={{ fontSize: 22, color: 'var(--dev-ink-soft)' }} />
        )
      }
    />
  )
}

// ---- Detalle: aqui viven los tres modos de validacion de B+ ----
// foto (+100 XP, la valida Gemini) | check (+40, sin prueba) | manana (0, salva racha)
function Detalle({ h, onBack, onValidar }) {
  const t = typeOf(h.type)
  const [hecho, setHecho] = useState(h.done)

  const validar = (modo) => {
    onValidar(h.id, modo)
    setHecho(true)
    setTimeout(onBack, 650)
  }

  return (
    <Screen title={h.name} onBack={onBack}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-4) 0',
        }}
      >
        <span
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: h.color || t.color,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 38,
            boxShadow: '0 var(--dev-lift) 0 rgba(0,0,0,0.18)',
          }}
        >
          <i className={`ti ${h.icon || t.icon}`} />
        </span>
        <div style={{ fontSize: 'var(--dev-body)', color: 'var(--dev-ink-soft)' }}>
          {h.time} · {h.freq}
        </div>
        {h.streak > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--amber)', fontWeight: 800 }}>
            <i className="ti ti-flame" style={{ fontSize: 18 }} />
            <span style={{ fontSize: 'var(--dev-body)' }}>{h.streak} dias seguidos</span>
          </div>
        )}
      </div>

      {hecho ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-4)',
            borderRadius: 'var(--dev-r)',
            background: 'var(--dev-surface)',
            border: '2px solid var(--green-photo)',
            color: 'var(--green-photo)',
            fontSize: 'var(--dev-emph)',
            fontWeight: 800,
          }}
        >
          <i className="ti ti-circle-check-filled" style={{ fontSize: 26 }} />
          Hecho
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'auto' }}>
          {/* La foto es LA accion de B+: la camara del ESP32-S3 dispara y Gemini juzga */}
          <Tap
            full
            size="lg"
            icon="ti-camera"
            tone="var(--green-photo)"
            edge="var(--green-photo-edge)"
            onClick={() => validar('photo')}
          >
            Probar con foto
          </Tap>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Tap full variant="soft" icon="ti-check" onClick={() => validar('check')}>
              Hecho
            </Tap>
            <Tap full variant="soft" icon="ti-clock-hour-9" onClick={() => validar('tomorrow')}>
              Manana
            </Tap>
          </div>
          <p
            style={{
              margin: 0,
              textAlign: 'center',
              fontSize: 'var(--dev-micro)',
              color: 'var(--dev-ink-soft)',
              lineHeight: 1.4,
            }}
          >
            {h.photo || 'Toma una foto de la prueba'}
          </p>
        </div>
      )}
    </Screen>
  )
}

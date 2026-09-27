// HOY (modo nino) — las tareas que puso papa/mama y su ciclo de aprobacion.
//
// El ciclo completo de una tarea, tal como lo ve el nino:
//   pendiente  -> boton grande "¡Ya lo hice!"
//   enviado    -> "Esperando a papa/mama" (no puede reenviar: anti doble toque)
//   aprobado   -> check verde + las monedas que gano
//   rechazado  -> el motivo amable del padre + boton "Intentar otra vez"
//
// A medianoche todo vuelve a pendiente solo (family.js deriva el estado de la
// fecha, no lo guarda). Los envios de ayer sin resolver siguen vivos del lado
// del padre como "atrasados": aprobar tarde paga igual.

import { useState } from 'react'
import { useFamily, tareasDeHoy, enviarTarea, rachaKid } from '../../data/family.js'
import { Screen, Label, Empty, Bar } from '../ui/Screen.jsx'
import { Tap, TapRow } from '../ui/Tap.jsx'

const ESTADO = {
  pendiente: { icon: 'ti-chevron-right', color: 'var(--dev-ink-soft)' },
  enviado: { icon: 'ti-hourglass', color: 'var(--amber)', label: 'Esperando' },
  aprobado: { icon: 'ti-circle-check-filled', color: 'var(--green-photo)' },
  rechazado: { icon: 'ti-refresh', color: 'var(--coral)', label: 'Otra vez' },
}

export default function HoyNino() {
  const fam = useFamily()
  const [abierta, setAbierta] = useState(null)

  const tareas = tareasDeHoy(fam)
  const tarea = tareas.find(t => t.id === abierta)
  if (tarea) return <Detalle t={tarea} onBack={() => setAbierta(null)} />

  const aprobadas = tareas.filter(t => t.status === 'aprobado').length
  const pct = tareas.length ? Math.round((100 * aprobadas) / tareas.length) : 0

  return (
    <Screen title="Hoy">
      <div
        style={{
          padding: 'var(--space-3)', background: 'var(--dev-surface)',
          borderRadius: 'var(--dev-r)', boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-title)', fontWeight: 700 }}>{aprobadas}</span>
            <span style={{ fontSize: 'var(--dev-body)', color: 'var(--dev-ink-soft)' }}> / {tareas.length}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--amber)', fontWeight: 800 }}>
              <i className="ti ti-coin" style={{ fontSize: 18 }} />
              <span style={{ fontSize: 'var(--dev-emph)' }}>{fam.monedas}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--coral)', fontWeight: 800 }}>
              <i className="ti ti-flame" style={{ fontSize: 18 }} />
              <span style={{ fontSize: 'var(--dev-emph)' }}>{rachaKid(fam)}</span>
            </span>
          </span>
        </div>
        <Bar pct={pct} color="var(--olive)" />
      </div>

      {tareas.length === 0 && (
        <Empty icon="ti-confetti" text="Hoy no tienes tareas. Papa o mama las ponen desde su app." />
      )}

      {tareas.map(t => {
        const e = ESTADO[t.status]
        return (
          <TapRow
            key={t.id}
            title={t.name}
            sub={
              t.status === 'aprobado' ? `¡Ganaste ${t.coins} monedas!`
              : t.status === 'enviado' ? 'Papa o mama lo estan viendo'
              : t.status === 'rechazado' ? 'Puedes intentarlo otra vez'
              : `Vale ${t.coins} monedas${t.time ? ` · ${t.time}` : ''}`
            }
            icon={t.icon}
            iconBg={t.status === 'aprobado' ? 'var(--green-photo)' : t.color}
            onClick={() => setAbierta(t.id)}
            style={t.status === 'aprobado' ? { opacity: 0.78 } : undefined}
            right={<i className={`ti ${e.icon}`} style={{ fontSize: 24, color: e.color }} />}
          />
        )
      })}
    </Screen>
  )
}

function Detalle({ t, onBack }) {
  const [error, setError] = useState(null)

  const enviar = () => {
    const r = enviarTarea(t.id)
    if (!r.ok && r.error === 'ya_enviado') { setError('Ya esta enviado. Un poquito de paciencia.'); return }
    if (!r.ok) { setError('Esta tarea ya no existe. Vuelve a tu lista.'); return }
    setTimeout(onBack, 700)
  }

  return (
    <Screen title={t.name} onBack={onBack}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-4) 0' }}>
        <span
          style={{
            width: 72, height: 72, borderRadius: 20, background: t.color, color: '#fff',
            display: 'grid', placeItems: 'center', fontSize: 38,
            boxShadow: '0 var(--dev-lift) 0 rgba(0,0,0,0.18)',
          }}
        >
          <i className={`ti ${t.icon}`} />
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--amber)', fontWeight: 800 }}>
          <i className="ti ti-coin" style={{ fontSize: 18 }} />
          <span style={{ fontSize: 'var(--dev-body)' }}>Vale {t.coins} monedas</span>
        </div>
      </div>

      {t.status === 'aprobado' && (
        <Estado color="var(--green-photo)" icon="ti-circle-check-filled" texto={`¡Lo lograste! +${t.coins} monedas`} />
      )}

      {t.status === 'enviado' && (
        <>
          <Estado color="var(--amber)" icon="ti-hourglass" texto="Esperando a papa o mama" />
          <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', lineHeight: 1.4 }}>
            Cuando lo revisen, tus monedas llegan solas.
          </p>
        </>
      )}

      {(t.status === 'pendiente' || t.status === 'rechazado') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'auto' }}>
          {t.status === 'rechazado' && (
            <div
              style={{
                padding: 'var(--space-3)', borderRadius: 'var(--dev-r)',
                background: 'var(--dev-surface)', border: '2px solid var(--coral)',
                fontSize: 'var(--dev-body)', lineHeight: 1.4,
              }}
            >
              Papa o mama dicen: <strong>{t.motivoDeHoy || 'intentalo otra vez'}</strong>
            </div>
          )}
          {error && (
            <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--dev-micro)', fontWeight: 800, color: 'var(--coral)' }}>{error}</p>
          )}
          {/* En el aparato real este boton dispara la camara (OV2640): la foto
              viaja al padre como prueba. En el prototipo se envia directo. */}
          <Tap full size="lg" icon="ti-camera" tone="var(--olive)" edge="var(--olive-edge)" onClick={enviar}>
            ¡Ya lo hice!
          </Tap>
        </div>
      )}
    </Screen>
  )
}

function Estado({ color, icon, texto }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
        padding: 'var(--space-4)', borderRadius: 'var(--dev-r)',
        background: 'var(--dev-surface)', border: `2px solid ${color}`, color,
        fontSize: 'var(--dev-emph)', fontWeight: 800,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 26 }} />
      {texto}
    </div>
  )
}

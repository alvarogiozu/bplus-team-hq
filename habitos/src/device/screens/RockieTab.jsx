// ROCKIE — la mascota, su estado y el progreso. Es la pantalla "de reposo":
// lo que el aparato ensena cuando esta sobre la mesa sin que nadie lo toque.
//
// DOS MODOS:
//   usuario -> datos de useStore() (XP, nivel, racha del adulto) + lo puesto
//              de la tienda del adulto. Rockie AHORA SI viste sus accesorios.
//   nino    -> datos de family.js (monedas, racha de tareas aprobadas) y el
//              Rockie del nino (su color, su cara, sus accesorios). La geoda
//              del nino evoluciona por TAREAS APROBADAS, no por XP: es su
//              propia linea de progreso, simple de explicar ("junta logros y
//              tu piedra crece").
//
// En modo nino, al fondo vive la fila "Zona de padres" (candado PIN): es la
// UNICA puerta de salida del modo nino y es a proposito visible — un candado
// escondido seria peor (el padre no lo encontraria) y el PIN ya hace de reja.

import { useState } from 'react'
import { useStore } from '../../data/mockStore.jsx'
import { useFamily, rachaKid } from '../../data/family.js'
import { stageOfLevel } from '../../data/rockie.js'
import Rockie from '../../components/Rockie.jsx'
import { Screen, Bar } from '../ui/Screen.jsx'

// Etapa de la geoda del nino por tareas aprobadas (0/10/30/60):
// misma metafora que los niveles del adulto, motor distinto.
const etapaKid = (aprobadas) => (aprobadas >= 60 ? 4 : aprobadas >= 30 ? 3 : aprobadas >= 10 ? 2 : 1)

export default function RockieTab({ nino = false, onZonaPadres = null }) {
  return nino ? <VistaNino onZonaPadres={onZonaPadres} /> : <VistaUsuario />
}

// ============================================================================
// Modo usuario (la cuenta del adulto, como siempre)
// ============================================================================
function VistaUsuario() {
  const { emotion, level, xp, xpToNext, streak, totalDone, coins, rockieColor, rockieFace, equipped, history } = useStore()
  const [fxKey, setFxKey] = useState(0)
  const [fx, setFx] = useState(null)

  const tocar = () => { setFx('surprise'); setFxKey(Date.now()) }
  // La cara fijada en el inventario manda; lo automatico hereda del dia
  const cara = { eyes: rockieFace?.eyes ?? emotion.eyes, mouth: rockieFace?.mouth ?? emotion.mouth }

  return (
    <Screen title="Rockie" gap="var(--space-2)">
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <Rockie
          emotion={cara} size={92} interactive onTap={tocar}
          fx={fx} fxKey={fxKey} color={rockieColor}
          stage={stageOfLevel(level)} equipped={equipped}
        />
      </div>

      <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--dev-body)', lineHeight: 1.35, minHeight: 38, padding: '0 var(--space-2)' }}>
        {emotion.phrase}
      </p>

      <div
        style={{
          padding: 'var(--space-2) var(--space-3)', background: 'var(--dev-surface)',
          borderRadius: 'var(--dev-r)', boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        }}
      >
        <span style={{ fontSize: 'var(--dev-body)', fontWeight: 800, flex: 'none' }}>Niv {level}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <Bar pct={(xp / Math.max(1, xpToNext)) * 100} color="var(--brand)" h={8} />
        </span>
        <span style={{ fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', fontWeight: 700, flex: 'none' }}>
          {xp}/{xpToNext}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <Stat icon="ti-flame" color="var(--amber)" valor={streak} etiqueta="Racha" />
        <Stat icon="ti-circle-check" color="var(--olive)" valor={totalDone} etiqueta="Hechos" />
        <Stat icon="ti-coin" color="var(--amber)" valor={coins} etiqueta="Monedas" />
        <Stat icon="ti-calendar" color="var(--azure)" valor={diasActivos(history)} etiqueta="Dias" />
      </div>

      <Semana fechas={new Set((history || []).map(h => h.date))} />
    </Screen>
  )
}

// ============================================================================
// Modo nino (family.js: su Rockie, sus monedas, su racha)
// ============================================================================
function VistaNino({ onZonaPadres }) {
  const fam = useFamily()
  const [fxKey, setFxKey] = useState(0)
  const [fx, setFx] = useState(null)

  const aprobadas = fam.envios.filter(e => e.status === 'aprobado').length
  const hoyOk = fam.envios.some(e => e.status === 'aprobado' && e.date === new Date().toISOString().slice(0, 10))
  const racha = rachaKid(fam)
  const cara = {
    eyes: fam.shop.face?.eyes ?? (hoyOk ? 4 : 1),
    mouth: fam.shop.face?.mouth ?? (hoyOk ? 6 : 3),
  }
  const frase = hoyOk
    ? '¡Hoy ya lograste algo! Estoy feliz.'
    : (fam.child?.name ? `${fam.child.name}, ¿jugamos a lograr una tarea?` : '¿Jugamos a lograr una tarea?')

  const tocar = () => { setFx('surprise'); setFxKey(Date.now()) }

  return (
    <Screen title="Rockie" gap="var(--space-2)">
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <Rockie
          emotion={cara} size={92} interactive onTap={tocar}
          fx={fx} fxKey={fxKey} color={fam.shop.color}
          stage={etapaKid(aprobadas)} equipped={fam.shop.equipped}
        />
      </div>

      <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--dev-body)', lineHeight: 1.35, minHeight: 38, padding: '0 var(--space-2)' }}>
        {frase}
      </p>

      {/* Progreso de la geoda del nino: hacia la proxima etapa de su piedra */}
      <div
        style={{
          padding: 'var(--space-2) var(--space-3)', background: 'var(--dev-surface)',
          borderRadius: 'var(--dev-r)', boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        }}
      >
        <span style={{ fontSize: 'var(--dev-body)', fontWeight: 800, flex: 'none' }}>Piedra {etapaKid(aprobadas)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <Bar pct={pctEtapa(aprobadas)} color="var(--berry)" h={8} />
        </span>
        <span style={{ fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', fontWeight: 700, flex: 'none' }}>
          {aprobadas} logros
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <Stat icon="ti-coin" color="var(--amber)" valor={fam.monedas} etiqueta="Monedas" />
        <Stat icon="ti-flame" color="var(--coral)" valor={racha} etiqueta="Racha" />
        <Stat icon="ti-circle-check" color="var(--olive)" valor={aprobadas} etiqueta="Logros" />
      </div>

      <Semana fechas={new Set(fam.envios.filter(e => e.status === 'aprobado').map(e => e.date))} />

      {/* La puerta con candado. Texto neutro a proposito: no promete premios */}
      <button
        type="button"
        className="bp-tap"
        onClick={onZonaPadres}
        style={{
          marginTop: 'auto', minHeight: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'transparent', color: 'var(--dev-ink-soft)',
          fontSize: 'var(--dev-micro)', fontWeight: 800, letterSpacing: '0.06em',
        }}
      >
        <i className="ti ti-lock" style={{ fontSize: 15 }} />
        ZONA DE PADRES
      </button>
    </Screen>
  )
}

// ---- Piezas compartidas ----

/** Dias distintos con actividad en el historial (el stat "Dias" del adulto). */
const diasActivos = (history = []) => new Set((history || []).map(h => h.date)).size

const pctEtapa = (n) => {
  const cortes = [0, 10, 30, 60]
  const et = etapaKid(n)
  if (et >= 4) return 100
  const base = cortes[et - 1], techo = cortes[et]
  return Math.round((100 * (n - base)) / (techo - base))
}

function Stat({ icon, color, valor, etiqueta }) {
  return (
    <div
      style={{
        padding: 'var(--space-2) 4px', background: 'var(--dev-surface)',
        borderRadius: 'var(--dev-r)', boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 17, color }} />
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-emph)', fontWeight: 700, lineHeight: 1.1 }}>
        {valor}
      </span>
      <span style={{ fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', fontWeight: 700 }}>{etiqueta}</span>
    </div>
  )
}

function Semana({ fechas }) {
  const dias = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    dias.push({ iso, letra: ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()], on: fechas.has(iso) })
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
      {dias.map(d => (
        <div key={d.iso} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: d.on ? 'var(--olive)' : 'var(--dev-line)',
              color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16,
            }}
          >
            {d.on && <i className="ti ti-check" />}
          </span>
          <span style={{ fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', fontWeight: 700 }}>{d.letra}</span>
        </div>
      ))}
    </div>
  )
}

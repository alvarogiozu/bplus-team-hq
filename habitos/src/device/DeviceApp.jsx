// ROCKIE COMPANION — interfaz del aparato fisico.
// Panel 3.5" ILI9488 · 320x480 vertical · tactil RESISTIVO · ESP32-S3.
//
// MAQUINA DE MODOS (persistida en localStorage, sobrevive reinicios):
//   (sin modo)            -> SelectorModo: ¿de quien es este Rockie?
//   nino + sin vincular   -> Emparejar: QR + codigo para la app del padre
//   nino + vinculado      -> shell del nino (family.js: tareas, monedas, tienda)
//   usuario               -> shell normal (useStore: la cuenta del adulto)
//
// La salida del modo nino SOLO pasa por la Zona de Padres (PIN). Si el padre
// desvincula desde su app, el aparato vuelve solo a Emparejar (obedece el
// estado compartido, no guarda soberania propia).
//
// CEREBRO: en el aparato real SIEMPRE es Gemini por WiFi (el ESP32-S3 no corre
// un LLM local; la clave vive en una edge function, jamas en el firmware).
// El parser local del prototipo existe SOLO como demo sin red.

import { useEffect, useRef, useState } from 'react'
import './device.css'
import { useStore } from '../data/mockStore.jsx'
import { useFamily, comprarKid, equiparKid, setColorKid, setCaraKid } from '../data/family.js'
import { stageOfLevel } from '../data/rockie.js'
import Tabs from './nav/Tabs.jsx'
import Chat from './screens/Chat.jsx'
import Hoy from './screens/Hoy.jsx'
import HoyNino from './screens/HoyNino.jsx'
import RockieTab from './screens/RockieTab.jsx'
import Tienda from './screens/Tienda.jsx'
import { SelectorModo, Emparejar, ZonaPadres } from './screens/ModoNino.jsx'
import { hayGemini } from './agent/runAgent.js'

const LS_MODO = 'bplus.device.mode'

export default function DeviceApp() {
  const { live, user, me, needsAuth } = useStore()
  const [modo, setModo] = useState(() => {
    try { return localStorage.getItem(LS_MODO) } catch { return null }
  })
  const [tab, setTab] = useState('chat')
  const [zonaPadres, setZonaPadres] = useState(false)
  const [zoom, setZoom] = useState(1)
  const fam = useFamily()

  const cambiarModo = (m) => {
    try { m ? localStorage.setItem(LS_MODO, m) : localStorage.removeItem(LS_MODO) } catch { /* sin LS */ }
    setModo(m)
    setTab('chat')
    setZonaPadres(false)
  }

  const sesionReal = live && !!user
  const nombreCuenta = me?.name || user?.user_metadata?.full_name || user?.email || 'Tu cuenta'

  return (
    <div className="bp-device-frame">
      {/* ---- Control de zoom: SOLO del prototipo, para verlo en el PC ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 800, color: 'var(--ink-soft)', letterSpacing: '0.06em' }}>
          320 × 480 · 3.5" · RESISTIVO{modo === 'nino' ? ' · MODO NINO' : ''}
        </span>
        {[1, 1.5, 2].map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: 0, cursor: 'pointer',
              background: zoom === z ? 'var(--ink)' : 'var(--card)',
              color: zoom === z ? '#fff' : 'var(--ink-soft)',
              fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 'var(--text-2xs)',
            }}
          >
            {z}×
          </button>
        ))}
        {sesionReal ? (
          <span
            style={{
              marginLeft: 'auto', padding: '6px 12px', borderRadius: 999,
              background: 'var(--olive-soft)', color: 'var(--olive)',
              fontSize: 'var(--text-2xs)', fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--olive)' }} />
            {nombreCuenta} · en vivo
          </span>
        ) : needsAuth ? (
          <a
            href="/entrar"
            style={{
              marginLeft: 'auto', padding: '6px 12px', borderRadius: 999,
              background: 'var(--amber)', color: '#fff', textDecoration: 'none',
              fontSize: 'var(--text-2xs)', fontWeight: 800,
            }}
          >
            Inicia sesion para ver tu cuenta
          </a>
        ) : (
          <span
            style={{
              marginLeft: 'auto', padding: '6px 12px', borderRadius: 999,
              background: 'var(--card)', color: 'var(--ink-soft)',
              fontSize: 'var(--text-2xs)', fontWeight: 800,
            }}
          >
            Demo local (sin Supabase)
          </span>
        )}
      </div>

      {/* ---- El aparato ---- */}
      <div
        className="bp-device-bezel"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', marginBottom: (zoom - 1) * 500 }}
      >
        <div className="bp-device" style={{ borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
          <Contenido
            modo={modo}
            tab={tab}
            onTab={setTab}
            fam={fam}
            zonaPadres={zonaPadres}
            setZonaPadres={setZonaPadres}
            cambiarModo={cambiarModo}
          />
        </div>
      </div>

      {/* ---- Nota de estado (tampoco existe en el aparato) ---- */}
      <p className="bp-device-note">
        {modo === 'nino' && fam.paired ? (
          <>
            <strong>Modo nino activo</strong> — vinculado a la app del padre (Ajustes → Control parental).
            Abre <code>/familia</code> en otra ventana y veras que se sincronizan en vivo.
          </>
        ) : sesionReal ? (
          <>
            <strong>Cuenta conectada.</strong> Habitos, XP y tienda son los de {nombreCuenta}
            (misma base que el movil). En el ESP32 esto llega por WiFi + Vincular aparato.
          </>
        ) : hayGemini() ? (
          <>
            <strong>Gemini conectado.</strong> Lo que le digas a Rockie crea habitos y metas de verdad —
            en el mismo store que la app del movil.
          </>
        ) : (
          <>
            <strong>Modo local</strong> (sin <code>VITE_GEMINI_API_KEY</code>): parser de intenciones para
            demo sin internet. En el aparato real el cerebro SIEMPRE es Gemini por WiFi.
          </>
        )}
      </p>
    </div>
  )
}

// ============================================================================
// El interior del panel segun el modo
// ============================================================================
function Contenido({ modo, tab, onTab, fam, zonaPadres, setZonaPadres, cambiarModo }) {
  // 1. Primer arranque: elegir de quien es
  if (!modo) {
    return (
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <SelectorModo onElegir={cambiarModo} />
      </div>
    )
  }

  // 2. Modo nino sin vincular: esperar a la app del padre
  if (modo === 'nino' && !fam.paired) {
    return (
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Emparejar onCancelar={() => cambiarModo(null)} />
      </div>
    )
  }

  // 3. Zona de padres (overlay con PIN, solo en modo nino)
  if (modo === 'nino' && zonaPadres) {
    return (
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ZonaPadres onBack={() => setZonaPadres(false)} onCambiarModo={cambiarModo} />
      </div>
    )
  }

  // 4. Shell con pestanas (usuario o nino)
  return (
    <>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {modo === 'nino'
          ? <PantallaNino tab={tab} onZonaPadres={() => setZonaPadres(true)} />
          : <PantallaUsuario tab={tab} />}
        {modo === 'nino' && <ToastMonedas monedas={fam.monedas} />}
      </div>
      <Tabs tab={tab} onTab={onTab} />
    </>
  )
}

function PantallaUsuario({ tab }) {
  const store = useStore()

  // Adaptador de billetera: la Tienda no sabe de que cuenta vive
  const wallet = {
    coins: store.coins,
    owned: store.shopOwned,
    equipped: store.equipped,
    color: store.rockieColor,
    face: store.rockieFace,
    buy: (item) => store.buyItem(item.id),
    equip: (item) => store.equipItem(item.id),
    setColor: store.setRockieColor,
    setEyes: store.setRockieEyes,
    setMouth: store.setRockieMouth,
    estaPuesto: (item) =>
      item.type === 'stone' ? store.rockieColor === item.colorId
      : item.type === 'bg' ? store.equipped?.fondo === item.id
      : store.equipped?.[item.slot] === item.id,
  }

  switch (tab) {
    case 'hoy': return <Hoy key="hoy" />
    case 'rockie': return <RockieTab key="rockie" />
    case 'tienda': return <Tienda key="tienda" wallet={wallet} emotion={store.emotion} stage={stageOfLevel(store.level)} />
    default: return <Chat key="chat" />
  }
}

function PantallaNino({ tab, onZonaPadres }) {
  const fam = useFamily()
  const aprobadas = fam.envios.filter(e => e.status === 'aprobado').length

  const wallet = {
    coins: fam.monedas,
    owned: fam.shop.owned,
    equipped: fam.shop.equipped,
    color: fam.shop.color,
    face: fam.shop.face,
    // Los candados por nivel/dias del catalogo se traducen a logros del nino
    buy: (item) => comprarKid(item, { level: aprobadas, days: aprobadas }),
    equip: (item) => equiparKid(item),
    setColor: setColorKid,
    setEyes: (v) => setCaraKid('eyes', v),
    setMouth: (v) => setCaraKid('mouth', v),
    estaPuesto: (item) =>
      item.type === 'stone' ? fam.shop.color === item.colorId
      : item.type === 'bg' ? fam.shop.equipped?.fondo === item.id
      : fam.shop.equipped?.[item.slot] === item.id,
  }
  const caraNino = { eyes: 1, mouth: 6 }

  switch (tab) {
    case 'hoy': return <HoyNino key="hoy" />
    case 'rockie': return <RockieTab key="rockie" nino onZonaPadres={onZonaPadres} />
    case 'tienda': return <Tienda key="tienda" wallet={wallet} emotion={caraNino} stage={aprobadas >= 60 ? 4 : aprobadas >= 30 ? 3 : aprobadas >= 10 ? 2 : 1} />
    default: return <Chat key="chat" nino rockieLook={{ emotion: caraNino, color: fam.shop.color }} />
  }
}

// ============================================================================
// Toast de monedas: cuando el padre aprueba desde su app, el nino VE llegar
// el premio sin tener que buscarlo. Se dispara comparando el saldo anterior.
// ============================================================================
function ToastMonedas({ monedas }) {
  const prev = useRef(monedas)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const delta = monedas - prev.current
    prev.current = monedas
    if (delta > 0) {
      setToast(`+${delta}`)
      const t = setTimeout(() => setToast(null), 2200)
      return () => clearTimeout(t)
    }
  }, [monedas])

  if (!toast) return null
  return (
    <div
      className="bp-fade"
      style={{
        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
        zIndex: 60, display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderRadius: 999,
        background: 'var(--amber)', color: '#fff',
        fontSize: 'var(--dev-emph)', fontWeight: 800,
        boxShadow: '0 3px 0 var(--amber-edge)',
      }}
    >
      <i className="ti ti-coin" style={{ fontSize: 20 }} />
      {toast} monedas
    </div>
  )
}

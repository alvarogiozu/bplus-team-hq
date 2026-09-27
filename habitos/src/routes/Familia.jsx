// CONTROL PARENTAL — el lado del padre/madre en la app movil.
// Entrada: Ajustes -> Control parental. Ruta standalone (como /legal): es una
// zona de administracion, no una pestana del nino ni del dia a dia.
//
// La tesis: el aparato Rockie como alternativa al primer celular. El nino
// gana dopamina cumpliendo metas reales; el padre define QUE tareas valen
// QUE premios (monedas para personalizar su Rockie) y aprueba las pruebas.
//
// Todo opera sobre data/family.js (compartido con el aparato). En el
// prototipo la sincronizacion es localStorage + evento storage: abre /device
// en otra ventana y los cambios cruzan en vivo. En produccion: Supabase
// Realtime, mismo contrato.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRScanner from '../components/QRScanner.jsx'
import {
  useFamily, vincular, desvincular, borrarDatosNino, cambiarPin,
  crearTarea, editarTarea, borrarTarea, aprobar, rechazar, resolverPeticion,
  pendientesDePadre, tareasDeHoy, rachaKid, TASK_OPTS,
} from '../data/family.js'

export default function Familia() {
  const navigate = useNavigate()
  const fam = useFamily()

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--screen-x) var(--space-2)' }}>
        <button
          type="button"
          onClick={() => navigate('/ajustes')}
          aria-label="Volver"
          style={{
            width: 'var(--tap-min)', height: 'var(--tap-min)', border: 0, cursor: 'pointer',
            borderRadius: 'var(--r-md)', background: 'var(--card)',
            boxShadow: '0 2px 0 var(--card-edge)', color: 'var(--ink)',
            display: 'grid', placeItems: 'center', fontSize: 20,
          }}
        >
          <i className="ti ti-chevron-left" />
        </button>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', color: 'var(--title)', fontWeight: 700 }}>
          Control parental
        </h1>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 var(--screen-x) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {fam.paired ? <Panel fam={fam} /> : <Vincular fam={fam} />}
      </div>
    </div>
  )
}

// ============================================================================
// Sin vincular: explicar + formulario de vinculacion
// ============================================================================
function Vincular({ fam }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [escaneando, setEscaneando] = useState(false)

  const ERRORES = {
    sin_codigo: 'El aparato aun no genero un codigo. En el Rockie, elige "Es para mi hijo/a".',
    codigo: 'No encuentro ese codigo. Revisa las 6 letras — y si el aparato dice "Sin conexion con el servidor", necesita WiFi para anunciarse antes de poder vincularlo.',
    nombre: 'Ponle el nombre de tu hijo/a.',
    pin: 'El PIN son exactamente 4 numeros.',
  }

  const enviar = async (e) => {
    e.preventDefault()
    const r = await vincular({ code, name, pin })
    setError(r.ok ? null : ERRORES[r.error] || 'No se pudo vincular.')
  }

  // Escanear SOLO rellena el codigo: el nombre del nino y el PIN los tiene
  // que elegir el padre, no pueden salir de un QR.
  const alEscanear = (texto) => {
    setEscaneando(false)
    // El QR del modo ADULTO (bplus://aparato/...) no va aqui: ese se
    // reclama en Ajustes > Vincular aparato.
    if (String(texto).includes('://aparato/')) {
      setError('Ese QR es del modo adulto. Se vincula en Ajustes > Vincular aparato.')
      return
    }
    const s = String(texto || '').toUpperCase()
    const fromPath = s.match(/\/\/VINCULAR\/([A-Z2-9]{4,8})/)
    const all = s.match(/[A-Z2-9]{6}/g)
    const c = fromPath?.[1]?.slice(0, 6) || (all?.length ? all[all.length - 1] : null)
    if (c) { setCode(c); setError(null) }
    else setError('Ese QR no es el de un Rockie.')
  }

  return (
    <>
      <Card>
        <p style={{ margin: 0, fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--ink)' }}>
          El Rockie Companion puede ser el aparato de tu hijo/a: <strong>tu decides las tareas
          y los premios</strong> desde aqui, y el gana monedas cumpliendolas para personalizar
          su Rockie. Sin pantallas infinitas, sin feed: logros de verdad.
        </p>
      </Card>

      <Card titulo="Vincular el aparato">
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          <li>En el Rockie, toca <strong>"Es para mi hijo/a"</strong></li>
          <li>Escribe el codigo de 6 letras que muestra</li>
          <li>Elige nombre y un PIN que solo sepas tu</li>
        </ol>
        <button
          type="button"
          onClick={() => setEscaneando(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, width: '100%', marginTop: 'var(--space-3)',
            padding: 'var(--space-3)', borderRadius: 'var(--radius)', border: 'none',
            background: 'var(--berry)', color: '#fff', fontWeight: 800,
            fontSize: 'var(--text-base)', cursor: 'pointer',
          }}
        >
          <i className="ti ti-qrcode" style={{ fontSize: 20 }} />
          Escanear el QR del aparato
        </button>

        <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <Campo
            valor={code}
            onCambio={(v) => {
              // Si pegan el link del QR (bplus://vincular/ABC123), extraer el codigo
              const u = v.toUpperCase()
              setCode((u.match(/[A-Z2-9]{6}(?=\s*$)/) || [u.replace(/[^A-Z0-9]/g, '')])[0].slice(0, 6))
            }}
            placeholder="Codigo del aparato o link del QR"
            style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 800, textAlign: 'center', fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)' }}
          />
          <Campo valor={name} onCambio={setName} placeholder="Nombre de tu hijo/a" maxLength={20} />
          <Campo valor={pin} onCambio={(v) => setPin(v.replace(/\D/g, ''))} placeholder="PIN de 4 numeros" maxLength={4} inputMode="numeric" />
          {error && <Aviso>{error}</Aviso>}
          <BotonPrimario type="submit" icon="ti-link">Vincular</BotonPrimario>
        </form>
      </Card>

      <QRScanner open={escaneando} onScan={alEscanear} onClose={() => setEscaneando(false)} />
    </>
  )
}

// ============================================================================
// Vinculado: el panel del padre
// ============================================================================
function Panel({ fam }) {
  const pendientes = pendientesDePadre(fam)
  const peticiones = fam.requests.filter(r => r.status === 'nueva')
  const hoy = tareasDeHoy(fam)
  const aprobadasHoy = hoy.filter(t => t.status === 'aprobado').length

  return (
    <>
      {/* Resumen del nino */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span
            style={{
              width: 52, height: 52, flex: 'none', borderRadius: '50%',
              background: 'var(--berry-soft)', color: 'var(--berry)',
              display: 'grid', placeItems: 'center', fontSize: 26,
            }}
          >
            <i className="ti ti-mood-kid" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--ink)' }}>
              {fam.child?.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
              Hoy: {aprobadasHoy}/{hoy.length} tareas aprobadas
            </div>
          </div>
          <Dato icon="ti-coin" color="var(--amber)" v={fam.monedas} />
          <Dato icon="ti-flame" color="var(--coral)" v={rachaKid(fam)} />
        </div>
      </Card>

      {/* Por aprobar: LO PRIMERO — es la accion que el nino esta esperando */}
      {pendientes.length > 0 && (
        <Card titulo={`Por aprobar (${pendientes.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {pendientes.map(e => <FilaAprobar key={e.id} e={e} />)}
          </div>
        </Card>
      )}

      {/* Peticiones del nino via Rockie */}
      {peticiones.length > 0 && (
        <Card titulo={`${fam.child?.name} pide (${peticiones.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {peticiones.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>"{p.text}"</span>
                <BotonMini tono="var(--olive)" onClick={() => resolverPeticion(p.id, true)}>Hacer tarea</BotonMini>
                <BotonMini tono="var(--ink-muted)" onClick={() => resolverPeticion(p.id, false)}>Ahora no</BotonMini>
              </div>
            ))}
          </div>
          <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
            "Hacer tarea" la crea con 10 monedas; editala abajo si quieres.
          </p>
        </Card>
      )}

      <Tareas fam={fam} />
      <AjustesNino fam={fam} />
    </>
  )
}

function FilaAprobar({ e }) {
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const esHoy = e.date === new Date().toISOString().slice(0, 10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span
          style={{
            width: 38, height: 38, flex: 'none', borderRadius: 'var(--r-sm)',
            background: e.task.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 19,
          }}
        >
          <i className={`ti ${e.task.icon}`} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>{e.task.name}</div>
          <div style={{ fontSize: 'var(--text-2xs)', color: esHoy ? 'var(--ink-muted)' : 'var(--coral)', fontWeight: esHoy ? 500 : 700 }}>
            {esHoy ? 'hoy' : `atrasado · ${e.date}`} · vale {e.task.coins} monedas
          </div>
        </div>
        {!rechazando && (
          <>
            <BotonMini tono="var(--green-photo)" icon="ti-check" onClick={() => aprobar(e.id)}>Aprobar</BotonMini>
            <BotonMini tono="var(--coral)" icon="ti-x" onClick={() => setRechazando(true)} />
          </>
        )}
      </div>
      {rechazando && (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Campo valor={motivo} onCambio={setMotivo} placeholder="Motivo amable (lo vera el nino)" maxLength={80} compacto />
          <BotonMini tono="var(--coral)" onClick={() => { rechazar(e.id, motivo); setRechazando(false); setMotivo('') }}>Enviar</BotonMini>
        </div>
      )}
    </div>
  )
}

// ---- Tareas: crear, editar premio, pausar, borrar ----
function Tareas({ fam }) {
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [coins, setCoins] = useState(10)
  const [opt, setOpt] = useState(0)

  const crear = async (e) => {
    e.preventDefault()
    const o = TASK_OPTS[opt]
    const r = await crearTarea({ name: nombre || o.label, icon: o.icon, color: o.color, coins })
    if (r.ok) { setCreando(false); setNombre(''); setCoins(10) }
  }

  return (
    <Card titulo={`Tareas de ${fam.child?.name} (${fam.tasks.length})`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {fam.tasks.map(t => <FilaTarea key={t.id} t={t} />)}

        {creando ? (
          <form onSubmit={crear} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--line)' }}>
            {/* Sugerencias tocables: crear una tarea tipica es UN toque */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {TASK_OPTS.map((o, i) => (
                <button
                  key={o.label} type="button" onClick={() => { setOpt(i); setNombre(o.label) }}
                  style={{
                    padding: '8px 12px', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                    border: `2px solid ${i === opt ? o.color : 'var(--line)'}`,
                    background: i === opt ? o.color : 'var(--card)',
                    color: i === opt ? '#fff' : 'var(--ink-soft)',
                    fontSize: 'var(--text-2xs)', fontWeight: 700, fontFamily: 'var(--font-sans)',
                  }}
                >
                  <i className={`ti ${o.icon}`} style={{ marginRight: 4 }} />{o.label}
                </button>
              ))}
            </div>
            <Campo valor={nombre} onCambio={setNombre} placeholder="O escribe la tuya" maxLength={40} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', flex: 1 }}>Premio en monedas</span>
              <Paso onClick={() => setCoins(c => Math.max(1, c - 5))}>−</Paso>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 700, minWidth: 34, textAlign: 'center', color: 'var(--amber)' }}>{coins}</span>
              <Paso onClick={() => setCoins(c => Math.min(100, c + 5))}>+</Paso>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <BotonPrimario type="submit" icon="ti-plus">Crear tarea</BotonPrimario>
              <BotonMini tono="var(--ink-muted)" onClick={() => setCreando(false)}>Cancelar</BotonMini>
            </div>
          </form>
        ) : (
          <BotonPrimario icon="ti-plus" onClick={() => setCreando(true)}>Nueva tarea</BotonPrimario>
        )}
      </div>
    </Card>
  )
}

function FilaTarea({ t }) {
  const [borrando, setBorrando] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span
        style={{
          width: 38, height: 38, flex: 'none', borderRadius: 'var(--r-sm)',
          background: t.active ? t.color : 'var(--ink-faint)', color: '#fff',
          display: 'grid', placeItems: 'center', fontSize: 19,
        }}
      >
        <i className={`ti ${t.icon}`} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: t.active ? 'var(--ink)' : 'var(--ink-muted)', textDecoration: t.active ? 'none' : 'line-through' }}>
          {t.name}
        </div>
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
          <i className="ti ti-coin" style={{ color: 'var(--amber)' }} /> {t.coins} monedas
        </div>
      </div>
      {borrando ? (
        <>
          <BotonMini tono="var(--coral)" onClick={() => borrarTarea(t.id)}>Si, borrar</BotonMini>
          <BotonMini tono="var(--ink-muted)" onClick={() => setBorrando(false)}>No</BotonMini>
        </>
      ) : (
        <>
          <BotonMini tono="var(--azure)" icon={t.active ? 'ti-player-pause' : 'ti-player-play'} onClick={() => editarTarea(t.id, { active: !t.active })} />
          <BotonMini tono="var(--coral)" icon="ti-trash" onClick={() => setBorrando(true)} />
        </>
      )}
    </div>
  )
}

// ---- Ajustes de la vinculacion ----
function AjustesNino({ fam }) {
  const [pinNuevo, setPinNuevo] = useState('')
  const [msg, setMsg] = useState(null)
  const [confirmarBorrado, setConfirmarBorrado] = useState(0) // 0 -> 1 -> borra

  return (
    <Card titulo="Aparato">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Campo
            valor={pinNuevo}
            onCambio={(v) => setPinNuevo(v.replace(/\D/g, ''))}
            placeholder="Nuevo PIN (4 numeros)" maxLength={4} inputMode="numeric" compacto
          />
          <BotonMini
            tono="var(--azure)"
            onClick={async () => {
              const r = await cambiarPin(pinNuevo)
              setMsg(r.ok ? 'PIN cambiado' : 'Son 4 numeros')
              if (r.ok) setPinNuevo('')
              setTimeout(() => setMsg(null), 2000)
            }}
          >
            Cambiar PIN
          </BotonMini>
        </div>
        {msg && <Aviso ok={msg === 'PIN cambiado'}>{msg}</Aviso>}

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <BotonMini tono="var(--ink-muted)" icon="ti-unlink" onClick={() => desvincular()}>Desvincular</BotonMini>
          <BotonMini
            tono="var(--coral)"
            icon="ti-trash"
            onClick={() => {
              if (confirmarBorrado === 0) { setConfirmarBorrado(1); setTimeout(() => setConfirmarBorrado(0), 4000); return }
              borrarDatosNino()
            }}
          >
            {confirmarBorrado ? '¿Seguro? Borra TODO' : 'Borrar datos del nino'}
          </BotonMini>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          Desvincular deja el aparato en la pantalla de inicio pero conserva monedas,
          inventario e historial (re-vincular lo recupera). Borrar datos es definitivo.
        </p>
      </div>
    </Card>
  )
}

// ============================================================================
// Piezas de UI (estilo de la app: tokens + cantos 2.5D)
// ============================================================================
function Card({ titulo, children }) {
  return (
    <section style={{ background: 'var(--card)', borderRadius: 'var(--r-lg)', padding: 'var(--space-4)', boxShadow: '0 3px 0 var(--card-edge)' }}>
      {titulo && (
        <h2 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-2xs)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
          {titulo}
        </h2>
      )}
      {children}
    </section>
  )
}

function Campo({ valor, onCambio, compacto = false, style = {}, ...rest }) {
  return (
    <input
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      style={{
        flex: 1, minWidth: 0, height: compacto ? 40 : 'var(--tap-min)',
        padding: '0 var(--space-3)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
        color: 'var(--ink)', background: 'var(--paper-clean)',
        border: '2px solid var(--line)', borderRadius: 'var(--r-md)', outline: 'none',
        ...style,
      }}
      {...rest}
    />
  )
}

function BotonPrimario({ children, icon, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        minHeight: 'var(--tap-min)', padding: '0 var(--space-4)', border: 0, cursor: 'pointer',
        borderRadius: 'var(--r-md)', background: 'var(--brand)', color: '#fff',
        boxShadow: '0 3px 0 var(--brand-edge)', fontSize: 'var(--text-sm)', fontWeight: 800,
        fontFamily: 'var(--font-sans)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      {icon && <i className={`ti ${icon}`} />}
      {children}
    </button>
  )
}

function BotonMini({ children, icon, tono, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 40, minWidth: 40, padding: children ? '0 12px' : 0, flex: 'none',
        border: `2px solid ${tono}`, cursor: 'pointer', borderRadius: 'var(--r-pill)',
        background: 'transparent', color: tono,
        fontSize: 'var(--text-2xs)', fontWeight: 800, fontFamily: 'var(--font-sans)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 16 }} />}
      {children}
    </button>
  )
}

function Paso({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 'var(--tap-min)', height: 'var(--tap-min)', border: 0, cursor: 'pointer',
        borderRadius: 'var(--r-md)', background: 'var(--card-2)', color: 'var(--ink)',
        boxShadow: '0 2px 0 var(--card-edge)', fontSize: 'var(--text-lg)', fontWeight: 800,
      }}
    >
      {children}
    </button>
  )
}

function Aviso({ children, ok = false }) {
  return (
    <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 700, color: ok ? 'var(--green-photo)' : 'var(--coral)' }}>
      {children}
    </p>
  )
}

function Dato({ icon, color, v }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontWeight: 800, fontSize: 'var(--text-base)', flex: 'none' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 18 }} />
      {v}
    </span>
  )
}

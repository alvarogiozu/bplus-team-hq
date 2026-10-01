// Pantallas del Cofre: crearlo la primera vez, guardar el código de recuperación, abrirlo en un dispositivo
// nuevo y (en /cofre) agregar dispositivos. La lógica vive en lib/cofre; aquí solo se le habla a la persona.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { usarInvitacionPendiente } from './invitaciones'
import { Rockie } from '../../components/Rockie'
import { Icon } from '../../components/Icon'
import { cofre, supabase } from '../../lib/supabase'
import { esperarResellados, tablasDeEquipoActivas, tablasPersonalesActivas, versionDelRegistro } from '../../lib/cofre/fetchCifrado'
import { normalizarCodigo } from '../../lib/cofre/cripto'
import { signOut } from '../auth/credentials'

const CLAVE_TRASPASO = 'cofre.traspaso'
const pendienteGuardar = (uid: string) => `cofre.guardar-codigo.${uid}`
// con la versión del registro: cuando se activa una tanda nueva, se vuelve a barrer en seguida
const ultimoSellado = (uid: string) => `cofre.sellado.${versionDelRegistro()}.${uid}`

function leer(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function escribir(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: solo se pierde el recordatorio */
  }
}

/** El código de traspaso que trajo el QR (main.tsx lo guarda y lo quita de la barra de direcciones). */
export function guardarTraspasoDeLaUrl() {
  const m = /[#&]traspaso=([0-9A-Za-z-]+)/.exec(window.location.hash)
  if (!m) return
  try {
    sessionStorage.setItem(CLAVE_TRASPASO, m[1])
  } catch {
    /* sin sessionStorage: habrá que escribirlo */
  }
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

function useCofre() {
  return useSyncExternalStore(
    (f) => cofre.suscribir(f),
    () => cofre.snapshot,
  )
}

/** Cierra con la llave lo que se guardó antes del Cofre (o lo que el servidor escribió en claro): lo personal y lo
 *  de cada equipo. Leer basta: el fetch del Cofre sella cada fila en claro que encuentra. */
async function sellarLoAnterior(uid: string) {
  type Consulta = {
    eq: (c: string, v: string) => Consulta
    in: (c: string, v: string[]) => Consulta
    range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>
  }
  const leerTodo = async (tabla: string, cols: string[], filtro: (q: Consulta) => Consulta) => {
    for (let desde = 0; ; desde += 500) {
      const q = supabase.from(tabla as never).select(cols.join(',')) as unknown as Consulta
      const { data, error } = await filtro(q).range(desde, desde + 499)
      if (error || !data || (data as unknown[]).length < 500) break
    }
  }
  for (const t of tablasPersonalesActivas()) await leerTodo(t.tabla, [...new Set([t.pk, ...t.extra, ...t.cifrar])], (q) => q.eq(t.dueno, uid))
  const { data: mias } = await supabase.from('space_members').select('space_id').eq('user_id', uid)
  const equipos = (mias ?? []).map((m) => m.space_id)
  if (equipos.length) {
    for (const t of tablasDeEquipoActivas()) {
      await leerTodo(t.tabla, [...new Set([t.pk, t.col, ...t.cifrar])], (q) => q.in(t.col, equipos))
    }
  }
  await esperarResellados()
  escribir(ultimoSellado(uid), String(Date.now()))
}

function Marco({ titulo, lead, children }: { titulo: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main className="authwrap">
      <div className="card authcard">
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Rockie color="var(--brand)" size={64} />
        </div>
        <h1>{titulo}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </main>
  )
}

function Punto({ icono, children }: { icono: string; children: ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'flex-start', fontSize: 'var(--t-s)', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
      <span aria-hidden="true" style={{ fontSize: 'var(--t-md)', lineHeight: 1.2 }}>{icono}</span>
      <span>{children}</span>
    </li>
  )
}

function CodigoGrande({ codigo }: { codigo: string }) {
  return (
    <div
      aria-label="Código"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 'var(--t-lg)',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textAlign: 'center',
        padding: 'var(--s4)',
        borderRadius: 'var(--r-md)',
        background: 'var(--accent-soft)',
        color: 'var(--accent-ink)',
        wordBreak: 'break-word',
        userSelect: 'all',
      }}
    >
      {codigo}
    </div>
  )
}

// ——— primera vez ———

function CrearCofre({ onCreado }: { onCreado: (codigo: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function crear() {
    setBusy(true)
    setError('')
    try {
      onCreado(await cofre.crear())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Marco titulo="Tu Cofre" lead="Desde ahora, lo que guardas en Rockie se cifra en tu dispositivo antes de salir.">
      <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--s5) 0', display: 'grid', gap: 'var(--s3)' }}>
        <Punto icono="🔒">Tu agenda, tus notas y lo que le dices a Rockie se cierran con una llave que solo tienen tus dispositivos.</Punto>
        <Punto icono="👥">Lo de tu equipo se cierra con una llave que solo tiene tu equipo.</Punto>
        <Punto icono="🙈">Nadie más puede leerlo: ni Rockie, ni quienes lo hacemos, ni el servicio donde se guarda.</Punto>
        <Punto icono="🗝️">Te daremos un código de recuperación. Guárdalo bien: si pierdes tus dispositivos, es la única forma de volver a abrir tu Cofre.</Punto>
      </ul>
      <button className="btn block" onClick={crear} disabled={busy}>
        {busy ? 'Creando tu llave…' : 'Crear mi Cofre'}
      </button>
      {error && <p className="formerror" role="alert">{error}</p>}
    </Marco>
  )
}

function GuardaTuCodigo({ uid, codigo: inicial, onListo }: { uid: string; codigo: string | null; onListo: () => void }) {
  const [codigo, setCodigo] = useState(inicial)
  const [confirma, setConfirma] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [fase, setFase] = useState<'mostrar' | 'sellando'>('mostrar')
  const [error, setError] = useState('')
  const pedido = useRef(false)

  useEffect(() => {
    // se recargó la página antes de confirmar: el código anterior no se volverá a mostrar, se crea otro
    if (codigo || pedido.current) return
    pedido.current = true
    cofre.nuevoCodigoRecuperacion().then(setCodigo, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [codigo])

  if (!codigo) {
    return (
      <Marco titulo="Tu código de recuperación" lead="Preparando un código nuevo…">
        {error && <p className="formerror" role="alert">{error}</p>}
      </Marco>
    )
  }

  const ultimos = normalizarCodigo(codigo).slice(-4)
  const ok = normalizarCodigo(confirma) === ultimos

  function descargar() {
    const texto =
      `Código de recuperación de tu Cofre de Rockie\n\n${codigo}\n\n` +
      'Con este código abres tu Cofre en un dispositivo nuevo si pierdes los tuyos.\n' +
      'Guárdalo en un lugar seguro (no en este mismo dispositivo). Nadie de Rockie puede recuperarlo por ti.\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }))
    a.download = 'cofre-rockie-codigo.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function listo(e: FormEvent) {
    e.preventDefault()
    if (!ok) return
    setFase('sellando')
    escribir(pendienteGuardar(uid), null)
    try {
      await sellarLoAnterior(uid)
    } finally {
      onListo()
    }
  }

  if (fase === 'sellando') {
    return <Marco titulo="Cerrando lo que ya tenías" lead="Un momento: estamos cifrando lo que guardaste antes del Cofre." >{null}</Marco>
  }

  return (
    <Marco titulo="Tu código de recuperación" lead="Escríbelo o guárdalo fuera de este dispositivo. Solo se muestra esta vez.">
      <div style={{ margin: 'var(--s5) 0 var(--s3)' }}>
        <CodigoGrande codigo={codigo} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--s2)' }}>
        <button
          type="button"
          className="btn ghost sm"
          style={{ flex: 1 }}
          onClick={() => navigator.clipboard?.writeText(codigo).then(() => setCopiado(true), () => undefined)}
        >
          <Icon name={copiado ? 'check' : 'copy'} className="sm" /> {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="btn ghost sm" style={{ flex: 1 }} onClick={descargar}>
          <Icon name="download" className="sm" /> Descargar
        </button>
      </div>
      <p className="hint" style={{ marginTop: 'var(--s4)', lineHeight: 1.5 }}>
        Si pierdes tus dispositivos y también este código, nadie podrá abrir tu Cofre, ni siquiera nosotros. Así sabes
        que nadie más puede leer lo tuyo.
      </p>
      <form onSubmit={listo} style={{ marginTop: 'var(--s4)' }}>
        <label className="lbl" htmlFor="cofre-confirma">
          Para confirmar, escribe los últimos 4 caracteres
        </label>
        <input
          id="cofre-confirma"
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
        />
        <button className="btn block" style={{ marginTop: 'var(--s4)' }} disabled={!ok}>
          Ya lo guardé
        </button>
      </form>
    </Marco>
  )
}

// ——— dispositivo nuevo ———

function AbrirCofre() {
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const auto = useRef(false)

  async function abrir(valor: string) {
    const n = normalizarCodigo(valor)
    if (n.length !== 12 && n.length !== 24) {
      setError('El código de tu otro dispositivo tiene 12 caracteres; el de recuperación, 24.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (n.length === 12) await cofre.recibirTraspaso(n)
      else await cofre.abrirConCodigo(n)
      try {
        sessionStorage.removeItem(CLAVE_TRASPASO)
      } catch {
        /* nada */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  useEffect(() => {
    if (auto.current) return
    auto.current = true
    let traido: string | null = null
    try {
      traido = sessionStorage.getItem(CLAVE_TRASPASO)
    } catch {
      traido = null
    }
    if (traido) {
      setCodigo(traido)
      void abrir(traido)
    }
  }, [])

  return (
    <Marco titulo="Abre tu Cofre aquí" lead="Lo tuyo está cifrado. Para verlo en este dispositivo, usa una de estas dos formas:">
      <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--s5) 0', display: 'grid', gap: 'var(--s3)' }}>
        <Punto icono="📱">
          <b>Desde otro dispositivo donde ya lo abriste:</b> entra a Rockie, ve a <b>Tu Cofre › Agregar dispositivo</b> y
          escanea el QR o escribe aquí su código de 12 caracteres.
        </Punto>
        <Punto icono="🗝️">
          <b>Con tu código de recuperación</b> de 24 caracteres.
        </Punto>
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void abrir(codigo)
        }}
      >
        <label className="lbl" htmlFor="cofre-codigo">
          Código
        </label>
        <input
          id="cofre-codigo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
        />
        <button className="btn block" style={{ marginTop: 'var(--s4)' }} disabled={busy || !codigo.trim()}>
          {busy ? 'Abriendo…' : 'Abrir mi Cofre'}
        </button>
        {error && <p className="formerror" role="alert">{error}</p>}
      </form>
      <p className="authfoot">
        <button type="button" className="btn ghost sm" onClick={() => signOut()}>
          <Icon name="logout" className="sm" /> Entrar con otra cuenta
        </button>
      </p>
    </Marco>
  )
}

// ——— la puerta: nada de la app se muestra sin el Cofre abierto ———

export function CofreGate({ uid, cargando, children }: { uid: string; cargando: ReactNode; children: ReactNode }) {
  const estado = useCofre()
  const [codigoNuevo, setCodigoNuevo] = useState<string | null>(null)
  const [, refrescar] = useState(0)

  const qc = useQueryClient()

  useEffect(() => {
    // una vez al día, sella lo que el servidor haya escrito en claro (sin molestar)
    if (estado.fase !== 'abierto' || leer(pendienteGuardar(uid))) return
    const ultimo = Number(leer(ultimoSellado(uid)) ?? 0)
    if (Date.now() - ultimo > 86_400_000) void sellarLoAnterior(uid)
  }, [estado.fase, uid])

  useEffect(() => {
    // Llaves de equipo: entregar las que tengo a quien recién llegó, y recibir las que me entregaron.
    // Lo que se veía con 🔒 se vuelve a pedir en cuanto llega su llave.
    if (estado.fase !== 'abierto') return
    let vivo = true
    const vuelta = async () => {
      const llego = (await usarInvitacionPendiente().catch(() => false)) || (await cofre.revisarSobres().catch(() => false))
      if (vivo && llego) void qc.invalidateQueries()
      await cofre.repartirPendientes().catch(() => 0)
    }
    void vuelta()
    const t = setInterval(vuelta, 60_000)
    const alVolver = () => document.visibilityState === 'visible' && void vuelta()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [estado.fase, qc])

  switch (estado.fase) {
    case 'sin-sesion':
    case 'cargando':
      return <>{cargando}</>
    case 'error':
      return (
        <Marco titulo="No pudimos abrir tu Cofre" lead="Revisa tu conexión e inténtalo otra vez.">
          <p className="hint" style={{ textAlign: 'center' }}>{estado.error}</p>
          <button className="btn block" style={{ marginTop: 'var(--s4)' }} onClick={() => void cofre.iniciar(null).then(() => cofre.iniciar(uid))}>
            Reintentar
          </button>
        </Marco>
      )
    case 'nuevo':
      return (
        <CrearCofre
          onCreado={(c) => {
            escribir(pendienteGuardar(uid), '1')
            setCodigoNuevo(c)
          }}
        />
      )
    case 'bloqueado':
      return <AbrirCofre />
    case 'abierto':
      if (codigoNuevo || leer(pendienteGuardar(uid))) {
        return (
          <GuardaTuCodigo
            uid={uid}
            codigo={codigoNuevo}
            onListo={() => {
              setCodigoNuevo(null)
              refrescar((n) => n + 1)
            }}
          />
        )
      }
      return <>{children}</>
  }
}

// ——— /cofre: agregar dispositivos, cambiar el código, olvidar este dispositivo ———

function AgregarDispositivo() {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [qr, setQr] = useState('')
  const [hasta, setHasta] = useState(0)
  const [ahora, setAhora] = useState(Date.now())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!codigo) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [codigo])

  useEffect(() => {
    if (codigo && ahora > hasta) {
      setCodigo(null)
      setQr('')
    }
  }, [ahora, hasta, codigo])

  async function preparar() {
    setBusy(true)
    setError('')
    try {
      const c = await cofre.prepararTraspaso()
      // el código va después del # : el navegador nunca lo manda al servidor
      const enlace = `${window.location.origin}/cofre#traspaso=${c}`
      const { default: QRCode } = await import('qrcode')
      setQr(await QRCode.toDataURL(enlace, { margin: 1, width: 220 }))
      setCodigo(c)
      setHasta(Date.now() + 15 * 60_000)
      setAhora(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function cancelar() {
    await cofre.cancelarTraspaso()
    setCodigo(null)
    setQr('')
  }

  if (!codigo) {
    return (
      <>
        <p className="hint" style={{ lineHeight: 1.5 }}>
          Para abrir tu Cofre en otro celular o computadora, entra ahí a Rockie con tu cuenta y usa el código o el QR que
          te damos aquí. Dura 15 minutos y sirve una sola vez.
        </p>
        <button className="btn block" style={{ marginTop: 'var(--s3)' }} onClick={preparar} disabled={busy}>
          {busy ? 'Preparando…' : 'Agregar dispositivo'}
        </button>
        {error && <p className="formerror" role="alert">{error}</p>}
      </>
    )
  }
  const resta = Math.max(0, Math.ceil((hasta - ahora) / 1000))
  return (
    <div style={{ display: 'grid', gap: 'var(--s3)', justifyItems: 'center' }}>
      {qr && <img src={qr} alt="QR para abrir tu Cofre en otro dispositivo" width={220} height={220} style={{ borderRadius: 'var(--r-md)', background: '#fff' }} />}
      <div style={{ width: '100%' }}>
        <CodigoGrande codigo={codigo} />
      </div>
      <p className="hint" style={{ textAlign: 'center' }}>
        Escanéalo con la cámara del otro dispositivo o escribe el código ahí. Vence en {Math.floor(resta / 60)}:
        {String(resta % 60).padStart(2, '0')}.
      </p>
      <button className="btn ghost sm" onClick={cancelar}>Cancelar</button>
    </div>
  )
}

function CambiarCodigo() {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function cambiar() {
    if (!window.confirm('¿Crear un código de recuperación nuevo? El anterior dejará de servir.')) return
    setBusy(true)
    setError('')
    try {
      setCodigo(await cofre.nuevoCodigoRecuperacion())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  if (codigo) {
    return (
      <>
        <CodigoGrande codigo={codigo} />
        <p className="hint" style={{ marginTop: 'var(--s3)', lineHeight: 1.5 }}>
          Guárdalo fuera de este dispositivo. El código anterior ya no abre tu Cofre.
        </p>
      </>
    )
  }
  return (
    <>
      <p className="hint" style={{ lineHeight: 1.5 }}>
        ¿Perdiste tu código o crees que alguien lo vio? Crea uno nuevo; el anterior dejará de funcionar.
      </p>
      <button className="btn ghost block" style={{ marginTop: 'var(--s3)' }} onClick={cambiar} disabled={busy}>
        Nuevo código de recuperación
      </button>
      {error && <p className="formerror" role="alert">{error}</p>}
    </>
  )
}

export default function CofrePage() {
  const nav = useNavigate()
  const estado = useCofre()
  return (
    <main className="authwrap" style={{ alignItems: 'start' }}>
      <div style={{ width: 'min(520px, 100%)', display: 'grid', gap: 'var(--s4)' }}>
        <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => (history.length > 1 ? nav(-1) : nav('/inicio'))}>
          ← Volver
        </button>
        <section className="card pad">
          <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
            <Icon name="lock" size={28} />
            <div>
              <h2 style={{ margin: 0 }}>Tu Cofre</h2>
              <p className="hint" style={{ margin: 0 }}>
                {estado.fase === 'abierto' ? 'Abierto en este dispositivo' : 'Cerrado en este dispositivo'}
              </p>
            </div>
          </div>
          <p style={{ marginTop: 'var(--s4)', color: 'var(--ink-soft)', fontSize: 'var(--t-s)', lineHeight: 1.5 }}>
            Lo que guardas se cifra aquí antes de salir. En el servidor solo queda texto ilegible: nadie de Rockie puede
            leerlo. Lo que tú decides mandar a un servicio externo (Google Calendar, Claude o la IA de Rockie) sale del
            Cofre solo en ese momento.
          </p>
        </section>
        <section className="card pad">
          <div className="sectionh"><h2>Otro dispositivo</h2></div>
          <AgregarDispositivo />
        </section>
        <section className="card pad">
          <div className="sectionh"><h2>Código de recuperación</h2></div>
          <CambiarCodigo />
        </section>
        <section className="card pad">
          <div className="sectionh"><h2>Este dispositivo</h2></div>
          <p className="hint" style={{ lineHeight: 1.5 }}>
            ¿Es una computadora prestada? Borra la llave de aquí. Tus datos siguen a salvo en tu Cofre.
          </p>
          <button
            className="btn danger block"
            style={{ marginTop: 'var(--s3)' }}
            onClick={async () => {
              if (!window.confirm('¿Olvidar la llave en este dispositivo? Para volver a abrir tu Cofre aquí necesitarás otro dispositivo o tu código.')) return
              await cofre.olvidarDispositivo()
              await signOut()
            }}
          >
            Olvidar este dispositivo y salir
          </button>
        </section>
      </div>
    </main>
  )
}

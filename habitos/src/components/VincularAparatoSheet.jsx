// ============================================================================
// VINCULAR APARATO — "iniciar sesion" en el Rockie sin teclear nada en el.
//
// El aparato NO tiene login, y es deliberado: su pantalla es un tactil
// resistivo de 3.5" (un teclado da teclas de ~32 px, imposible escribir una
// clave) y su flash se vuelca por UART en minutos, asi que cualquier
// credencial guardada alli seria publica.
//
// En su lugar el aparato ensena un codigo de 6 letras y lo reclamamos desde
// aqui, donde la sesion YA existe. La sesion nunca sale del movil.
// ============================================================================
import { useState } from 'react'
import BottomSheet from './BottomSheet.jsx'
import QRScanner from './QRScanner.jsx'
import { useDevices, vincularAparato, desvincularAparato, extraerCodigoAparato } from '../data/devices.js'

export default function VincularAparatoSheet({ open, onClose }) {
  const { devices, refrescar } = useDevices()
  const [code, setCode] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [escaneando, setEscaneando] = useState(false)

  // El QR del aparato lleva bplus://aparato/ABC123. Escanear = vincular
  // directo: es el camino sin teclear nada, que es la gracia del asunto.
  const alEscanear = async (texto) => {
    setEscaneando(false)
    setError(null)
    if (String(texto).includes('://vincular/')) {
      setError('Ese QR es del MODO NINO. Se vincula en Ajustes > Control parental, no aqui.')
      return
    }
    const leido = extraerCodigoAparato(texto)
    if (!leido) {
      setError(`No pude leer un codigo en ese QR (${String(texto).slice(0, 32) || 'vacio'}). Usa el de 6 letras a mano.`)
      return
    }
    setCode(leido)
    setEnviando(true)
    const r = await vincularAparato(leido, nombre)
    setEnviando(false)
    if (r.ok) {
      setOk(true); setCode(''); setNombre('')
      await refrescar()
      setTimeout(() => setOk(false), 2500)
    } else {
      setError(`No encuentro el Rockie "${leido}". Si ya lo vinculaste a mano, ese codigo ya no sirve: genera uno nuevo en el aparato o desvincula primero.`)
    }
  }

  const vincular = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    const r = await vincularAparato(code, nombre)
    setEnviando(false)
    if (r.ok) {
      setOk(true); setCode(''); setNombre('')
      await refrescar()
      setTimeout(() => setOk(false), 2500)
    } else {
      setError('No encuentro un Rockie con ese codigo. Si el aparato dice "Sin conexion con el servidor", primero necesita WiFi para anunciarse a la nube.')
    }
  }

  const quitar = async (id) => {
    await desvincularAparato(id)
    await refrescar()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Vincular aparato">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--ink-soft)' }}>
          Enciende tu Rockie Companion y elige <strong>&quot;Es mio&quot;</strong>. Te mostrara
          un codigo de 6 letras: escribelo aqui y el aparato pasara a ensenar
          <strong> tus habitos de verdad</strong>.
        </p>

        <button
          type="button"
          onClick={() => setEscaneando(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'var(--space-2)', padding: 'var(--space-3)',
            borderRadius: 'var(--radius)', border: 'none', background: 'var(--brand)',
            color: '#fff', fontWeight: 800, fontSize: 'var(--text-base)', cursor: 'pointer',
          }}
        >
          <i className="ti ti-qrcode" style={{ fontSize: 20 }} />
          Escanear el QR del Rockie
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', fontWeight: 700 }}>O A MANO</span>
          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        </div>

        <form onSubmit={vincular} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input
            value={code}
            onChange={(e) => {
              // Acepta codigo pelado o link del QR (bplus://aparato/ABC123)
              const raw = e.target.value
              const extracted = extraerCodigoAparato(raw)
              if (extracted && raw.length > 6) setCode(extracted)
              else setCode(raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
            }}
            placeholder="CODIGO"
            maxLength={40}
            autoCapitalize="characters"
            style={{
              width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius)',
              border: '2px solid var(--line)', background: 'var(--surface)',
              color: 'var(--ink)', textAlign: 'center', letterSpacing: '0.2em',
              fontWeight: 800, fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)',
              textTransform: 'uppercase',
            }}
          />
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del aparato (opcional)"
            maxLength={24}
            style={{
              width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius)',
              border: '2px solid var(--line)', background: 'var(--surface)',
              color: 'var(--ink)', fontSize: 'var(--text-base)',
            }}
          />

          {error && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--coral)' }}>{error}</p>
          )}
          {ok && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--green-photo)', fontWeight: 700 }}>
              Vinculado. El Rockie lo detecta en unos segundos.
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || code.length < 6}
            style={{
              padding: 'var(--space-3)', borderRadius: 'var(--radius)', border: 'none',
              background: code.length < 6 ? 'var(--ink-faint)' : 'var(--brand)',
              color: '#fff', fontWeight: 800, fontSize: 'var(--text-base)',
              cursor: code.length < 6 ? 'default' : 'pointer',
            }}
          >
            {enviando ? 'Vinculando...' : 'Vincular'}
          </button>
        </form>

        {devices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
              Mis aparatos
            </span>
            {devices.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 'var(--space-3)', padding: 'var(--space-3)',
                background: 'var(--surface)', borderRadius: 'var(--radius)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <i className="ti ti-device-ipad-horizontal" style={{ color: 'var(--brand)', fontSize: 20 }} />
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--ink)' }}>
                    {d.name || 'Mi Rockie'}
                  </span>
                </span>
                <button
                  onClick={() => quitar(d.id)}
                  style={{
                    border: 'none', background: 'transparent', color: 'var(--coral)',
                    fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Desvincular
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <QRScanner open={escaneando} onScan={alEscanear} onClose={() => setEscaneando(false)} />
    </BottomSheet>
  )
}

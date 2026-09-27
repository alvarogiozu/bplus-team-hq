// MODO NINO — arranque, emparejamiento y zona de padres.
//
// La tesis de producto: el aparato como alternativa al primer celular. El nino
// libera dopamina cumpliendo metas reales (no scrolleando), y el padre, desde
// SU app de B+, decide tareas y premios. El aparato es del nino; el mando, del
// padre.
//
// Tres piezas en este archivo:
//   <SelectorModo>  primer arranque: ¿de quien es este Rockie?
//   <Emparejar>     modo nino sin vincular: QR + codigo para la app del padre
//   <ZonaPadres>    candado PIN para salir del modo nino / desvincular
//
// El QR lo genera la lib `qrcode` (ya es dependencia de la app) con import()
// dinamico: el chunk del aparato no paga la lib hasta llegar a esta pantalla.

import { useEffect, useState } from 'react'
import { useFamily, generarCodigo, verificarPin, desvincular } from '../../data/family.js'
import { Screen } from '../ui/Screen.jsx'
import { Tap } from '../ui/Tap.jsx'

// ============================================================================
// Selector de arranque
// ============================================================================
export function SelectorModo({ onElegir }) {
  return (
    <div
      className="bp-fade"
      style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--dev-gutter)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-2)' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-title)', fontWeight: 700, color: 'var(--title)' }}>
          ¿De quien es<br />este Rockie?
        </h1>
      </div>

      <Tap full size="lg" icon="ti-user" onClick={() => onElegir('usuario')}>
        Es mio
      </Tap>
      <Tap
        full size="lg" icon="ti-mood-kid"
        tone="var(--berry)" edge="var(--berry-edge)"
        onClick={() => onElegir('nino')}
      >
        Es para mi hijo/a
      </Tap>

      <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', lineHeight: 1.5 }}>
        El modo nino se controla desde la app de B+<br />del padre o la madre. Se puede cambiar despues.
      </p>
    </div>
  )
}

// ============================================================================
// Emparejamiento: el aparato ensena QR + codigo; el padre vincula desde su app
// ============================================================================
export function Emparejar({ onCancelar }) {
  const fam = useFamily()
  const [codigo, setCodigo] = useState(null)
  const [qr, setQr] = useState(null)

  // Generar (o reutilizar) el codigo al montar; el QR llega despues (lazy)
  useEffect(() => {
    const c = generarCodigo()
    setCodigo(c)
    let vivo = true
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(`bplus://vincular/${c}`, { width: 288, margin: 1, color: { dark: '#575279', light: '#fdfbf7' } })
    ).then(url => { if (vivo) setQr(url) }).catch(() => { /* sin QR: el codigo basta */ })
    return () => { vivo = false }
  }, [])

  // El padre completo la vinculacion en su app -> DeviceApp re-renderiza solo
  // (useFamily), pero dejamos este efecto de cortesia por claridad.
  if (fam.paired) return null

  return (
    <Screen title="Vincular" onBack={onCancelar} gap="var(--space-3)">
      <p style={{ margin: 0, fontSize: 'var(--dev-body)', lineHeight: 1.45, textAlign: 'center' }}>
        En la app de B+ del padre o la madre:
        <br />
        <strong>Ajustes → Control parental</strong>
      </p>

      {/* QR y codigo SIEMPRE juntos: si el QR no escanea (reflejo, camara
          rayada), el codigo de 6 letras se teclea a mano. Sin O/0 ni I/1. */}
      <div style={{ display: 'grid', placeItems: 'center' }}>
        {qr ? (
          <img src={qr} alt="Codigo QR de vinculacion" width={144} height={144} style={{ borderRadius: 12, boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)' }} />
        ) : (
          <div style={{ width: 144, height: 144, borderRadius: 12, background: 'var(--dev-surface)', display: 'grid', placeItems: 'center', color: 'var(--dev-ink-soft)' }}>
            <i className="ti ti-qrcode" style={{ fontSize: 44 }} />
          </div>
        )}
      </div>

      <div
        style={{
          textAlign: 'center', padding: 'var(--space-3)',
          background: 'var(--dev-surface)', borderRadius: 'var(--dev-r)',
          boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
        }}
      >
        <div style={{ fontSize: 'var(--dev-micro)', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--dev-ink-soft)', textTransform: 'uppercase' }}>
          O escribe este codigo
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-display)', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--brand)' }}>
          {codigo || '······'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--dev-ink-soft)', fontSize: 'var(--dev-micro)', fontWeight: 700 }}>
        <span className="bp-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--olive)' }} />
        Esperando a la app...
      </div>
    </Screen>
  )
}

// ============================================================================
// Zona de padres: candado PIN (salir del modo nino / desvincular)
// ============================================================================
export function ZonaPadres({ onBack, onCambiarModo }) {
  const fam = useFamily()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(false)

  const tecla = (d) => {
    if (abierto) return
    setError(null)
    const n = (pin + d).slice(0, 4)
    setPin(n)
    if (n.length === 4) {
      const r = verificarPin(n)
      if (r.ok) { setAbierto(true); return }
      setPin('')
      setError(
        r.error === 'bloqueado'
          ? `Demasiados intentos. Espera ${r.segundos}s`
          : `PIN incorrecto (${r.quedan} intento${r.quedan === 1 ? '' : 's'} mas)`
      )
    }
  }

  if (abierto) {
    return (
      <Screen title="Zona de padres" onBack={onBack} gap="var(--space-3)">
        <p style={{ margin: 0, fontSize: 'var(--dev-body)', lineHeight: 1.45 }}>
          Este Rockie es de <strong>{fam.child?.name || 'tu hijo/a'}</strong>.
          Las tareas y premios se administran desde tu app de B+
          (Ajustes → Control parental).
        </p>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Tap full variant="soft" icon="ti-user" onClick={() => onCambiarModo('usuario')}>
            Cambiar a modo usuario
          </Tap>
          <Tap
            full variant="soft" icon="ti-unlink"
            onClick={() => { desvincular(); onCambiarModo(null) }}
            style={{ color: 'var(--coral)' }}
          >
            Desvincular aparato
          </Tap>
          <p style={{ margin: 0, fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', textAlign: 'center', lineHeight: 1.4 }}>
            Desvincular NO borra las monedas ni el Rockie de {fam.child?.name || 'tu hijo/a'}.
            Borrar datos se hace desde la app.
          </p>
        </div>
      </Screen>
    )
  }

  // Teclado PIN: 12 teclas de 64px+. Numeros en cuadricula 3x4: el unico
  // "teclado" que SI funciona en resistivo, porque cada tecla es enorme.
  return (
    <Screen title="Zona de padres" onBack={onBack} gap="var(--space-2)" scroll={false}>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--dev-body)', color: 'var(--dev-ink-soft)' }}>
        PIN de 4 numeros
      </p>

      {/* Puntos del PIN */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', minHeight: 22 }}>
        {[0, 1, 2, 3].map(i => (
          <span
            key={i}
            style={{
              width: 16, height: 16, borderRadius: '50%',
              background: i < pin.length ? 'var(--brand)' : 'var(--dev-line)',
            }}
          />
        ))}
      </div>

      {error && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--dev-micro)', fontWeight: 800, color: 'var(--coral)' }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
          <TeclaPin key={d} onClick={() => tecla(String(d))}>{d}</TeclaPin>
        ))}
        <span />
        <TeclaPin onClick={() => tecla('0')}>0</TeclaPin>
        <TeclaPin onClick={() => { setPin(p => p.slice(0, -1)); setError(null) }}>
          <i className="ti ti-backspace" style={{ fontSize: 24 }} />
        </TeclaPin>
      </div>
    </Screen>
  )
}

function TeclaPin({ children, onClick }) {
  return (
    <button
      type="button"
      className="bp-tap"
      onClick={onClick}
      style={{
        height: 60,
        borderRadius: 'var(--dev-r)',
        background: 'var(--dev-surface)',
        boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
        fontSize: 'var(--dev-emph)', fontWeight: 800, color: 'var(--dev-ink)',
        display: 'grid', placeItems: 'center',
      }}
    >
      {children}
    </button>
  )
}

// Acciones de invitacion de grupo: compartir nativo (SO) + copiar enlace/codigo.
// Share sheet = WhatsApp/Instagram/etc. sin copiar a mano (navigator.share).
// El codigo se pega en Juntos → "Unirme con codigo" (no hay deep-link de grupo aun).
// Ambos botones usan .gbtn (canto 2.5D + hundimiento al pulsar).

export function grupoInviteUrl(code) {
  if (typeof location === 'undefined') return ''
  return `${location.origin}/invita/${code}`
}

export function grupoInviteText(name, code) {
  const url = grupoInviteUrl(code)
  return `Unete a "${name || 'mi grupo'}" en B+\n\nEntra directo con este enlace:\n${url}\n\n(O pega el codigo ${code} en la app)`
}

/** Abre la hoja nativa de compartir; si no hay API, copia y avisa. */
export async function compartirGrupoInvite({ name, code, flash }) {
  if (!code) return
  const url = grupoInviteUrl(code)
  const text = grupoInviteText(name, code)
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({
        title: `Unete a ${name || 'mi grupo'} en B+`,
        text: `Unete a "${name || 'mi grupo'}" en B+. Codigo: ${code}`,
        url,
      })
      return
    }
  } catch (e) {
    // AbortError = el usuario cerro el sheet; no es fallo
    if (e?.name === 'AbortError') return
  }
  try {
    await navigator.clipboard?.writeText(text)
    flash?.('Invitacion copiada 📋 Pegala en WhatsApp o donde quieras')
  } catch {
    flash?.(`Codigo: ${code}`)
  }
}

export async function copiarGrupoInvite({ name, code, flash }) {
  if (!code) return
  const text = grupoInviteText(name, code)
  try {
    await navigator.clipboard?.writeText(text)
    flash?.(`Codigo ${code} copiado 📋`)
  } catch {
    flash?.(`Codigo: ${code}`)
  }
}

/** Par de botones: Compartir (olive) + Enlace/codigo (azure 2.5D). */
export default function GrupoInviteActions({ name, code, flash, dense = false }) {
  if (!code) return null
  const pad = dense ? 'var(--space-2)' : 'var(--space-3)'
  const fs = dense ? 'var(--text-2xs)' : 'var(--text-xs)'

  return (
    <div style={{
      display: 'flex', gap: 'var(--space-2)',
      width: '100%', boxSizing: 'border-box',
    }}>
      <button
        type="button"
        className="q gbtn"
        onClick={() => compartirGrupoInvite({ name, code, flash })}
        style={{
          flex: 1.15, minHeight: 'var(--tap-min)', cursor: 'pointer',
          borderRadius: 'var(--r-pill)', padding: `${pad} var(--space-3)`,
          background: 'var(--olive)', color: '#fff',
          '--edge': 'var(--olive-edge)',
          fontWeight: 700, fontSize: fs,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <i className="ti ti-share" aria-hidden="true" />
        {dense ? 'Compartir' : 'Compartir a contactos'}
      </button>
      <button
        type="button"
        className="q gbtn"
        onClick={() => copiarGrupoInvite({ name, code, flash })}
        aria-label={`Copiar codigo ${code}`}
        style={{
          flex: dense ? 1 : 0.95, minHeight: 'var(--tap-min)', cursor: 'pointer',
          borderRadius: 'var(--r-pill)', padding: `${pad} var(--space-3)`,
          // Fondo de tarjeta (no pastel) + borde entrecortado azure + canto 2.5D
          background: 'var(--card)', color: 'var(--azure)',
          border: '2px dashed var(--azure)',
          '--edge': 'var(--azure-edge)',
          fontWeight: 700, fontSize: fs,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <i className="ti ti-copy" aria-hidden="true" />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: dense ? 'flex-start' : 'center', lineHeight: 1.15 }}>
          <span>{dense ? 'Enlace' : 'Enlace de invitacion'}</span>
          <span style={{ fontSize: 'var(--text-3xs)', letterSpacing: 1, opacity: 0.9, fontWeight: 800 }}>{code}</span>
        </span>
      </button>
    </div>
  )
}

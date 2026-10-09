import { useEffect, useState } from 'react'
import CenterModal from './CenterModal.jsx'
import { alPedirLimite } from '../../../src/lib/limites'
import { TEXTOS } from '../../../src/lib/limitesTextos'
import { irAPlanes, limitePlan } from '../lib/planHq.js'
import { esAppNativa, plataformaNativa, TEXTO_PLAN_NATIVO } from '../../../src/lib/appNativa'

// en la app de Android/iPhone no se ofrece comprar (src/lib/appNativa): en Android, solo el texto sin enlace
const NATIVA = esAppNativa()
const MEJORA_NATIVA = plataformaNativa() === 'android' ? TEXTO_PLAN_NATIVO : null

// La hoja de «llegaste al límite de tu plan» en Hábitos: los mismos textos que en el resto de Rockie
// (src/lib/limitesTextos.ts), con el lenguaje visual de Hábitos (como ConfirmModal). Nunca castiga: lo que ya
// tienes sigue igual; solo explica y ofrece Plus. La abre abrirLimite() desde el store.
export default function LimitePlanSheet() {
  const [clave, setClave] = useState(null)
  useEffect(() => alPedirLimite(setClave), [])
  const t = clave ? TEXTOS[clave] : null
  const n = clave ? (limitePlan(clave) ?? 0) : 0
  const cerrar = () => setClave(null)

  return (
    <CenterModal open={Boolean(t)} onClose={cerrar} title={t ? t.titulo(n) : ''}>
      {t && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--amber-soft)', color: 'var(--amber)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
            }}>
              <i className="ti ti-sparkles" />
            </span>
            <div className="q" style={{ fontSize: 'var(--text-base)', color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.5 }}>
              {t.cuerpo(n)}
            </div>
            {(!NATIVA || MEJORA_NATIVA) && <div className="q" style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)',
              borderRadius: 'var(--r-md)', background: 'var(--amber-soft)', boxShadow: '0 3px 0 var(--amber-edge)',
              color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--text-sm)',
            }}>
              {NATIVA ? MEJORA_NATIVA : <><i className="ti ti-star" style={{ color: 'var(--amber)' }} /> {t.mejora}</>}
            </div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!NATIVA && <button
              type="button"
              className="q gbtn"
              onClick={() => { cerrar(); irAPlanes() }}
              style={{
                minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
                background: 'var(--amber)', color: '#fff', '--edge': 'var(--amber-edge)',
                fontWeight: 700, fontSize: 'var(--text-sm)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
              }}
            >
              <i className="ti ti-sparkles" /> Ver planes
            </button>}
            <button
              type="button"
              className="q"
              onClick={cerrar}
              style={{
                minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
                background: 'var(--card)', color: 'var(--ink-soft)',
                border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
                fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
              }}
            >
              {NATIVA ? 'Entendido' : 'Ahora no'}
            </button>
          </div>
        </>
      )}
    </CenterModal>
  )
}

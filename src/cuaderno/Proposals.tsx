import { useState } from 'react'
import { motion } from 'motion/react'
import { describe, type Look } from './agent'
import type { Proposal } from './data'
import { CIcon } from './icons'

/**
 * Las tarjetas de Rockie: cada una se acepta (✓) o se descarta (✕).
 * Aceptar hace el cambio al instante y el toast trae "Deshacer"; descartar se recupera aquí mismo.
 */
export function ProposalList(p: {
  list: Proposal[]
  look: Look
  onAccept: (i: number, el: HTMLElement) => Promise<void> | void
  onSkip: (i: number) => void
  onRestore: (i: number) => void
  onAcceptAll?: (el: HTMLElement) => Promise<void> | void
}) {
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const pending = p.list.filter((x) => (x.st ?? 'pending') === 'pending').length
  const run = async (key: number | 'all', f: () => Promise<void> | void) => {
    if (busy !== null) return
    setBusy(key)
    try {
      await f()
    } finally {
      setBusy(null)
    }
  }
  if (!p.list.length) return null
  return (
    <motion.div
      className="cu-props"
      initial="hide"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.07 } } }}
    >
      {p.list.map((x, i) => {
        const c = describe(x, p.list, p.look)
        const st = x.st ?? 'pending'
        return (
          <motion.div
            key={i}
            layout
            className={`cu-prop ${st} t-${x.tool}`}
            variants={{ hide: { opacity: 0, y: 12, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } }}
            transition={{ type: 'spring', stiffness: 480, damping: 32 }}
          >
            <span className="cu-prop-ico">
              <CIcon name={st === 'done' ? 'check' : c.icon} size={17} />
            </span>
            <span className="cu-prop-txt">
              <small>{c.detail}</small>
              <b>{c.title}</b>
              {c.preview && <span className="cu-prop-pre">{c.preview}</span>}
              {c.chips && (
                <span className="cu-prop-chips">
                  {c.chips.map((t) => (
                    <em key={t}>
                      <CIcon name="cards" size={13} /> {t}
                    </em>
                  ))}
                </span>
              )}
            </span>
            {st === 'pending' ? (
              <span className="cu-prop-acts">
                <button
                  className="cu-ok"
                  disabled={busy !== null}
                  aria-label={`Aceptar: ${c.title}`}
                  onClick={(e) => {
                    const el = e.currentTarget
                    void run(i, () => p.onAccept(i, el))
                  }}
                >
                  <CIcon name="check" size={17} strokeWidth={2.4} />
                </button>
                <button
                  className="cu-no"
                  disabled={busy !== null}
                  aria-label={`Descartar: ${c.title}`}
                  onClick={() => p.onSkip(i)}
                >
                  <CIcon name="close" size={16} />
                </button>
              </span>
            ) : st === 'done' ? (
              <span className="cu-prop-st">Guardado</span>
            ) : (
              <button className="cu-prop-restore" onClick={() => p.onRestore(i)}>
                Descartada · <u>recuperar</u>
              </button>
            )}
          </motion.div>
        )
      })}
      {pending > 1 && p.onAcceptAll && (
        <button
          className="btn sm cu-all"
          disabled={busy !== null}
          onClick={(e) => {
            const el = e.currentTarget
            void run('all', () => p.onAcceptAll!(el))
          }}
        >
          <CIcon name="check" size={16} /> Aceptar todo ({pending})
        </button>
      )}
    </motion.div>
  )
}

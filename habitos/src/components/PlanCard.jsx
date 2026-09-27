import { motion } from 'framer-motion'
import { BILLING_PERIODS } from '../data/plans.js'

export default function PlanCard({
  plan,
  period = BILLING_PERIODS.MONTHLY,
  isCurrent = false,
  onSelect,
  loading = false,
}) {
  const isFree = plan.id === 'free'
  const isPro = plan.id === 'pro'
  const price = period === BILLING_PERIODS.ANNUAL ? plan.price.annual : plan.price.monthly
  const priceDisplay = isFree ? 'Gratis' : `$${price.toFixed(2)}`
  const periodText = isFree
    ? 'para siempre'
    : period === BILLING_PERIODS.ANNUAL
    ? '/ año'
    : '/ mes'

  const borderStyle = isPro
    ? '2px solid var(--amber)'
    : isCurrent
    ? '2px solid var(--olive)'
    : '1px solid var(--card-line)'

  const glowShadow = isPro
    ? '0 4px 0 var(--amber-edge), 0 8px 24px -6px rgba(234, 157, 52, 0.18)'
    : '0 3px 0 var(--card-edge)'

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'relative',
        background: isPro ? 'linear-gradient(180deg, var(--card) 0%, var(--amber-soft) 180%)' : 'var(--card)',
        borderRadius: 'var(--r-xl)',
        padding: 'var(--space-5)',
        border: borderStyle,
        boxShadow: glowShadow,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        overflow: 'hidden',
      }}
    >
      {/* Badge superior */}
      {plan.badge && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: isPro ? 'var(--amber)' : 'var(--coral)',
            color: '#fff',
            fontSize: 'var(--text-xs)',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: 'var(--r-full)',
            boxShadow: '0 2px 0 rgba(0,0,0,0.15)',
          }}
        >
          {plan.badge}
        </div>
      )}

      {/* Header del plan */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h3
            className="serif"
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 800,
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            {plan.name}
          </h3>
          {isCurrent && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                background: 'var(--olive-soft)',
                color: 'var(--olive)',
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
              }}
            >
              Plan actual
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-muted)',
            marginTop: 'var(--space-1)',
            marginBottom: 0,
            lineHeight: 1.4,
          }}
        >
          {plan.tagline}
        </p>
      </div>

      {/* Precio */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
        <span
          className="serif"
          style={{
            fontSize: 32,
            fontWeight: 900,
            color: isPro ? 'var(--amber)' : 'var(--ink)',
            letterSpacing: '-0.02em',
          }}
        >
          {priceDisplay}
        </span>
        <span
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-muted)',
            fontWeight: 500,
          }}
        >
          {periodText}
        </span>
        {period === BILLING_PERIODS.ANNUAL && !isFree && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--olive)',
              background: 'var(--olive-soft)',
              padding: '2px 6px',
              borderRadius: 'var(--r-sm)',
            }}
          >
            -20% ahorro
          </span>
        )}
      </div>

      {/* Separador sutil */}
      <div style={{ height: 1, background: 'var(--card-line)', margin: 'var(--space-1) 0' }} />

      {/* Lista de features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {plan.features.map((feat, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: feat.included ? 'var(--ink)' : 'var(--ink-faint)',
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: feat.included ? (isPro ? 'var(--amber-soft)' : 'var(--olive-soft)') : 'var(--paper-alt)',
                color: feat.included ? (isPro ? 'var(--amber)' : 'var(--olive)') : 'var(--ink-faint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              <i className={`ti ti-${feat.included ? 'check' : 'minus'}`} />
            </span>
            <span style={{ textDecoration: feat.included ? 'none' : 'line-through' }}>
              {feat.text}
            </span>
          </div>
        ))}
      </div>

      {/* Boton de accion */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={isCurrent || loading}
        onClick={() => onSelect(plan)}
        className="gbtn q"
        style={{
          marginTop: 'var(--space-2)',
          width: '100%',
          minHeight: 'var(--tap-min)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--r-md)',
          fontWeight: 800,
          fontSize: 'var(--text-base)',
          cursor: isCurrent ? 'default' : 'pointer',
          background: isCurrent
            ? 'var(--paper-alt)'
            : isPro
            ? 'var(--amber)'
            : 'var(--paper)',
          color: isCurrent
            ? 'var(--ink-muted)'
            : isPro
            ? '#fff'
            : 'var(--ink)',
          border: isCurrent
            ? 'none'
            : isPro
            ? 'none'
            : '1px solid var(--card-line)',
          boxShadow: isCurrent
            ? 'none'
            : isPro
            ? '0 3px 0 var(--amber-edge)'
            : '0 3px 0 var(--edge-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
        }}
      >
        {isCurrent ? (
          <>
            <i className="ti ti-check" /> Tu plan actual
          </>
        ) : isFree ? (
          'Continuar con Inicial'
        ) : (
          <>
            <i className="ti ti-sparkles" /> Obtener {plan.name}
          </>
        )}
      </motion.button>
    </motion.div>
  )
}

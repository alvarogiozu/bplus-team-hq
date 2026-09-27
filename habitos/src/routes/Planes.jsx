import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { PLANS, BILLING_PERIODS, PLAN_FAQS } from '../data/plans.js'
import PlanCard from '../components/PlanCard.jsx'
import CheckoutSheet from '../components/CheckoutSheet.jsx'
import { estaActivo } from '../lib/culqi.js'
import { playSfx } from '../lib/sfx.js'

export default function Planes() {
  const navigate = useNavigate()
  const { prefs, setPref, user } = useStore()
  const currentPlanId = prefs?.userPlan || 'free'
  
  const [period, setPeriod] = useState(BILLING_PERIODS.MONTHLY)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  const activo = estaActivo()

  const handleSelectPlan = (plan) => {
    playSfx('tap')
    if (plan.id === 'free') {
      if (setPref) setPref('userPlan', 'free')
      return
    }
    setSelectedPlan(plan)
    setCheckoutOpen(true)
  }

  const handleSuccess = (plan, billingPeriod) => {
    if (setPref) setPref('userPlan', plan.id)
  }

  return (
    <div
      className="planes-screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: '100%',
        background: 'var(--paper)',
        padding: 'var(--space-4) var(--screen-x)',
        paddingBottom: 'calc(var(--space-8) + var(--safe-b, 0px))',
        gap: 'var(--space-5)',
        overflowY: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Header superior con boton volver */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={() => { playSfx('tap'); navigate(-1) }}
          className="q"
          aria-label="Volver"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--card)',
            border: '1px solid var(--card-line)',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--text-lg)',
            cursor: 'pointer',
            boxShadow: '0 2px 0 var(--edge-soft)',
          }}
        >
          <i className="ti ti-arrow-left" />
        </button>

        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--amber)',
            }}
          >
            B+ Suscripciones
          </span>
          <h1
            className="serif"
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 900,
              color: 'var(--ink)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Planes y Mejoras
          </h1>
        </div>

        <div style={{ width: 40 }} /> {/* Spacer */}
      </div>

      {/* Hero explicativo */}
      <div style={{ textAlign: 'center', maxWidth: 340, margin: '0 auto' }}>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-muted)',
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          Lleva tu racha y a tu Rockie al maximo nivel. Sin comisiones de app stores gracias a nuestro checkout web directo.
        </p>
      </div>

      {/* Switch Mensual / Anual */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-1)',
          background: 'var(--card)',
          padding: 4,
          borderRadius: 'var(--r-full)',
          border: '1px solid var(--card-line)',
          maxWidth: 280,
          margin: '0 auto',
          boxShadow: '0 2px 0 var(--edge-soft)',
        }}
      >
        <button
          type="button"
          onClick={() => { playSfx('tap'); setPeriod(BILLING_PERIODS.MONTHLY) }}
          style={{
            flex: 1,
            padding: '8px 14px',
            borderRadius: 'var(--r-full)',
            border: 'none',
            background: period === BILLING_PERIODS.MONTHLY ? 'var(--amber)' : 'transparent',
            color: period === BILLING_PERIODS.MONTHLY ? '#fff' : 'var(--ink-muted)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Mensual
        </button>
        <button
          type="button"
          onClick={() => { playSfx('tap'); setPeriod(BILLING_PERIODS.ANNUAL) }}
          style={{
            flex: 1,
            padding: '8px 14px',
            borderRadius: 'var(--r-full)',
            border: 'none',
            background: period === BILLING_PERIODS.ANNUAL ? 'var(--amber)' : 'transparent',
            color: period === BILLING_PERIODS.ANNUAL ? '#fff' : 'var(--ink-muted)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <span>Anual</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              background: period === BILLING_PERIODS.ANNUAL ? 'rgba(0,0,0,0.2)' : 'var(--olive-soft)',
              color: period === BILLING_PERIODS.ANNUAL ? '#fff' : 'var(--olive)',
              padding: '1px 5px',
              borderRadius: 'var(--r-full)',
            }}
          >
            -20%
          </span>
        </button>
      </div>

      {/* Lista de Planes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            period={period}
            isCurrent={currentPlanId === plan.id}
            onSelect={handleSelectPlan}
          />
        ))}
      </div>

      {/* Preguntas Frecuentes (FAQ) */}
      <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 className="serif" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
          Preguntas Frecuentes
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {PLAN_FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx
            return (
              <div
                key={idx}
                style={{
                  background: 'var(--card)',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--card-line)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => { playSfx('tap'); setOpenFaq(isOpen ? null : idx) }}
                  style={{
                    width: '100%',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'none',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    color: 'var(--ink)',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <span>{faq.q}</span>
                  <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`} style={{ color: 'var(--ink-muted)' }} />
                </button>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    style={{
                      padding: '0 var(--space-4) var(--space-3)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--ink-muted)',
                      lineHeight: 1.45,
                    }}
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer de Seguridad */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-muted)',
          paddingTop: 'var(--space-3)',
          textAlign: 'center',
        }}
      >
        <i className="ti ti-lock" />
        <span>Pagos procesados de forma segura con encriptacion SSL mediante Culqi</span>
      </div>

      {/* Modal / Sheet de Checkout */}
      <CheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        plan={selectedPlan}
        period={period}
        userEmail={user?.email || 'usuario@bplus.app'}
        onSuccess={handleSuccess}
      />
    </div>
  )
}

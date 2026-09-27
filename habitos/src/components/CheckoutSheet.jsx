import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BottomSheet from './BottomSheet.jsx'
import Confetti from './Confetti.jsx'
import { estaActivo, abrirCheckout, validarPago } from '../lib/culqi.js'
import { BILLING_PERIODS } from '../data/plans.js'
import { playSfx } from '../lib/sfx.js'

export default function CheckoutSheet({
  open,
  onClose,
  plan,
  period = BILLING_PERIODS.MONTHLY,
  userEmail = 'tu-email@bplus.app',
  onSuccess,
}) {
  const [step, setStep] = useState('summary') // 'summary' | 'processing' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [showConfetti, setShowConfetti] = useState(false)

  if (!plan) return null

  const isPro = plan.id === 'pro'
  const price = period === BILLING_PERIODS.ANNUAL ? plan.price.annual : plan.price.monthly
  const activo = estaActivo()

  const handleStartCheckout = async () => {
    playSfx('tap')
    setStep('processing')
    setErrorMessage('')

    try {
      if (activo) {
        // Flujo oficial con Culqi Checkout SDK v4
        await abrirCheckout({
          plan,
          periodo: period,
          email: userEmail,
          onToken: async ({ token }) => {
            const res = await validarPago({ token, planId: plan.id, periodo: period, email: userEmail })
            if (res.ok) {
              setStep('success')
              setShowConfetti(true)
              playSfx('fanfare')
              if (onSuccess) onSuccess(plan, period)
            } else {
              setStep('error')
              setErrorMessage(res.error || 'No se pudo procesar la suscripcion')
              playSfx('softFail')
            }
          },
          onError: (err) => {
            setStep('error')
            setErrorMessage(err.user_message || err.message || 'Error al conectar con Culqi')
            playSfx('softFail')
          },
          onClose: () => {
            setStep('summary')
          },
        })
      } else {
        // Flujo Scaffold controlado (a la espera de RUC)
        const res = await validarPago({
          token: 'scaffold_token',
          planId: plan.id,
          periodo: period,
          email: userEmail,
        })
        if (res.ok) {
          setStep('success')
          setShowConfetti(true)
          playSfx('fanfare')
          if (onSuccess) onSuccess(plan, period)
        }
      }
    } catch (err) {
      setStep('error')
      setErrorMessage(err.message || 'Ocurrio un problema inesperado')
      playSfx('softFail')
    }
  }

  const handleClose = () => {
    setStep('summary')
    setShowConfetti(false)
    onClose()
  }

  return (
    <>
      {showConfetti && <Confetti count={35} />}
      <BottomSheet open={open} onClose={handleClose} title={step === 'success' ? '¡Bienvenido a Pro!' : 'Suscripción B+'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
          <AnimatePresence mode="wait">
            {step === 'summary' && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
              >
                {/* Resumen del plan */}
                <div
                  style={{
                    background: 'var(--paper)',
                    borderRadius: 'var(--r-lg)',
                    padding: 'var(--space-4)',
                    border: '1px solid var(--card-line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="serif" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--ink)' }}>
                        {plan.name}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
                        Facturación {period === BILLING_PERIODS.ANNUAL ? 'Anual (-20% ahorro)' : 'Mensual recurrente'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="serif" style={{ fontSize: 'var(--text-xl)', fontWeight: 900, color: isPro ? 'var(--amber)' : 'var(--coral)' }}>
                        ${price.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
                        {period === BILLING_PERIODS.ANNUAL ? 'por año' : 'por mes'}
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: 'var(--card-line)' }} />

                  {/* Beneficios clave */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {plan.features.slice(0, 4).map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--ink)' }}>
                        <i className="ti ti-check" style={{ color: 'var(--olive)', fontWeight: 800 }} />
                        <span>{f.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Banner de estado de pasarela */}
                <div
                  style={{
                    borderRadius: 'var(--r-md)',
                    padding: 'var(--space-3)',
                    background: activo ? 'var(--olive-soft)' : 'var(--amber-soft)',
                    border: `1px solid ${activo ? 'var(--olive)' : 'var(--amber)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--ink)',
                  }}
                >
                  <i className={`ti ti-${activo ? 'shield-lock' : 'info-circle'}`} style={{ fontSize: 'var(--text-base)', color: activo ? 'var(--olive)' : 'var(--amber)' }} />
                  <div>
                    {activo ? (
                      <span><strong>Culqi Checkout Activo:</strong> Transacción protegida con cifrado bancario SSL 256-bit.</span>
                    ) : (
                      <span><strong>Scaffold Culqi Activo:</strong> Modo de prueba sin RUC comercial. Puedes simular el checkout y probar la experiencia Pro.</span>
                    )}
                  </div>
                </div>

                {/* Boton de Checkout */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartCheckout}
                  className="gbtn q"
                  style={{
                    width: '100%',
                    minHeight: 'var(--tap-min)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--r-md)',
                    fontWeight: 800,
                    fontSize: 'var(--text-base)',
                    background: 'var(--amber)',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 3px 0 var(--amber-edge)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <i className="ti ti-credit-card" />
                  <span>{activo ? 'Pagar con Culqi' : 'Simular Suscripción (Scaffold)'}</span>
                </motion.button>
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 'var(--space-6) var(--space-4)',
                  gap: 'var(--space-3)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    border: '4px solid var(--amber-soft)',
                    borderTopColor: 'var(--amber)',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                <div className="serif" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--ink)' }}>
                  Procesando con Culqi...
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
                  Generando token de suscripción segura
                </div>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 'var(--space-4)',
                  gap: 'var(--space-3)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--olive-soft)',
                    color: 'var(--olive)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    boxShadow: '0 3px 0 var(--edge-soft)',
                  }}
                >
                  <i className="ti ti-check" />
                </div>
                <div className="serif" style={{ fontSize: 'var(--text-xl)', fontWeight: 900, color: 'var(--ink)' }}>
                  ¡Suscripción Activada!
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', margin: 0, lineHeight: 1.4 }}>
                  Ahora tienes acceso completo a todas las funciones de <strong>{plan.name}</strong>, hábitos ilimitados y potenciadores de Rockie.
                </p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClose}
                  className="gbtn q"
                  style={{
                    marginTop: 'var(--space-3)',
                    width: '100%',
                    minHeight: 'var(--tap-min)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--r-md)',
                    fontWeight: 800,
                    background: 'var(--olive)',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 3px 0 var(--olive-edge)',
                    cursor: 'pointer',
                  }}
                >
                  ¡A disfrutar mi progreso!
                </motion.button>
              </motion.div>
            )}

            {step === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 'var(--space-4)',
                  gap: 'var(--space-3)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--coral-soft)',
                    color: 'var(--coral)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                  }}
                >
                  <i className="ti ti-alert-triangle" />
                </div>
                <div className="serif" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--ink)' }}>
                  No pudimos procesar el pago
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--coral)', margin: 0 }}>
                  {errorMessage || 'Inténtalo nuevamente en unos momentos.'}
                </p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setStep('summary')}
                  className="gbtn q"
                  style={{
                    marginTop: 'var(--space-2)',
                    width: '100%',
                    minHeight: 'var(--tap-min)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--r-md)',
                    fontWeight: 800,
                    background: 'var(--paper)',
                    color: 'var(--ink)',
                    border: '1px solid var(--card-line)',
                    cursor: 'pointer',
                  }}
                >
                  Reintentar
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </BottomSheet>
    </>
  )
}

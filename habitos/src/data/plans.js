// ============================================================================
// B+ Suscripciones & Planes (Scaffold Culqi - Modelo Spotify Web Checkout)
// Cobro por web para evitar la comision del 15-30% de App Store y Google Play.
// Sin RUC activo: culqiPlanId permanece en null hasta enlazar credenciales reales.
// ============================================================================

export const BILLING_PERIODS = {
  MONTHLY: 'monthly',
  ANNUAL: 'annual',
}

export const ANNUAL_DISCOUNT_PERCENT = 20

export const PLANS = [
  {
    id: 'free',
    name: 'B+ Inicial',
    tagline: 'Lo esencial para empezar a transformar tus habitos',
    price: {
      monthly: 0,
      annual: 0,
    },
    currency: 'USD',
    currencySymbol: '$',
    periodLabel: 'Siempre gratis',
    badge: null,
    highlight: false,
    culqiPlanId: null,
    accentColor: 'var(--ink-muted)',
    accentSoft: 'var(--paper-alt)',
    features: [
      { text: 'Hasta 3 habitos activos', included: true },
      { text: 'Validacion visual con IA basica', included: true },
      { text: 'Rockie basico (6 piedras esenciales)', included: true },
      { text: '1 grupo social activo', included: true },
      { text: 'Historial de 14 dias', included: true },
      { text: 'Habitats exclusivos de Rockie', included: false },
      { text: 'Gemas y recompensas x2', included: false },
      { text: 'Sincronizacion multi-dispositivo ilimitada', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'B+ Pro',
    tagline: 'Para quienes van en serio con su crecimiento personal',
    price: {
      monthly: 4.99,
      annual: 47.90,
    },
    currency: 'USD',
    currencySymbol: '$',
    badge: 'Mas Popular',
    highlight: true,
    culqiPlanId: null,
    accentColor: 'var(--amber)',
    accentSoft: 'var(--amber-soft)',
    accentEdge: 'var(--amber-edge)',
    features: [
      { text: 'Habitos y metas ilimitadas', included: true },
      { text: 'Validacion IA Vision de alta precision', included: true },
      { text: 'Desbloqueo de todos los habitats de Rockie', included: true },
      { text: 'Monedas y multiplicador de XP x2', included: true },
      { text: 'Grupos y retos ilimitados con amigos', included: true },
      { text: 'Sincronizacion bidireccional con Google Calendar', included: true },
      { text: 'Estadisticas y mapas orbitales avanzados', included: true },
      { text: 'Soporte prioritario y acceso anticipado', included: true },
    ],
  },
  {
    id: 'family',
    name: 'B+ Circulo',
    tagline: 'Para familias, amigos o equipos que compiten y crecen juntos',
    price: {
      monthly: 9.99,
      annual: 95.90,
    },
    currency: 'USD',
    currencySymbol: '$',
    badge: 'Hasta 5 cuentas',
    highlight: false,
    culqiPlanId: null,
    accentColor: 'var(--coral)',
    accentSoft: 'var(--coral-soft)',
    accentEdge: 'var(--coral-edge)',
    features: [
      { text: 'Todo lo incluido en B+ Pro', included: true },
      { text: 'Hasta 5 cuentas Pro individuales', included: true },
      { text: 'Panel compartido de retos grupales', included: true },
      { text: 'Modo Control Parental / Companion', included: true },
      { text: 'Recompensas y gemas compartidas en circulo', included: true },
      { text: 'Dashboard consolidado de evolucion', included: true },
    ],
  },
]

export const PLAN_FAQS = [
  {
    q: '¿Por que el pago se realiza a traves de la web?',
    a: 'Al igual que Spotify o Netflix, procesamos las suscripciones de forma directa y 100% segura mediante Culqi con encriptacion SSL de 256 bits, lo que nos permite ofrecer precios mucho mas accesibles sin los sobrecostos del 30% de las tiendas de aplicaciones.',
  },
  {
    q: '¿Puedo cancelar o cambiar de plan en cualquier momento?',
    a: 'Si, puedes pausar o cancelar tu suscripcion con un solo toque desde Ajustes sin ningun tipo de penalizacion ni permanencia obligatoria.',
  },
  {
    q: '¿Que metodos de pago se aceptan?',
    a: 'Aceptamos tarjetas de credito y debito (Visa, Mastercard, American Express, Diners), asi como billeteras digitales como Yape y Plin mediante la pasarela Culqi.',
  },
  {
    q: '¿Se mantiene mi progreso y mi Rockie si cambio de plan?',
    a: 'Absolutamente. Todas tus rachas, niveles de Rockie, inventario de piedras y fotos de validacion permanecen intactas en tu cuenta.',
  },
]

export function planById(id) {
  return PLANS.find(p => p.id === id) || PLANS[0]
}

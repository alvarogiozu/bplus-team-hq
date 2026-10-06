import { useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { soles } from '../../lib/planes'
import { precioDe, usePrecios, type Periodo, type PlanPago } from '../../lib/precios'
import { useAuth } from '../auth/AuthProvider'
import { COMERCIO } from './comercio'
import './catalogo.css'

// El catálogo de rockie.plus: cada plan y cada periodo es un producto con su imagen, qué incluye y su precio
// (IGV incluido), y un botón para comprarlo. Comprar = Tu plan (/planes?comprar=…) abre el pago con Yape o tarjeta;
// sin sesión, primero crea la cuenta y vuelve ahí mismo. Lo pide Culqi para aprobar la tienda.

type Producto = {
  id: string
  plan: PlanPago
  tarifa: 'normal' | 'estudiante'
  periodo: Periodo
  nombre: string
  texto: string
}

const PRODUCTOS: Producto[] = [
  {
    id: 'plus-mes',
    plan: 'plus',
    tarifa: 'normal',
    periodo: 'mes',
    nombre: 'Rockie Plus · 1 mes',
    texto:
      'Hábitos y pizarras sin límite, el mapa completo de metas, pantalla dividida y Rockie más listo: 200 mensajes al mes.',
  },
  {
    id: 'plus-anio',
    plan: 'plus',
    tarifa: 'normal',
    periodo: 'anio',
    nombre: 'Rockie Plus · 1 año',
    texto: 'Todo lo de Plus durante 12 meses, en un solo pago y más barato que mes a mes.',
  },
  {
    id: 'plus-estudiante-mes',
    plan: 'plus',
    tarifa: 'estudiante',
    periodo: 'mes',
    nombre: 'Rockie Plus Estudiante · 1 mes',
    texto: 'Todo lo de Plus a precio de estudiante. Se verifica con el correo de tu universidad.',
  },
  {
    id: 'plus-estudiante-4meses',
    plan: 'plus',
    tarifa: 'estudiante',
    periodo: 'ciclo',
    nombre: 'Rockie Plus Estudiante · 4 meses',
    texto: 'Todo lo de Plus durante 4 meses (un semestre), en un solo pago y a precio de estudiante.',
  },
  {
    id: 'pro-mes',
    plan: 'pro',
    tarifa: 'normal',
    periodo: 'mes',
    nombre: 'Rockie Pro · 1 mes',
    texto: 'Todo lo de Plus, 10 equipos de hasta 25 personas y Rockie con la IA más potente para lo difícil.',
  },
  {
    id: 'pro-anio',
    plan: 'pro',
    tarifa: 'normal',
    periodo: 'anio',
    nombre: 'Rockie Pro · 1 año',
    texto: 'Todo lo de Pro durante 12 meses, en un solo pago y más barato que mes a mes.',
  },
  {
    id: 'club-mes',
    plan: 'club',
    tarifa: 'normal',
    periodo: 'mes',
    nombre: 'Rockie Club · 1 mes',
    texto:
      'Para un club u organización: personas sin límite en el equipo y los miembros no pagan nada. Precio por equipo.',
  },
  {
    id: 'club-anio',
    plan: 'club',
    tarifa: 'normal',
    periodo: 'anio',
    nombre: 'Rockie Club · 1 año',
    texto: 'Todo lo de Club durante 12 meses para tu equipo, en un solo pago y más barato que mes a mes.',
  },
]

const POR: Record<Periodo, string> = { mes: 'al mes', ciclo: 'por 4 meses', anio: 'al año' }

export function Catalogo() {
  const precios = usePrecios()
  const { session } = useAuth()
  const nav = useNavigate()

  function comprar(p: Producto) {
    const destino = `/planes?${new URLSearchParams({ comprar: p.plan, periodo: p.periodo, ...(p.tarifa === 'estudiante' ? { tarifa: 'estudiante' } : {}) })}`
    nav(session ? destino : `/registro?${new URLSearchParams({ next: destino })}`)
  }

  return (
    <section id="tienda" className="pub-sec ct">
      <h2>Tienda</h2>
      <p className="pub-sub">
        Elige tu plan y por cuánto tiempo. Pagas con Yape o tarjeta y se activa en tu cuenta al instante.
      </p>
      <div className="ct-grid">
        {PRODUCTOS.map((p) => {
          const precio = precioDe(precios, p.plan, p.tarifa, p.periodo)
          if (!precio) return null
          return (
            <article key={p.id} className={`ct-prod ct-${p.plan}`} aria-label={p.nombre}>
              <img
                src={`/landing/catalogo/${p.id}.webp`}
                alt={p.nombre}
                width={640}
                height={480}
                loading="lazy"
                decoding="async"
              />
              <div className="ct-cuerpo">
                <h3>{p.nombre}</h3>
                <p>{p.texto}</p>
                <p className="ct-precio">
                  <b>{soles(precio.centimos / 100)}</b> <span>{POR[p.periodo]}</span>
                </p>
                <button type="button" className="btn sm block" onClick={() => comprar(p)}>
                  <Icon name="lock" className="sm" /> Comprar
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <p className="pub-nota">
        Precios en soles (S/), IGV incluido. Pago seguro con Culqi: Yape, o tarjeta de débito o crédito.
        Tienes {COMERCIO.diasReembolso} días de garantía en tu primer pago.
      </p>
    </section>
  )
}

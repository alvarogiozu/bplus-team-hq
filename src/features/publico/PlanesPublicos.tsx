import { Link, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { NOMBRE_PLAN, soles } from '../../lib/planes'
import { DURACION, precioDe, usePrecios, type Periodo, type PlanPago, type Precio } from '../../lib/precios'
import { useAuth } from '../auth/AuthProvider'
import { TARJETAS } from '../planes/tarjetas'
import { COMERCIO } from './comercio'
import './planes-publicos.css'

// Los planes de rockie.plus, en UN solo lugar: cada plan con su imagen, qué incluye y sus opciones de compra
// (periodo + precio con IGV + «Comprar»). Es también el catálogo que pide Culqi: 8 productos con botón de pago.
// Comprar = /planes?comprar=plan&periodo=… (sin sesión, primero crea la cuenta y vuelve ahí): abre el pago con
// Yape o tarjeta.

type Opcion = { plan: PlanPago; tarifa: Precio['tarifa']; periodo: Periodo }

const OPCIONES: Record<PlanPago, { normal: Periodo[]; estudiante?: Periodo[] }> = {
  // con los precios nuevos, el estudiante ve primero el ciclo (el mejor precio por mes)
  plus: { normal: ['mes', 'anio'], estudiante: COMERCIO.preciosNuevos ? ['ciclo', 'mes'] : ['mes', 'ciclo'] },
  pro: { normal: ['mes', 'anio'] },
  club: { normal: ['mes', 'anio'] },
}

function Boton({ o, precios, onComprar }: { o: Opcion; precios: Precio[]; onComprar: (o: Opcion) => void }) {
  const x = precioDe(precios, o.plan, o.tarifa, o.periodo)
  if (!x) return null
  const mes = precioDe(precios, o.plan, o.tarifa, 'mes')
  const ahorro = o.periodo !== 'mes' && mes ? Math.round((1 - x.centimos / (mes.centimos * x.meses)) * 100) : 0
  const precio = soles(x.centimos / 100)
  return (
    <button type="button" className="pp-op" onClick={() => onComprar(o)} aria-label={`Comprar ${NOMBRE_PLAN[o.plan]}${o.tarifa === 'estudiante' ? ' Estudiante' : ''} ${DURACION[o.periodo]}, ${precio}`}>
      <span className="pp-op-t">
        <b>{DURACION[o.periodo]}</b>
        <small>
          {precio}
          {ahorro > 0 && <em>Ahorras {ahorro}%</em>}
        </small>
      </span>
      <span className="pp-op-cta">
        <Icon name="lock" className="sm" /> Comprar
      </span>
    </button>
  )
}

export function PlanesPublicos() {
  const precios = usePrecios()
  const { session } = useAuth()
  const nav = useNavigate()

  function comprar(o: Opcion) {
    const destino = `/planes?${new URLSearchParams({ comprar: o.plan, periodo: o.periodo, ...(o.tarifa === 'estudiante' ? { tarifa: 'estudiante' } : {}) })}`
    nav(session ? destino : `/registro?${new URLSearchParams({ next: destino })}`)
  }

  return (
    <section id="planes" className="pub-sec pp">
      <h2>Planes</h2>
      <p className="pub-sub">
        Empieza gratis. Si quieres más, eliges tu plan y por cuánto tiempo, y pagas con Yape o tarjeta. Con tarjeta, si quieres, se renueva solo (y lo
        cancelas en un clic).
      </p>
      <div className="pp-grid">
        {TARJETAS.map((t) => {
          const mes = t.id === 'gratis' ? null : precioDe(precios, t.id, 'normal', 'mes')
          const ops = t.id === 'gratis' ? null : OPCIONES[t.id]
          return (
            <article key={t.id} className={`pp-card pp-${t.id}`} aria-label={`Plan ${NOMBRE_PLAN[t.id]}`}>
              <img className="pp-img" src={`/landing/planes/${t.id}.webp`} alt={`Rockie ${NOMBRE_PLAN[t.id]}`} width={640} height={400} loading="lazy" decoding="async" />
              <div className="pp-cuerpo">
                <h3>{NOMBRE_PLAN[t.id]}</h3>
                <p className="pp-lema">{t.lema}</p>
                <p className="pp-desde">
                  <b>{mes ? soles(mes.centimos / 100) : 'S/ 0'}</b> {mes ? (t.id === 'club' ? 'al mes, por equipo' : 'al mes') : 'para siempre'}
                </p>
                <ul>
                  {t.incluye.map((x) => (
                    <li key={x.t} className={x.pronto ? 'pronto' : ''}>
                      <Icon name={x.pronto ? 'clock' : 'check'} className="sm" />
                      <span>
                        {x.t}
                        {x.pronto && <em> · muy pronto</em>}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="pp-ops" role="group" aria-label={t.id === 'gratis' ? 'Empezar' : `Comprar ${NOMBRE_PLAN[t.id]}`}>
                  {ops ? (
                    <>
                      {ops.normal.map((p) => (
                        <Boton key={p} precios={precios} onComprar={comprar} o={{ plan: t.id as PlanPago, tarifa: 'normal', periodo: p }} />
                      ))}
                      {ops.estudiante && (
                        <>
                          <p className="pp-ops-t">Estudiantes (con el correo de tu universidad)</p>
                          {ops.estudiante.map((p) => (
                            <Boton key={p} precios={precios} onComprar={comprar} o={{ plan: t.id as PlanPago, tarifa: 'estudiante', periodo: p }} />
                          ))}
                        </>
                      )}
                    </>
                  ) : (
                    <Link className="btn ghost sm block" to="/registro">
                      Empieza gratis
                    </Link>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
      <p className="pub-nota">Precios en soles (S/), IGV incluido. Pago seguro con Culqi: Yape, o tarjeta de débito o crédito.</p>
    </section>
  )
}

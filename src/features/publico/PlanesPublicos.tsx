import { Link, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { NOMBRE_PLAN, soles } from '../../lib/planes'
import { DURACION, precioDe, usePrecios, type Periodo, type PlanPago, type Precio } from '../../lib/precios'
import { useAuth } from '../auth/AuthProvider'
import { TARJETAS, type Tarjeta } from '../planes/tarjetas'
import { preciosNuevos } from '../planes/tarifa'
import { Ceja, useRevelar } from './Portada'
import './planes-publicos.css'

// Los planes de rockie.plus, en UN solo lugar: cada plan con su emblema, su precio, qué incluye y sus opciones
// de compra (periodo + precio con IGV + «Comprar»). Es también el catálogo que pide Culqi: 8 productos con
// imagen y botón de pago. Estudiante es un plan APARTE (todo Plus, a su precio), no una nota dentro de Plus.
// Comprar = /planes?comprar=plan&periodo=… (sin sesión, primero crea la cuenta y vuelve ahí): abre el pago con
// Yape o tarjeta.

type Opcion = { plan: PlanPago; tarifa: Precio['tarifa']; periodo: Periodo }
type Emblema = Tarjeta['id'] | 'estudiante'

const PERIODOS: Record<PlanPago, Periodo[]> = { plus: ['mes', 'anio'], pro: ['mes', 'anio'], club: ['mes', 'anio'] }
// con los precios nuevos (el interruptor de la base: existen precios de fundador), el estudiante ve primero el ciclo
const periodosEstudiante = (nuevos: boolean): Periodo[] => (nuevos ? ['ciclo', 'mes'] : ['mes', 'ciclo'])

// El emblema de cada plan: la geoda de Rockie contada con cristales (uno, dos, tres, un racimo), sin la mascota.
// x = dónde nace, h = alto, w = ancho, r = inclinación. Los del centro van al final para quedar encima.
const CRISTALES: Record<Emblema, { x: number; h: number; w: number; r: number }[]> = {
  gratis: [{ x: 32, h: 34, w: 16, r: 0 }],
  estudiante: [
    { x: 40, h: 22, w: 12, r: 14 },
    { x: 26, h: 32, w: 15, r: -8 },
  ],
  plus: [
    { x: 24, h: 26, w: 13, r: -14 },
    { x: 38, h: 34, w: 15, r: 8 },
  ],
  pro: [
    { x: 19, h: 22, w: 12, r: -24 },
    { x: 45, h: 22, w: 12, r: 24 },
    { x: 32, h: 36, w: 15, r: 0 },
  ],
  club: [
    { x: 13, h: 16, w: 10, r: -40 },
    { x: 51, h: 16, w: 10, r: 40 },
    { x: 22, h: 26, w: 12, r: -20 },
    { x: 42, h: 26, w: 12, r: 20 },
    { x: 32, h: 34, w: 14, r: 0 },
  ],
}

function EmblemaPlan({ id, nombre }: { id: Emblema; nombre: string }) {
  return (
    <svg className="pp-emblema" viewBox="0 0 64 64" role="img" aria-label={`Emblema del plan ${nombre}`}>
      <path className="pp-suelo" d="M9 51H55" />
      {CRISTALES[id].map((c) => (
        <g key={c.x} transform={`rotate(${c.r} ${c.x} 50)`}>
          <path d={`M${c.x} ${50 - c.h}l${c.w / 2} ${c.w * 0.6}V50h${-c.w}V${50 - c.h + c.w * 0.6}Z`} />
          <path d={`M${c.x} ${50 - c.h}V50`} />
        </g>
      ))}
    </svg>
  )
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

function Incluye({ items }: { items: Tarjeta['incluye'] }) {
  return (
    <ul>
      {items.map((x) => (
        <li key={x.t} className={x.pronto ? 'pronto' : ''}>
          <Icon name={x.pronto ? 'clock' : 'check'} className="sm" />
          <span>
            {x.t}
            {x.pronto && <em> · muy pronto</em>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PlanesPublicos() {
  const precios = usePrecios()
  const { session } = useAuth()
  const nav = useNavigate()
  const ref = useRevelar<HTMLElement>()

  function comprar(o: Opcion) {
    const destino = `/planes?${new URLSearchParams({ comprar: o.plan, periodo: o.periodo, ...(o.tarifa === 'estudiante' ? { tarifa: 'estudiante' } : {}) })}`
    nav(session ? destino : `/registro?${new URLSearchParams({ next: destino })}`)
  }

  const estMes = precioDe(precios, 'plus', 'estudiante', 'mes')
  const estCiclo = precioDe(precios, 'plus', 'estudiante', 'ciclo')
  const plusMes = precioDe(precios, 'plus', 'normal', 'mes')
  const ahorroEst = estMes && plusMes ? Math.round((1 - estMes.centimos / plusMes.centimos) * 100) : 0

  return (
    <section ref={ref} id="planes" className="pub-sec pp">
      <Ceja n="05">Planes</Ceja>
      <h2 className="pt-rv">Empieza gratis. Crece cuando lo necesites.</h2>
      <p className="pub-sub">
        Eliges tu plan y por cuánto tiempo, y pagas con Yape o tarjeta. Con tarjeta, si quieres, se renueva solo (y lo cancelas en un clic).
      </p>
      <div className="pp-grid">
        {TARJETAS.map((t) => {
          const mes = t.id === 'gratis' ? null : precioDe(precios, t.id, 'normal', 'mes')
          const periodos = t.id === 'gratis' ? null : PERIODOS[t.id]
          return (
            <article key={t.id} className={`pp-card pp-${t.id} pt-rv`} aria-label={`Plan ${NOMBRE_PLAN[t.id]}`}>
              <header className="pp-cab">
                <EmblemaPlan id={t.id} nombre={NOMBRE_PLAN[t.id]} />
                <div>
                  <h3>{NOMBRE_PLAN[t.id]}</h3>
                  <p className="pp-lema">{t.lema}</p>
                </div>
              </header>
              <p className="pp-desde">
                <b>{mes ? soles(mes.centimos / 100) : 'S/ 0'}</b> {mes ? (t.id === 'club' ? 'al mes, por equipo' : 'al mes') : 'para siempre'}
              </p>
              <Incluye items={t.incluye} />
              {t.id === 'plus' && estMes && (
                <a className="pp-cruce" href="#plan-estudiante">
                  ¿Estudias? Tu plan está aquí abajo <Icon name="arrow" className="sm" />
                </a>
              )}
              <div className="pp-ops" role="group" aria-label={t.id === 'gratis' ? 'Empezar' : `Comprar ${NOMBRE_PLAN[t.id]}`}>
                {periodos ? (
                  periodos.map((p) => <Boton key={p} precios={precios} onComprar={comprar} o={{ plan: t.id as PlanPago, tarifa: 'normal', periodo: p }} />)
                ) : (
                  <Link className="btn ghost sm block" to="/registro">
                    Empieza gratis
                  </Link>
                )}
              </div>
            </article>
          )
        })}

        {estMes && (
          <article id="plan-estudiante" className="pp-card pp-estudiante pt-rv" aria-label="Plan Estudiante">
            <div className="pp-est-quien">
              <header className="pp-cab">
                <EmblemaPlan id="estudiante" nombre="Estudiante" />
                <div>
                  <h3>Estudiante</h3>
                  <p className="pp-lema">Todo Plus, a precio de estudiante</p>
                </div>
              </header>
              <p className="pp-desde">
                <b>{soles(estMes.centimos / 100)}</b> al mes
                {ahorroEst > 0 && <em>{ahorroEst}% menos que Plus</em>}
              </p>
            </div>
            <Incluye
              items={[
                { t: 'Todo lo de Plus, sin recortes' },
                { t: 'Se activa con el correo de tu universidad' },
                ...(estCiclo ? [{ t: `Paga el ciclo completo: 4 meses por ${soles(estCiclo.centimos / 100)}` }] : []),
              ]}
            />
            <div className="pp-ops" role="group" aria-label="Comprar Plus Estudiante">
              {periodosEstudiante(preciosNuevos(precios)).map((p) => (
                <Boton key={p} precios={precios} onComprar={comprar} o={{ plan: 'plus', tarifa: 'estudiante', periodo: p }} />
              ))}
            </div>
          </article>
        )}
      </div>
      <p className="pub-nota">Precios en soles (S/), IGV incluido. Pago seguro con Culqi: Yape, o tarjeta de débito o crédito.</p>
    </section>
  )
}

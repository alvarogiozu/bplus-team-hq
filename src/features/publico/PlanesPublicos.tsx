import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon, type IconName } from '../../components/Icon'
import { NOMBRE_PLAN, soles } from '../../lib/planes'
import { DURACION, precioDe, usePrecios, type Periodo, type PlanPago, type Precio } from '../../lib/precios'
import { useAuth } from '../auth/AuthProvider'
import { TARJETAS, type Tarjeta } from '../planes/tarjetas'
import { preciosNuevos } from '../planes/tarifa'
import { Ceja, useEntrada, useRevelar } from './Portada'
import './planes-publicos.css'

// Los planes de rockie.plus, en UN solo lugar, contados en dos actos:
//  1. «Tú»: Gratis → Plus → Pro, una subida. En la PC una línea une los tres emblemas y se llena con el scroll;
//     cada plan sube cuando le toca. Arriba se elige ver el precio por mes o pagando el año.
//  2. «¿No vas solo?»: Estudiante, Dúo, Grupo y Club. Eliges con quién vas y se adelanta tu plan.
// Es también el catálogo que pide Culqi: cada plan con su emblema, qué incluye, su precio con IGV y sus botones
// «Comprar» (8 productos). Dúo y Grupo todavía no existen: van como «muy pronto», y su precio solo se muestra
// cuando los precios nuevos están activos (docs/negocio/precios-y-margenes.md).
// Comprar = /planes?comprar=plan&periodo=… (sin sesión, primero crea la cuenta y vuelve ahí): abre el pago con
// Yape o tarjeta.

type Opcion = { plan: PlanPago; tarifa: Precio['tarifa']; periodo: Periodo }
type Quien = 'estudiante' | 'duo' | 'grupo' | 'club'
type Emblema = Tarjeta['id'] | 'estudiante' | 'duo' | 'grupo'

const PERIODOS: Periodo[] = ['mes', 'anio']
// con los precios nuevos (el interruptor de la base: existen precios de fundador), el estudiante ve primero el ciclo
const periodosEstudiante = (nuevos: boolean): Periodo[] => (nuevos ? ['ciclo', 'mes'] : ['mes', 'ciclo'])
const orden = (i: number) => ({ ['--k' as string]: i }) as CSSProperties

const QUIENES: { id: Quien; t: string; icon: IconName }[] = [
  { id: 'estudiante', t: 'Estudio', icon: 'notebook' },
  { id: 'duo', t: 'Somos dos', icon: 'user' },
  { id: 'grupo', t: 'Somos un grupo', icon: 'team' },
  { id: 'club', t: 'Somos un club', icon: 'flag' },
]

// Dúo y Grupo (por construir): lo decidido el 9 oct. Los soles solo se muestran con los precios nuevos activos.
const JUNTOS: { id: 'duo' | 'grupo'; nombre: string; lema: string; mes: number; cadaUno: number; incluye: string[] }[] = [
  {
    id: 'duo',
    nombre: 'Dúo',
    lema: 'Plus para dos',
    mes: 39.9,
    cadaUno: 19.95,
    incluye: ['Todo lo de Plus para cada uno', 'Un solo pago', 'Cada quien con su cuenta y su propio cupo de IA'],
  },
  {
    id: 'grupo',
    nombre: 'Grupo',
    lema: 'Plus hasta para 5, amigos o familia',
    mes: 79.9,
    cadaUno: 15.98,
    incluye: ['Todo lo de Plus para cada uno', 'Un solo pago para el grupo', 'Cada quien con su cuenta y su propio cupo de IA'],
  },
]

// El emblema de cada plan: la geoda de Rockie contada con cristales (uno, dos, tres, un racimo), sin la mascota.
// x = dónde nace, h = alto, w = ancho, r = inclinación. Los del centro van al final para quedar encima.
const CRISTALES: Record<Emblema, { x: number; h: number; w: number; r: number }[]> = {
  gratis: [{ x: 32, h: 34, w: 16, r: 0 }],
  estudiante: [
    { x: 40, h: 22, w: 12, r: 14 },
    { x: 26, h: 32, w: 15, r: -8 },
  ],
  duo: [
    { x: 24, h: 30, w: 14, r: -10 },
    { x: 40, h: 30, w: 14, r: 10 },
  ],
  grupo: [
    { x: 16, h: 20, w: 11, r: -28 },
    { x: 48, h: 20, w: 11, r: 28 },
    { x: 26, h: 30, w: 13, r: -10 },
    { x: 38, h: 30, w: 13, r: 10 },
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

function Boton({ o, precios, elegida, onComprar }: { o: Opcion; precios: Precio[]; elegida?: boolean; onComprar: (o: Opcion) => void }) {
  const x = precioDe(precios, o.plan, o.tarifa, o.periodo)
  if (!x) return null
  const mes = precioDe(precios, o.plan, o.tarifa, 'mes')
  const ahorro = o.periodo !== 'mes' && mes ? Math.round((1 - x.centimos / (mes.centimos * x.meses)) * 100) : 0
  const precio = soles(x.centimos / 100)
  return (
    <button
      type="button"
      className={`pp-op${elegida ? ' elegida' : ''}`}
      onClick={() => onComprar(o)}
      aria-label={`Comprar ${NOMBRE_PLAN[o.plan]}${o.tarifa === 'estudiante' ? ' Estudiante' : ''} ${DURACION[o.periodo]}, ${precio}`}
    >
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
  const camino = useEntrada<HTMLDivElement>(0.92, 0.18)
  const [anual, setAnual] = useState(false)
  const [quien, setQuien] = useState<Quien>('estudiante')
  const nuevos = preciosNuevos(precios)

  function comprar(o: Opcion) {
    const destino = `/planes?${new URLSearchParams({ comprar: o.plan, periodo: o.periodo, ...(o.tarifa === 'estudiante' ? { tarifa: 'estudiante' } : {}) })}`
    nav(session ? destino : `/registro?${new URLSearchParams({ next: destino })}`)
  }

  function elegir(id: Quien) {
    setQuien(id)
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`plan-${id}`)?.scrollIntoView({ block: 'nearest', behavior: quieto ? 'auto' : 'smooth' })
  }

  /** El precio en grande: por mes, o lo que sale por mes pagando el año. */
  function precioGrande(plan: PlanPago, cola = '') {
    const mes = precioDe(precios, plan, 'normal', 'mes')
    const anio = precioDe(precios, plan, 'normal', 'anio')
    if (anual && anio) return { b: soles(Math.round(anio.centimos / 12) / 100), nota: `al mes${cola}, pagando el año` }
    return { b: mes ? soles(mes.centimos / 100) : '—', nota: `al mes${cola}` }
  }

  const plusMes = precioDe(precios, 'plus', 'normal', 'mes')
  const plusAnio = precioDe(precios, 'plus', 'normal', 'anio')
  const ahorroAnual = plusMes && plusAnio ? Math.round((1 - plusAnio.centimos / (plusMes.centimos * 12)) * 100) : 0
  const estMes = precioDe(precios, 'plus', 'estudiante', 'mes')
  const estCiclo = precioDe(precios, 'plus', 'estudiante', 'ciclo')
  const ahorroEst = estMes && plusMes ? Math.round((1 - estMes.centimos / plusMes.centimos) * 100) : 0
  const club = TARJETAS.find((t) => t.id === 'club') as Tarjeta
  const precioClub = precioGrande('club', ', por equipo')
  const elegida = anual ? 'anio' : 'mes'

  const botones = (plan: PlanPago) =>
    PERIODOS.map((p) => <Boton key={p} precios={precios} onComprar={comprar} elegida={p === elegida} o={{ plan, tarifa: 'normal', periodo: p }} />)

  return (
    <section ref={ref} id="planes" className="pub-sec pp">
      <Ceja n="06">Planes</Ceja>
      <h2 className="pt-rv">Empieza gratis. Crece cuando lo necesites.</h2>
      <p className="pub-sub pt-rv">
        Eliges tu plan y por cuánto tiempo, y pagas con Yape o tarjeta. Con tarjeta, si quieres, se renueva solo (y lo cancelas en un clic).
      </p>

      <div className="pp-periodo pt-rv" role="group" aria-label="Ver precios">
        <button type="button" aria-pressed={!anual} onClick={() => setAnual(false)}>
          Mes a mes
        </button>
        <button type="button" aria-pressed={anual} onClick={() => setAnual(true)}>
          Pagando el año{ahorroAnual > 0 && <em>−{ahorroAnual}%</em>}
        </button>
      </div>

      {/* acto 1 · tú: la subida */}
      <div ref={camino} className="pp-camino">
        <span className="pp-riel" aria-hidden="true">
          <i />
        </span>
        <div className="pp-grid">
          {TARJETAS.filter((t) => t.id !== 'club').map((t, i) => {
            const precio = t.id === 'gratis' ? { b: 'S/ 0', nota: 'para siempre' } : precioGrande(t.id as PlanPago)
            return (
              <article key={t.id} className={`pp-card pp-${t.id}`} style={orden(i)} aria-label={`Plan ${NOMBRE_PLAN[t.id]}`}>
                <header className="pp-cab">
                  <EmblemaPlan id={t.id} nombre={NOMBRE_PLAN[t.id]} />
                  <div>
                    <h3>{NOMBRE_PLAN[t.id]}</h3>
                    <p className="pp-lema">{t.lema}</p>
                  </div>
                </header>
                <p className="pp-desde">
                  <b key={precio.b}>{precio.b}</b> {precio.nota}
                </p>
                <Incluye items={t.incluye} />
                <div className="pp-ops" role="group" aria-label={t.id === 'gratis' ? 'Empezar' : `Comprar ${NOMBRE_PLAN[t.id]}`}>
                  {t.id === 'gratis' ? (
                    <Link className="btn ghost sm block" to="/registro">
                      Empieza gratis
                    </Link>
                  ) : (
                    botones(t.id as PlanPago)
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {/* acto 2 · ¿no vas solo? */}
      <div className="pp-acto pt-rv">
        <h3>¿No vas solo?</h3>
        <p>Dinos con quién vas y te mostramos tu plan.</p>
        <div className="pp-quien" role="group" aria-label="¿Con quién vas?">
          {QUIENES.map((q) => (
            <button key={q.id} type="button" className={`pt-persona${quien === q.id ? ' on' : ''}`} aria-pressed={quien === q.id} onClick={() => elegir(q.id)}>
              <Icon name={q.icon} className="sm" />
              {q.t}
            </button>
          ))}
        </div>
      </div>
      <div className="pp-grid pp-juntos">
        {estMes && (
          <article id="plan-estudiante" className={`pp-card pp-estudiante pt-rv${quien === 'estudiante' ? ' elegida' : ''}`} aria-label="Plan Estudiante">
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
            <Incluye
              items={[
                { t: 'Todo lo de Plus, sin recortes' },
                { t: 'Se activa con el correo de tu universidad' },
                ...(estCiclo ? [{ t: `Paga el ciclo completo: 4 meses por ${soles(estCiclo.centimos / 100)}` }] : []),
              ]}
            />
            <div className="pp-ops" role="group" aria-label="Comprar Plus Estudiante">
              {periodosEstudiante(nuevos).map((p) => (
                <Boton key={p} precios={precios} onComprar={comprar} o={{ plan: 'plus', tarifa: 'estudiante', periodo: p }} />
              ))}
            </div>
          </article>
        )}

        {JUNTOS.map((j) => (
          <article key={j.id} id={`plan-${j.id}`} className={`pp-card pp-${j.id} pt-rv${quien === j.id ? ' elegida' : ''}`} aria-label={`Plan ${j.nombre}`}>
            <header className="pp-cab">
              <EmblemaPlan id={j.id} nombre={j.nombre} />
              <div>
                <h3>{j.nombre}</h3>
                <p className="pp-lema">{j.lema}</p>
              </div>
            </header>
            <p className="pp-desde">
              {nuevos ? (
                <>
                  <b>{soles(j.mes)}</b> al mes
                  <em>{soles(j.cadaUno)} cada uno</em>
                </>
              ) : (
                <>
                  <b>Muy pronto</b>
                  <em>Un solo pago para todos</em>
                </>
              )}
            </p>
            <Incluye items={j.incluye.map((t) => ({ t }))} />
            <p className="pp-pronto">
              <Icon name="clock" className="sm" /> Llega después del lanzamiento
            </p>
          </article>
        ))}

        <article id="plan-club" className={`pp-card pp-club pt-rv${quien === 'club' ? ' elegida' : ''}`} aria-label={`Plan ${NOMBRE_PLAN.club}`}>
          <header className="pp-cab">
            <EmblemaPlan id="club" nombre={NOMBRE_PLAN.club} />
            <div>
              <h3>{NOMBRE_PLAN.club}</h3>
              <p className="pp-lema">{club.lema}</p>
            </div>
          </header>
          <p className="pp-desde">
            <b key={precioClub.b}>{precioClub.b}</b> {precioClub.nota}
          </p>
          <Incluye items={club.incluye} />
          <div className="pp-ops" role="group" aria-label={`Comprar ${NOMBRE_PLAN.club}`}>
            {botones('club')}
          </div>
        </article>
      </div>
      <p className="pub-nota">Precios en soles (S/), IGV incluido. Pago seguro con Culqi: Yape, o tarjeta de débito o crédito.</p>
    </section>
  )
}

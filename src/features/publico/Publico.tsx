import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { Icon, type IconName } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { NOMBRE_PLAN, soles } from '../../lib/planes'
import { precioDe, usePrecios } from '../../lib/precios'
import { useAuth } from '../auth/AuthProvider'
import { capturarReferido, referidoPendiente } from '../planes/referidos'
import { TARJETAS } from '../planes/tarjetas'
import { COMERCIO } from './comercio'
import { documento } from './legal'
import { Catalogo } from './Catalogo'
import { PortadaCierre, PortadaHero, PortadaHistoria } from './Portada'
import '../planes/planes.css'
import './publico.css'

// La cara pública de rockie.plus: qué es Rockie, sus planes con precio, los textos legales y el Libro de
// Reclamaciones (lo piden Culqi e INDECOPI). Con sesión, la raíz te lleva a tus apps.

/** «/»: sin sesión, la página de Rockie; con sesión, tus apps. */
export function Raiz() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/inicio" replace />
  return <Inicio />
}

export function MarcoPublico({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="pub">
      <header className="pub-top">
        <Link to="/" className="pub-marca" aria-label="Rockie, inicio">
          <Rockie size={34} still />
          <span>Rockie</span>
        </Link>
        <nav className="pub-nav" aria-label="Secciones">
          <a href="/#apps">Qué es</a>
          <a href="/#planes">Planes</a>
          <a href="/#tienda">Tienda</a>
          <a href="/#dudas">Dudas</a>
        </nav>
        <span className="pub-sp" />
        {session ? (
          <Link className="btn sm" to="/inicio">
            Ir a mis apps
          </Link>
        ) : (
          <>
            <Link className="btn ghost sm pub-entrar" to="/login">
              Entrar
            </Link>
            <Link className="btn sm" to="/registro">
              Empieza gratis
            </Link>
          </>
        )}
      </header>
      <main className="pub-main">{children}</main>
      <Pie />
    </div>
  )
}

function Pie() {
  return (
    <footer className="pub-pie">
      <div className="pub-pie-col">
        <b className="pub-pie-marca">
          <Rockie size={28} still /> Rockie
        </b>
        <p>
          {COMERCIO.titular} · RUC {COMERCIO.ruc}
        </p>
        {COMERCIO.direccion && <p>{COMERCIO.direccion}</p>}
        {COMERCIO.correo && (
          <p>
            <a href={`mailto:${COMERCIO.correo}`}>{COMERCIO.correo}</a>
          </p>
        )}
        {COMERCIO.telefono && <p>WhatsApp: {COMERCIO.telefono}</p>}
      </div>
      <nav className="pub-pie-col" aria-label="Legal">
        <Link to="/terminos">Términos y condiciones</Link>
        <Link to="/reembolsos">Cambios y devoluciones</Link>
        <Link to="/privacidad">Política de privacidad</Link>
      </nav>
      <div className="pub-pie-col">
        <Link to="/libro-de-reclamaciones" className="pub-libro">
          <Icon name="notebook" className="sm" />
          <span>
            <b>Libro de Reclamaciones</b>
            <small>Conforme al Código de Protección y Defensa del Consumidor</small>
          </span>
        </Link>
        <p className="pub-pago">
          <Icon name="lock" className="sm" /> Pagos seguros con Culqi (tarjeta o Yape)
        </p>
      </div>
      <p className="pub-copy">© 2026 Rockie · rockie.plus</p>
    </footer>
  )
}

const ICONO_PLAN: Record<string, IconName> = { gratis: 'star', plus: 'sparkle', pro: 'trophy', club: 'team' }

function Inicio() {
  const precios = usePrecios()
  // llegó con el link de un amigo (rockie.plus/?ref=CODIGO): se guarda hasta que cree su cuenta
  const [invitado] = useState(() => {
    capturarReferido(location.search)
    return Boolean(referidoPendiente())
  })
  return (
    <MarcoPublico>
      {invitado && (
        <p className="pub-invitado" role="status">
          <Icon name="star" className="sm" /> Te invitó un amigo: crea tu cuenta y, cuando te suscribas, <b>los dos ganan 1 mes gratis</b>.
        </p>
      )}
      <PortadaHero />
      <PortadaHistoria />

      <section id="planes" className="pub-sec">
        <h2>Planes</h2>
        <p className="pub-sub">
          Empieza gratis. Si quieres más, pagas con Yape o tarjeta por un mes, un ciclo o un año. Con tarjeta, si quieres, se renueva solo (y lo cancelas en
          un clic).
        </p>
        <div className="pl-grid">
          {TARJETAS.map((t) => {
            const mes = t.id === 'gratis' ? null : precioDe(precios, t.id, 'normal', 'mes')
            const anio = t.id === 'gratis' ? null : precioDe(precios, t.id, 'normal', 'anio')
            const est = t.id === 'plus' ? precioDe(precios, 'plus', 'estudiante', 'mes') : null
            const ciclo = t.id === 'plus' ? precioDe(precios, 'plus', 'estudiante', 'ciclo') : null
            const ahorro = mes && anio ? Math.round((1 - anio.centimos / (mes.centimos * 12)) * 100) : 0
            return (
              <article key={t.id} className={`pl-card pl-${t.id}`} aria-label={`Plan ${NOMBRE_PLAN[t.id]}`}>
                <span className="pub-plan-ico" aria-hidden="true">
                  <Icon name={ICONO_PLAN[t.id]} />
                </span>
                <h3>{NOMBRE_PLAN[t.id]}</h3>
                <p className="pl-lema">{t.lema}</p>
                <p className="pl-precio">
                  <b>{mes ? `${soles(mes.centimos / 100)} al mes` : 'S/ 0'}</b>
                  {anio && (
                    <small>
                      o {soles(anio.centimos / 100)} al año{ahorro > 0 ? ` (ahorras ${ahorro}%)` : ''}
                    </small>
                  )}
                  {est && (
                    <small>
                      Estudiantes: {soles(est.centimos / 100)} al mes{ciclo ? ` o ${soles(ciclo.centimos / 100)} por ciclo` : ''}
                    </small>
                  )}
                  {t.id === 'club' && <small>por equipo</small>}
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
                <Link className={`btn sm block${t.id === 'gratis' ? ' ghost' : ''}`} to={t.id === 'gratis' ? '/registro' : `/registro?${new URLSearchParams({ next: `/planes?comprar=${t.id}` })}`}>
                  {t.id === 'gratis' ? 'Empieza gratis' : t.id === 'club' ? 'Suscribir mi club' : 'Suscribirme'}
                </Link>
              </article>
            )
          })}
        </div>
        <p className="pub-nota">Precios en soles (S/), IGV incluido. Pagas con tarjeta o Yape a través de Culqi.</p>
      </section>

      <Catalogo />

      <section id="dudas" className="pub-sec pub-dudas">
        <h2>Dudas rápidas</h2>
        <details>
          <summary>¿Rockie es gratis?</summary>
          <p>Sí. El plan Gratis no vence y trae todo lo esencial. Los planes de pago amplían los límites y la IA.</p>
        </details>
        <details>
          <summary>¿Se cobra solo cada mes?</summary>
          <p>
            Solo si lo eliges: al pagar con tarjeta puedes activar la renovación automática. Te avisamos antes de cada cobro y la cancelas en un clic. Con Yape
            pagas cuando quieras renovar. Nada de cobros sorpresa.
          </p>
        </details>
        <details>
          <summary>¿Puedo pagar con Yape?</summary>
          <p>Sí: con tu celular y el código de aprobación de tu app Yape, sin tarjeta. También con tarjeta de débito o crédito.</p>
        </details>
        <details>
          <summary>¿Y si me voy de vacaciones?</summary>
          <p>Pausas tu plan 1 o 2 meses (una vez al año) y tus días te esperan. Y si se te pasa la fecha, te lo guardamos 3 días más.</p>
        </details>
        <details>
          <summary>¿Y si no me convence?</summary>
          <p>
            En tu primer pago tienes {COMERCIO.diasReembolso} días de garantía: te devolvemos todo. Mira la <Link to="/reembolsos">política de devoluciones</Link>.
          </p>
        </details>
        <details>
          <summary>¿Hay precio de estudiante?</summary>
          <p>Sí: Plus te cuesta menos si verificas el correo de tu universidad, y puedes pagar todo el ciclo (4 meses) de una vez.</p>
        </details>
        <details>
          <summary>¿Qué es el plan Club?</summary>
          <p>Es para el equipo de un club u organización: lo paga el club y sus miembros usan todo lo del club gratis, sin límite de personas.</p>
        </details>
      </section>

      <PortadaCierre />
    </MarcoPublico>
  )
}

/** /terminos, /reembolsos, /privacidad */
export function LegalPage({ slug }: { slug: 'terminos' | 'reembolsos' | 'privacidad' }) {
  const d = documento(slug)
  useEffect(() => {
    document.title = `${d.titulo} · Rockie`
    return () => {
      document.title = 'Rockie'
    }
  }, [d.titulo])
  return (
    <MarcoPublico>
      <article className="pub-legal">
        <h1>{d.titulo}</h1>
        <p className="pub-legal-fecha">Última actualización: {COMERCIO.actualizado}</p>
        <p className="pub-legal-intro">{d.intro}</p>
        {d.secciones.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((x) => (
              <p key={x.slice(0, 40)}>{x}</p>
            ))}
          </section>
        ))}
      </article>
    </MarcoPublico>
  )
}

export default Inicio

import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { useAuth } from '../auth/AuthProvider'
import { capturarReferido, referidoPendiente } from '../planes/referidos'
import { COMERCIO } from './comercio'
import { documento } from './legal'
import { PlanesPublicos } from './PlanesPublicos'
import { PortadaCierre, PortadaHero, PortadaHistoria } from './Portada'
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

const DESCRIPCION =
  'Hábitos con prueba, agenda, apuntes y los proyectos de tu equipo en una sola app, con Rockie. Gratis para siempre; ni nosotros leemos lo tuyo.'

function Inicio() {
  // llegó con el link de un amigo (rockie.plus/?ref=CODIGO): se guarda hasta que cree su cuenta
  const [invitado] = useState(() => {
    capturarReferido(location.search)
    return Boolean(referidoPendiente())
  })
  useEffect(() => {
    // lo que ve Google (las vistas previas de WhatsApp y redes salen de index.html)
    document.title = 'Rockie · Todas tus herramientas, en una sola mochila'
    document.querySelector('meta[name="description"]')?.setAttribute('content', DESCRIPCION)
    return () => {
      document.title = 'Rockie'
    }
  }, [])
  return (
    <MarcoPublico>
      {invitado && (
        <p className="pub-invitado" role="status">
          <Icon name="star" className="sm" /> Te invitó un amigo: crea tu cuenta y, cuando te suscribas, <b>los dos ganan 1 mes gratis</b>.
        </p>
      )}
      <PortadaHero />
      <PortadaHistoria />

      <PlanesPublicos />

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
          <p>Sí: Plus te cuesta menos si verificas el correo de tu universidad, y puedes pagar 4 meses (un semestre) de una vez.</p>
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

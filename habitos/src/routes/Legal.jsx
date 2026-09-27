import { useNavigate } from 'react-router-dom'
import { CONTACT_EMAIL } from '../lib/site.js'

// ============================================================================
// Legal — Privacidad + Términos de uso de B+. Ruta PUBLICA (/legal): se ve con
// o sin sesion, porque tambien es la URL de politica de privacidad que piden
// las tiendas (App Store Connect / Google Play) y el enlace obligatorio para
// apps con contenido de usuarios (Apple Guideline 1.2 y 5.1.1).
//
// OJO (para el dueno del proyecto): este texto es una base solida y honesta,
// pero antes de publicar en las tiendas conviene revisar con alguien de legal
// el titular responsable, la jurisdiccion y la edad minima segun tu pais.
// ============================================================================

const ACTUALIZADO = '5 de agosto de 2026'
const CONTACTO = CONTACT_EMAIL

// Bloque de seccion con titulo y cuerpo (parrafos / listas ya formateados)
function Bloque({ id, titulo, children }) {
  return (
    <section id={id} style={{ marginTop: 'var(--space-6)' }}>
      <h2 className="s" style={{
        fontSize: 'var(--text-xl)', color: 'var(--title)', lineHeight: 1.2,
        letterSpacing: '-0.2px', margin: 0,
      }}>
        {titulo}
      </h2>
      <div className="editorial-line" />
      <div className="q" style={{
        fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.7,
        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)',
      }}>
        {children}
      </div>
    </section>
  )
}

// Item de lista con vineta de color
function Punto({ children }) {
  return (
    <li style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
      <span style={{ color: 'var(--brand)', flexShrink: 0, marginTop: 2 }}><i className="ti ti-point-filled" /></span>
      <span>{children}</span>
    </li>
  )
}

export default function Legal() {
  const navigate = useNavigate()

  const volver = () => {
    // Si venimos de dentro de la app, atras; si se abrio en frio (URL directa
    // desde la tienda), no hay historial: al inicio.
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="scroll-area legal-page" style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      background: 'var(--paper)', padding: `var(--space-6) var(--screen-x) var(--space-8)`,
    }}>
      {/* Cabecera con volver */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={volver}
          aria-label="Volver"
          className="gbtn"
          style={{
            width: 40, height: 40, borderRadius: '50%', background: 'var(--card)',
            border: '2px solid var(--card-line)', '--edge': 'var(--card-edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-soft)', fontSize: 'var(--text-lg)', flexShrink: 0, marginTop: 2,
          }}
        >
          <i className="ti ti-chevron-left" />
        </button>
        <div>
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>
            B+ · Victorias reales
          </div>
          <div className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--title)', lineHeight: 1.1, marginTop: 3, letterSpacing: '-0.3px' }}>
            Privacidad y términos
          </div>
          <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 'var(--space-2)' }}>
            Última actualización: {ACTUALIZADO}
          </div>
        </div>
      </div>

      <p className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.7, marginTop: 'var(--space-5)' }}>
        B+ es una app para construir hábitos: registras un hábito, subes una foto como
        prueba, una IA la valida y mantienes tu racha con Rockie, tu mascota. Aquí te
        explicamos qué datos tratamos y bajo qué reglas se usa la app. Al usar B+ aceptas
        esta política y estos términos.
      </p>

      {/* ── PRIVACIDAD ───────────────────────────────────────────────── */}
      <Bloque id="privacidad" titulo="Política de privacidad">
        <div>
          <b style={{ color: 'var(--ink)' }}>Qué datos recogemos</b>
          <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0' }}>
            <Punto><b>Cuenta:</b> tu nombre y correo, que llegan de tu inicio de sesión con Google.</Punto>
            <Punto><b>Tu actividad:</b> los hábitos que creas, tus validaciones, racha, monedas, metas y progreso.</Punto>
            <Punto><b>Fotos de prueba:</b> las imágenes que subes para validar un hábito.</Punto>
            <Punto><b>Perfil público:</b> tu avatar y nombre, visibles para tus amigos y en tus grupos.</Punto>
            <Punto><b>Uso técnico:</b> datos mínimos de funcionamiento y errores para mantener la app estable.</Punto>
          </ul>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Para qué los usamos</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            Para que la app funcione: guardar tu progreso, validar tus fotos, calcular tu
            racha y tu nivel, y permitir lo social (amigos, grupos, retos y chat). No
            vendemos tus datos ni los usamos para publicidad de terceros.
          </p>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Con quién se comparten</b>
          <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0' }}>
            <Punto><b>Supabase</b> aloja la base de datos y tus fotos (servidores en Sudamérica).</Punto>
            <Punto><b>Google</b> gestiona tu inicio de sesión y, si lo conectas, tu calendario.</Punto>
            <Punto><b>Google Gemini</b> analiza tu foto de prueba para decidir si valida el hábito.</Punto>
            <Punto>Tus amigos y compañeros de grupo ven tu nombre, avatar y el progreso que compartes.</Punto>
          </ul>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Tus derechos y el borrado</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            Puedes <b style={{ color: 'var(--ink)' }}>eliminar tu cuenta y todos tus datos</b> en cualquier
            momento desde <i>Ajustes → Eliminar cuenta</i>. El borrado es permanente e incluye tus
            hábitos, racha, fotos, metas y amistades. También puedes escribirnos para acceder a tus
            datos o corregirlos.
          </p>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Menores</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            B+ no está dirigida a menores de la edad mínima que exija tu país. Si eres menor,
            usa la app con permiso de un adulto responsable.
          </p>
        </div>
      </Bloque>

      {/* ── TERMINOS ─────────────────────────────────────────────────── */}
      <Bloque id="terminos" titulo="Términos de uso">
        <div>
          <b style={{ color: 'var(--ink)' }}>Uso de la app</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            B+ se ofrece para tu uso personal. Eres responsable de la actividad de tu cuenta y de
            las fotos y mensajes que subes.
          </p>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Contenido y conducta — tolerancia cero</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            B+ incluye contenido creado por usuarios (fotos, nombres, avatares y mensajes de chat).
            <b style={{ color: 'var(--ink)' }}> No se tolera</b> el contenido ofensivo, ilegal, sexual explícito,
            violento, de odio o acoso, ni el comportamiento abusivo hacia otras personas.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
            <Punto>Puedes <b style={{ color: 'var(--ink)' }}>reportar</b> cualquier usuario o mensaje desde su menú.</Punto>
            <Punto>Puedes <b style={{ color: 'var(--ink)' }}>bloquear</b> a cualquier usuario para dejar de ver su contenido.</Punto>
            <Punto>Revisamos los reportes y actuamos sobre el contenido y las cuentas ofensivas, retirando el contenido y expulsando a quien lo publique cuando corresponda.</Punto>
          </ul>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Suspensión de cuentas</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            Podemos suspender o eliminar cuentas que incumplan estas reglas, para proteger a la
            comunidad.
          </p>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Sin garantías</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            B+ se ofrece "tal cual". Hacemos lo posible por mantenerla disponible y segura, pero no
            garantizamos que esté libre de errores o interrupciones. La validación por IA es una
            ayuda y puede equivocarse.
          </p>
        </div>
        <div>
          <b style={{ color: 'var(--ink)' }}>Cambios</b>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            Podemos actualizar esta política y estos términos. Si el cambio es importante, lo
            avisaremos dentro de la app.
          </p>
        </div>
      </Bloque>

      {/* ── CONTACTO ─────────────────────────────────────────────────── */}
      <Bloque id="contacto" titulo="Contacto">
        <p style={{ margin: 0 }}>
          Para dudas de privacidad, reportes o solicitudes sobre tus datos, escríbenos a{' '}
          <a href={`mailto:${CONTACTO}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{CONTACTO}</a>.
          Respondemos a los reportes de contenido lo antes posible.
        </p>
      </Bloque>
    </div>
  )
}

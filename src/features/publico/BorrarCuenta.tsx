import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { signOut } from '../auth/credentials'
import { COMERCIO } from './comercio'
import { MarcoPublico } from './Publico'

// rockie.plus/borrar-cuenta: borrar la cuenta completa de Rockie (Google Play y Apple piden que se pueda desde la
// app y desde una página web). Con sesión, se borra aquí con doble confirmación (función borrar-cuenta); sin
// sesión, se entra y se borra, o se pide por correo. Lo que se borra y lo que se conserva lo dice la función.

const PALABRA = 'BORRAR'

export function BorrarCuentaPage() {
  const { session, profile, loading } = useAuth()
  const [paso, setPaso] = useState<'leer' | 'confirmar' | 'borrando' | 'listo'>('leer')
  const [escrito, setEscrito] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Borrar tu cuenta · Rockie'
    return () => {
      document.title = 'Rockie'
    }
  }, [])

  async function borrar() {
    setPaso('borrando')
    setError(null)
    const { data, error: err } = await supabase.functions.invoke('borrar-cuenta', { body: {} })
    if (err || !(data as { ok?: boolean } | null)?.ok) {
      setPaso('confirmar')
      setError(`No se pudo borrar tu cuenta. Vuelve a intentarlo o escríbenos a ${COMERCIO.correo}.`)
      return
    }
    // el usuario ya no existe: cerrar sesión solo limpia este dispositivo
    await signOut()
    setPaso('listo')
  }

  return (
    <MarcoPublico>
      <article className="pub-legal pub-borrar">
        <h1>Borrar tu cuenta</h1>
        <p className="pub-legal-intro">
          Puedes borrar tu cuenta de Rockie y sus datos cuando quieras. Es inmediato y no se puede deshacer.
        </p>

        <section>
          <h2>Qué se borra</h2>
          <ul>
            <li>Tu cuenta y tu perfil.</li>
            <li>Tus hábitos, con sus fotos y rachas, y tus metas.</li>
            <li>Tus notas y pizarras del Cuaderno, tu agenda y tus conversaciones con Rockie.</li>
            <li>Los equipos en los que eras la única persona, con sus tareas y archivos.</li>
            <li>Tus archivos subidos y tu conexión con Google Calendar o con Claude.</li>
          </ul>
        </section>
        <section>
          <h2>Qué se conserva</h2>
          <ul>
            <li>Los comprobantes de pago, sin tu nombre, durante 5 años: lo exige la SUNAT.</li>
            <li>
              Lo que hiciste en equipos con más personas se queda en el equipo, sin autor. Si eras la dueña o el dueño, el equipo
              pasa al miembro más antiguo.
            </li>
          </ul>
          <p>Si tenías un plan de pago, se termina con la cuenta y no se vuelve a cobrar.</p>
        </section>

        <section className="pub-borrar-accion" aria-live="polite">
          {paso === 'listo' ? (
            <>
              <h2>Tu cuenta se borró</h2>
              <p>Gracias por haber usado Rockie. Si algún día vuelves, puedes crear una cuenta nueva.</p>
              <Link className="btn" to="/">
                Ir a rockie.plus
              </Link>
            </>
          ) : loading ? null : !session ? (
            <>
              <h2>Para borrarla</h2>
              <p>
                Entra con tu cuenta y vuelve a esta página: aquí mismo la borras. En la app también puedes, en Ajustes › Tu cuenta ›
                Eliminar cuenta.
              </p>
              <Link className="btn" to="/login?next=%2Fborrar-cuenta">
                Entrar y borrar mi cuenta
              </Link>
              <p className="pub-borrar-nota">
                ¿No puedes entrar? Pídelo escribiendo a <a href={`mailto:${COMERCIO.correo}?subject=Borrar%20mi%20cuenta`}>{COMERCIO.correo}</a>{' '}
                desde el correo de tu cuenta, o con tu usuario, y la borramos en un máximo de 10 días hábiles.
              </p>
            </>
          ) : paso === 'leer' ? (
            <>
              <h2>Borrar la cuenta de {profile?.display_name ?? session.user.email ?? 'esta sesión'}</h2>
              <button type="button" className="btn danger" onClick={() => setPaso('confirmar')}>
                <Icon name="trash" className="sm" /> Quiero borrar mi cuenta
              </button>
            </>
          ) : (
            <form
              className="pub-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (escrito.trim().toUpperCase() === PALABRA) void borrar()
              }}
            >
              <label className="lbl" htmlFor="borrar-confirma">
                Para confirmar, escribe {PALABRA}
              </label>
              <input
                id="borrar-confirma"
                value={escrito}
                onChange={(e) => setEscrito(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                disabled={paso === 'borrando'}
              />
              {error && (
                <p className="pub-borrar-error" role="alert">
                  {error}
                </p>
              )}
              <div className="pub-borrar-btns">
                <button type="submit" className="btn danger" disabled={escrito.trim().toUpperCase() !== PALABRA || paso === 'borrando'}>
                  {paso === 'borrando' ? 'Borrando…' : 'Borrar mi cuenta para siempre'}
                </button>
                <button type="button" className="btn ghost" disabled={paso === 'borrando'} onClick={() => (setPaso('leer'), setEscrito(''), setError(null))}>
                  No, mejor no
                </button>
              </div>
            </form>
          )}
        </section>
      </article>
    </MarcoPublico>
  )
}

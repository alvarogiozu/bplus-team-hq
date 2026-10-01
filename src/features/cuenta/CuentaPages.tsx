import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Icon, type IconName } from '../../components/Icon'
import { AccentPicker } from '../../components/AccentPicker'
import { ThemeChoice } from '../../components/ThemeChoice'
import { ColorPick, Select } from '../../components/Select'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE, TIMEZONES } from '../../lib/colors'
import { useIsMobile } from '../../lib/useMedia'
import { humanError, supabase } from '../../lib/supabase'
import { APPS } from '../../os/apps'
import { MovilTop } from '../../os/movil/MovilShell'
import { useAuth, useMe } from '../auth/AuthProvider'
import { signOut } from '../auth/credentials'
import { Avatar, CuentaBoton } from './Cuenta'

// Perfil y Ajustes: los de tu cuenta, iguales desde cualquier app (no hay unos por app).
// Lo propio de cada app (rutina de la Agenda, bóveda del Cuaderno, áreas del proyecto…) se abre desde aquí.

function Marco({ titulo, children }: { titulo: string; children: ReactNode }) {
  const mobile = useIsMobile()
  return (
    <>
      {mobile && <MovilTop />}
      <main className="cuenta-page">
        {!mobile && (
          <div className="cuenta-top">
            <Link to="/inicio" className="cuenta-volver">
              <Icon name="collapse" className="sm" /> Inicio
            </Link>
            <span className="mtop-sp" />
            <CuentaBoton />
          </div>
        )}
        <h1>{titulo}</h1>
        {children}
      </main>
    </>
  )
}

export function PerfilPage() {
  const { userId, profile } = useMe()
  const { session } = useAuth()
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(profile.display_name)

  async function guardar(patch: { display_name?: string; color?: string }) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: ['profile'] })
    toast('Perfil guardado', { kind: 'ok', icon: 'check' })
  }

  return (
    <Marco titulo="Perfil">
      <section className="cuenta-card cuenta-yo">
        <Avatar size={72} />
        <div>
          <b>{profile.display_name}</b>
          <small>@{profile.username}</small>
          {session?.user.email && <small>{session.user.email}</small>}
        </div>
      </section>

      <section className="cuenta-card">
        <h2>Cómo te ven</h2>
        <label className="lbl" htmlFor="p-nombre">Tu nombre</label>
        <div className="row">
          <input id="p-nombre" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
          <button className="btn sm" disabled={!nombre.trim() || nombre.trim() === profile.display_name} onClick={() => void guardar({ display_name: nombre.trim() })}>
            Guardar
          </button>
        </div>
        <label className="lbl">Tu color (tu inicial y tu Rockie en los proyectos)</label>
        <ColorPick value={profile.color} onChange={(c) => void guardar({ color: c })} palette={PALETTE} label="Tu color" size={32} />
      </section>
    </Marco>
  )
}

export function AjustesPage() {
  const { userId, profile } = useMe()
  const qc = useQueryClient()

  async function setTimezone(tz: string) {
    const { error } = await supabase.from('profiles').update({ timezone: tz }).eq('id', userId)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: ['profile'] })
  }

  const app = (id: string) => APPS.find((a) => a.id === id)!
  const deApp: { app: ReturnType<typeof app>; to: string; label: string; page?: boolean }[] = [
    { app: app('habitos'), to: '/habitos/ajustes', label: 'Recordatorios, sonidos y tu Rockie', page: true },
    { app: app('agenda'), to: '/agenda?ajustes=1', label: 'Tu rutina, dictado y Google Calendar' },
    { app: app('equipo'), to: '/proyecto/ajustes', label: 'El proyecto en el que estás: nombre, áreas y datos' },
    { app: app('cuaderno'), to: '/cuaderno?ajustes=1', label: 'Páginas, dictado, Claude y tu bóveda' },
  ]

  return (
    <Marco titulo="Ajustes">
      <section className="cuenta-card">
        <h2>Apariencia</h2>
        <p className="hint">El mismo tema y color en todas las apps (y en todas tus pestañas).</p>
        <ThemeChoice />
        <label className="lbl">Tu color principal</label>
        <AccentPicker />
      </section>

      <section className="cuenta-card">
        <h2>Tu cuenta</h2>
        <label className="lbl" htmlFor="a-tz">Zona horaria</label>
        <Select
          id="a-tz"
          label="Zona horaria"
          variant="field"
          searchable
          value={profile.timezone}
          onChange={setTimezone}
          options={Array.from(new Set([profile.timezone, ...TIMEZONES])).map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
        />
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 16 }}>
          <Link className="btn ghost sm" to="/cambiar-clave">
            <Icon name="key" className="sm" /> Cambiar contraseña
          </Link>
        </div>
      </section>

      <section className="cuenta-card">
        <h2>Privacidad</h2>
        <p className="hint">Lo que guardas en Rockie se cifra en tu dispositivo antes de salir. En tu Cofre está tu código de recuperación y cómo abrirlo en otro dispositivo.</p>
        <Link className="btn ghost sm" to="/cofre">
          <Icon name="lock" className="sm" /> Tu Cofre
        </Link>
      </section>

      <section className="cuenta-card">
        <h2>De cada app</h2>
        <nav className="cuenta-apps" aria-label="Ajustes de cada app">
          {deApp.map(({ app: a, to, label, page }) => {
            const inner = (
              <>
                <span className="os-tile sm" style={{ ['--app' as string]: a.color, ['--app-edge' as string]: a.edge } as CSSProperties}>
                  <Icon name={a.icon as IconName} />
                </span>
                <span className="cuenta-app-t">
                  <b>{a.name}</b>
                  <small>{label}</small>
                </span>
                <Icon name="chevron" className="sm cuenta-app-go" />
              </>
            )
            return page ? (
              <a key={a.id} href={to} className="cuenta-app">
                {inner}
              </a>
            ) : (
              <Link key={a.id} to={to} className="cuenta-app">
                {inner}
              </Link>
            )
          })}
        </nav>
      </section>

      <button className="btn danger sm cuenta-salir" onClick={() => signOut()}>
        <Icon name="logout" className="sm" /> Cerrar sesión
      </button>
    </Marco>
  )
}

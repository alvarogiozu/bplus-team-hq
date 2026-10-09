import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, type IconName } from '../../components/Icon'
import { AccentPicker } from '../../components/AccentPicker'
import { ThemeChoice } from '../../components/ThemeChoice'
import { ColorPick, Select } from '../../components/Select'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE, TIMEZONES } from '../../lib/colors'
import { useIsMobile } from '../../lib/useMedia'
import { NOMBRE_PLAN, usePlan } from '../../lib/planes'
import { humanError, supabase } from '../../lib/supabase'
import { APPS } from '../../os/apps'
import { fetchPerfilHabitos, guardarVidaMode, leerVidaMode, rockieLook, type VidaMode } from '../../os/habitos'
import { RockieArt } from '../../os/RockieArt'
import { empezarGuia } from '../../os/GuiaRockie'
import { MovilTop } from '../../os/movil/MovilShell'
import { useAuth, useMe } from '../auth/AuthProvider'
import { signOut } from '../auth/credentials'
import { Avatar, CuentaBoton } from './Cuenta'
import { esAppNativa } from '../../lib/appNativa'

// Perfil y Ajustes: los de tu cuenta, iguales desde cualquier app (no hay unos por app).
// En el celular son listas de filas grandes (una cosa por fila, 56 px, chevron): se leen de un vistazo y se tocan
// con el pulgar. Lo propio de cada app (rutina de la Agenda, bóveda del Cuaderno, áreas del proyecto…) se abre desde aquí.

export function Marco({ titulo, children }: { titulo: string; children: ReactNode }) {
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

/** Una fila de la lista: ícono con su color, título, detalle y chevron (o lo que va a la derecha). */
function Fila(p: {
  to?: string
  /** otra página del sitio (Hábitos): carga completa */
  href?: string
  onClick?: () => void
  icon: IconName
  /** color del ícono (una app); sin color, va suave */
  color?: string
  edge?: string
  titulo: string
  sub?: ReactNode
  derecha?: ReactNode
  peligro?: boolean
}) {
  const cls = `cuenta-fila${p.peligro ? ' peligro' : ''}`
  const inner = (
    <>
      <span className={`cuenta-fila-ic${p.color ? '' : ' suave'}`} style={p.color ? ({ ['--app' as string]: p.color, ['--app-edge' as string]: p.edge } as CSSProperties) : undefined}>
        <Icon name={p.icon} className="sm" />
      </span>
      <span className="cuenta-fila-t">
        <b>{p.titulo}</b>
        {p.sub && <small>{p.sub}</small>}
      </span>
      {p.derecha ?? <Icon name="chevron" className="sm cuenta-fila-go" />}
    </>
  )
  if (p.href) return <a href={p.href} className={cls}>{inner}</a>
  if (p.to) return <Link to={p.to} className={cls}>{inner}</Link>
  return (
    <button type="button" className={cls} onClick={p.onClick}>
      {inner}
    </button>
  )
}

export function PerfilPage() {
  const { userId, profile } = useMe()
  const { session } = useAuth()
  const qc = useQueryClient()
  const plan = usePlan()
  const [nombre, setNombre] = useState(profile.display_name)
  // tu Rockie, tu racha y tu código de amigo viven en Hábitos (misma sesión en este navegador)
  const hab = useQuery({ queryKey: ['os', 'perfil-habitos'], queryFn: fetchPerfilHabitos, staleTime: 60_000 })
  const look = useMemo(() => rockieLook(), [])
  const h = hab.data?.signedIn ? hab.data : null
  const enlace = h?.friendCode ? `${location.origin}/invita/${h.friendCode}` : ''

  async function guardar(patch: { display_name?: string; color?: string }) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: ['profile'] })
    toast('Perfil guardado', { kind: 'ok', icon: 'check' })
  }
  const copiar = async (texto: string, aviso: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      toast(aviso, { kind: 'ok', icon: 'check' })
    } catch {
      toastError('No se pudo copiar')
    }
  }
  const compartir = async () => {
    const texto = `Súmate a mis hábitos en Rockie: ${enlace}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Rockie', text: texto, url: enlace })
      } catch {
        /* lo cerró */
      }
    } else void copiar(enlace, 'Enlace copiado')
  }

  return (
    <Marco titulo="Perfil">
      <section className="cuenta-card cuenta-hero">
        <Avatar size={64} />
        <div className="cuenta-hero-t">
          <b>{profile.display_name}</b>
          <small>@{profile.username}</small>
          {session?.user.email && <small>{session.user.email}</small>}
          <span className="cuenta-plan">{NOMBRE_PLAN[plan.plan]}</span>
        </div>
        <span className="cuenta-rockie" aria-label="Tu Rockie">
          <RockieArt size={70} stone={look.stone} equipped={look.equipped} />
        </span>
      </section>
      {h && (
        <div className="cuenta-chips" aria-label="Tus números en Hábitos">
          <span>
            <Icon name="flame" /> {h.streak === 1 ? '1 día de racha' : `${h.streak} días de racha`}
          </span>
          <span>
            <Icon name="trophy" /> mejor {h.best}
          </span>
          <span>
            <Icon name="star" /> Nv {h.level}
          </span>
        </div>
      )}

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

      <section className="cuenta-card">
        <h2>Tu código de amigo</h2>
        {h?.friendCode ? (
          <>
            <p className="hint">Con él tus amigos te agregan en Hábitos: comparte el enlace o muéstrales tu QR.</p>
            <div className="cuenta-codigo">
              <code>{h.friendCode}</code>
              <button type="button" className="btn ghost sm" onClick={() => void copiar(h.friendCode!, 'Código copiado')}>
                <Icon name="copy" className="sm" /> Copiar
              </button>
              <button type="button" className="btn sm" onClick={() => void compartir()}>
                <Icon name="link" className="sm" /> Compartir
              </button>
            </div>
            <nav className="cuenta-lista" aria-label="Tu QR">
              <Fila href="/habitos/ajustes" icon="apps" titulo="Mi QR" sub="Para que te escaneen desde Hábitos" />
            </nav>
          </>
        ) : (
          <nav className="cuenta-lista">
            <Fila href="/habitos/hoy" icon="flame" color={APPS[0].color} edge={APPS[0].edge} titulo="Entra a Hábitos" sub={hab.isPending ? 'Buscando tu código…' : 'Ahí nace tu código de amigo y tu Rockie'} />
          </nav>
        )}
      </section>

      <section className="cuenta-card">
        <nav className="cuenta-lista" aria-label="Tu cuenta">
          <Fila to="/planes" icon="sparkle" titulo="Tu plan" sub={`Tienes ${NOMBRE_PLAN[plan.plan]}${plan.plan === 'gratis' && !esAppNativa() ? ' · mira qué trae Plus' : ''}`} />
          <Fila to="/cofre" icon="lock" titulo="Tu Cofre" sub="Tu código de recuperación y tus otros dispositivos" />
          <Fila to="/ajustes" icon="settings" titulo="Ajustes" sub="Tema, color, zona horaria y lo de cada app" />
          <Fila onClick={() => signOut()} icon="logout" titulo="Cerrar sesión" peligro derecha={<span />} />
        </nav>
      </section>
    </Marco>
  )
}

export function AjustesPage() {
  const { userId, profile } = useMe()
  const plan = usePlan()
  const qc = useQueryClient()

  async function setTimezone(tz: string) {
    const { error } = await supabase.from('profiles').update({ timezone: tz }).eq('id', userId)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: ['profile'] })
  }

  // Hábitos · tu mapa: la misma pregunta de su onboarding, también desde aquí (Hábitos la lee al cargar)
  const [vida, setVida] = useState<VidaMode>(leerVidaMode)
  const elegirVida = (m: VidaMode) => {
    guardarVidaMode(m)
    setVida(m)
    toast(m === 'metas' ? 'Hábitos mostrará solo tus metas' : 'Hábitos mostrará tus áreas con sus metas', { kind: 'ok', icon: 'check' })
  }
  const MAPAS: { id: VidaMode; icon: IconName; titulo: string; sub: string; color: string; edge: string }[] = [
    { id: 'areas', icon: 'apps', titulo: 'Áreas y metas', sub: 'Cuerpo, Mente y Alma · la pestaña se llama Vida', color: '#4a7c3f', edge: '#3a622f' },
    { id: 'metas', icon: 'goal', titulo: 'Solo metas', sub: 'Directo al grano · la pestaña se llama Metas', color: '#2e88aa', edge: '#216b87' },
  ]
  const verTutorialHabitos = () => {
    try {
      localStorage.removeItem('bplus.seenGestureCoach')
      localStorage.removeItem('bplus.coachStep')
    } catch {
      /* sin almacenamiento */
    }
    location.assign('/habitos/hoy')
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
        <h2>Hábitos · tu mapa</h2>
        <p className="hint">Lo que te preguntamos al empezar. Cambiarlo no borra nada: tus metas guardan su área.</p>
        <div className="cuenta-opciones" role="group" aria-label="Tu mapa en Hábitos">
          {MAPAS.map((o) => (
            <button
              key={o.id}
              type="button"
              className="cuenta-opcion"
              aria-pressed={vida === o.id}
              onClick={() => elegirVida(o.id)}
              style={{ ['--k' as string]: o.color, ['--ke' as string]: o.edge } as CSSProperties}
            >
              <Icon name={o.icon} />
              <b>{o.titulo}</b>
              <small>{o.sub}</small>
            </button>
          ))}
        </div>
        <nav className="cuenta-lista" aria-label="Tutoriales" style={{ marginTop: 8 }}>
          <Fila onClick={empezarGuia} icon="sparkle" titulo="Volver a ver la guía de Rockie OS" sub="Un minuto: hablarme, las apps, la rueda, las secciones" />
          <Fila onClick={verTutorialHabitos} icon="flame" titulo="Volver a ver el tutorial de Hábitos" sub="Rockie te guía paso a paso por Hoy, Vida, Juntos y Progreso" />
        </nav>
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
        <nav className="cuenta-lista" aria-label="Tu cuenta" style={{ marginTop: 12 }}>
          <Fila to="/perfil" icon="user" titulo="Perfil" sub="Tu nombre, tu color y tu código de amigo" />
          <Fila to="/cambiar-clave" icon="key" titulo="Cambiar contraseña" />
          <Fila to="/planes" icon="sparkle" titulo="Tu plan" sub={`Tienes ${NOMBRE_PLAN[plan.plan]}${plan.plan !== 'gratis' ? ' · hasta cuándo y lo que incluye' : esAppNativa() ? '' : ' · mira qué trae Plus y cómo activarlo'}`} />
          <Fila to="/cofre" icon="lock" titulo="Tu Cofre" sub="Lo que guardas se cifra en tu dispositivo. Aquí está tu código de recuperación" />
        </nav>
      </section>

      <section className="cuenta-card">
        <h2>De cada app</h2>
        <nav className="cuenta-lista" aria-label="Ajustes de cada app">
          {deApp.map(({ app: a, to, label, page }) => (
            <Fila key={a.id} to={page ? undefined : to} href={page ? to : undefined} icon={a.icon as IconName} color={a.color} edge={a.edge} titulo={a.name} sub={label} />
          ))}
        </nav>
      </section>

      <button className="btn danger sm cuenta-salir" onClick={() => signOut()}>
        <Icon name="logout" className="sm" /> Cerrar sesión
      </button>
    </Marco>
  )
}

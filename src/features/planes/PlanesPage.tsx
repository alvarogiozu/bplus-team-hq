import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { toast, toastError } from '../../components/Toasts'
import { NOMBRE_PLAN, PLAN_KEY, PRECIOS, soles, usePlan, type Clave, type PlanId } from '../../lib/planes'
import { humanError, supabase } from '../../lib/supabase'
import { useAuth, useMe } from '../auth/AuthProvider'
import { Marco } from '../cuenta/CuentaPages'
import { pagoEnLinea } from '../../lib/culqi'
import { ComprarPlan } from './Comprar'
import { TARJETAS } from './tarjetas'
import './planes.css'

// Tus planes: cuál tienes, cuánto llevas usado, qué trae cada uno y cómo activarlo. Mientras Culqi no esté
// conectado, el plan se activa con un código de fundador (docs/negocio/modelo-de-negocio.md, sección 10).

const CUPOS: { c: Clave; nombre: string; usado: (p: ReturnType<typeof usePlan>) => number }[] = [
  { c: 'pizarras_dia', nombre: 'Pizarras nuevas hoy', usado: (p) => p.pizarras_hoy },
  { c: 'notas_compartidas', nombre: 'Páginas compartidas', usado: (p) => p.notas_compartidas },
  { c: 'equipos', nombre: 'Equipos creados', usado: (p) => p.equipos },
  { c: 'buscar_hueco_mes', nombre: 'Huecos en común usados este mes', usado: (p) => p.uso_mes.buscar_hueco_mes ?? 0 },
  { c: 'ia_rockie_mes', nombre: 'Mensajes con Rockie este mes', usado: (p) => p.uso_mes.ia_rockie_mes ?? 0 },
  { c: 'ia_notas_mes', nombre: 'Pedidos a Rockie sobre tus notas', usado: (p) => p.uso_mes.ia_notas_mes ?? 0 },
  { c: 'ia_aprender_mes', nombre: '«Aprender» este mes', usado: (p) => p.uso_mes.ia_aprender_mes ?? 0 },
]

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

export default function PlanesPage() {
  const plan = usePlan()
  const { userId } = useMe()
  const { session } = useAuth()
  const qc = useQueryClient()
  const activar = useRef<HTMLElement>(null)
  const [codigo, setCodigo] = useState('')
  const [equipo, setEquipo] = useState('')
  const [pideEquipo, setPideEquipo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [comprar, setComprar] = useState<'plus' | 'pro' | 'club' | null>(null)
  const [estudianteMsg, setEstudianteMsg] = useState('')

  // tus equipos (los que creaste): a uno de ellos va un código Club
  const misEquipos = useQuery({
    queryKey: ['planes', 'mis-equipos', userId],
    enabled: pideEquipo,
    queryFn: async () => {
      const { data, error } = await supabase.from('spaces').select('id, name').eq('created_by', userId)
      if (error) throw error
      return data ?? []
    },
  })

  const estudiante = Boolean(plan.estudiante_hasta)

  async function canjear() {
    const c = codigo.trim().toUpperCase()
    if (!c) return
    if (pideEquipo && !equipo) return toastError('Elige el equipo que recibe el plan Club.')
    setEnviando(true)
    const { data, error } = await supabase.rpc('canjear_codigo' as never, { p_codigo: c, p_space: pideEquipo ? equipo : null } as never)
    setEnviando(false)
    if (error) {
      if ((error as { hint?: string }).hint === 'NECESITA_EQUIPO') {
        setPideEquipo(true)
        return toast('Este código es de plan Club: elige el equipo que lo recibe.', { icon: 'star' })
      }
      return toastError(humanError(error))
    }
    const r = data as unknown as { plan: PlanId | 'club'; hasta: string | null }
    setCodigo('')
    setPideEquipo(false)
    setEquipo('')
    await qc.invalidateQueries({ queryKey: PLAN_KEY })
    toast(`¡Listo! Plan ${NOMBRE_PLAN[r.plan]} activado${r.hasta ? ` hasta el ${fecha(r.hasta)}` : ''}.`, { kind: 'ok', icon: 'check', ms: 5000 })
  }

  async function verificar() {
    setVerificando(true)
    setEstudianteMsg('')
    const { data, error } = await supabase.rpc('verificar_estudiante' as never)
    setVerificando(false)
    if (error) return toastError(humanError(error))
    const r = data as unknown as { ok: boolean; motivo?: string; universidad?: string }
    if (r.ok) {
      await qc.invalidateQueries({ queryKey: PLAN_KEY })
      return toast(`¡Verificado! Estudiante de ${r.universidad}.`, { kind: 'ok', icon: 'check' })
    }
    const dominio = session?.user.email?.split('@')[1]
    setEstudianteMsg(
      r.motivo === 'sin_correo'
        ? 'Tu cuenta no tiene un correo confirmado. Entra con la cuenta de Google de tu universidad y vuelve a intentarlo.'
        : `Todavía no tenemos tu universidad${dominio ? ` (@${dominio})` : ''}. Escríbenos y la agregamos; mientras, entra con el correo de tu universidad si tienes otro.`,
    )
  }

  const actual = plan.plan
  const enLinea = pagoEnLinea()
  // Club siempre (va con un equipo); Plus/Pro: no un plan menor que el tuyo, ni renovar uno sin vencimiento
  const RANGO = { gratis: 0, plus: 1, pro: 2 }
  const puedeComprar = (id: PlanId | 'club') =>
    id === 'club' || (id !== 'gratis' && (RANGO[id] > RANGO[actual] || (id === actual && Boolean(plan.hasta))))
  const conLimite = CUPOS.filter(({ c }) => plan.limite(c) !== null)

  return (
    <Marco titulo="Tu plan">
      <section className="cuenta-card pl-actual">
        <div className="pl-actual-top">
          <span className={`pl-chip pl-${actual}`}>
            <Icon name={actual === 'gratis' ? 'star' : 'sparkle'} className="sm" /> {NOMBRE_PLAN[actual]}
          </span>
          <span className="pl-actual-t">
            {actual === 'gratis'
              ? 'Usas Rockie gratis. Todo lo esencial, sin fecha de vencimiento.'
              : `${plan.tarifa === 'fundador' ? 'Precio fundador' : plan.tarifa === 'estudiante' ? 'Precio de estudiante' : 'Precio normal'} · ${plan.hasta ? `hasta el ${fecha(plan.hasta)}` : 'sin vencimiento'}`}
          </span>
        </div>
        {estudiante && (
          <p className="pl-est-ok">
            <Icon name="check" className="sm" /> Estudiante verificado hasta el {fecha(plan.estudiante_hasta!)}
          </p>
        )}
        {conLimite.length > 0 && (
          <ul className="pl-cupos" aria-label="Lo que llevas usado">
            {conLimite.map(({ c, nombre, usado }) => {
              const l = plan.limite(c)!
              const u = Math.min(usado(plan), l)
              return (
                <li key={c}>
                  <span className="pl-cupo-t">
                    {nombre}
                    <b>
                      {u} de {l}
                    </b>
                  </span>
                  <span className="pl-barra" role="progressbar" aria-valuemin={0} aria-valuemax={l} aria-valuenow={u} aria-label={nombre}>
                    <span style={{ width: `${l ? (u / l) * 100 : 0}%` }} className={u >= l ? 'lleno' : ''} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="pl-grid">
        {TARJETAS.map((t) => {
          const es = t.id === actual
          return (
            <article key={t.id} className={`pl-card pl-${t.id}${es ? ' es' : ''}`} aria-label={`Plan ${NOMBRE_PLAN[t.id]}`}>
              {es && <span className="pl-tuyo">Tu plan</span>}
              <h2>{NOMBRE_PLAN[t.id]}</h2>
              <p className="pl-lema">{t.lema}</p>
              <p className="pl-precio">
                <b>{t.precio}</b>
                {t.nota && <small>{t.nota}</small>}
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
              {t.id !== 'gratis' && puedeComprar(t.id) && (
                <button
                  className="btn sm block"
                  onClick={() =>
                    enLinea ? setComprar(t.id as 'plus' | 'pro' | 'club') : activar.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                >
                  {!enLinea ? `Activar ${NOMBRE_PLAN[t.id]}` : es ? 'Renovar' : t.id === 'club' ? 'Suscribir mi club' : 'Suscribirme'}
                </button>
              )}
            </article>
          )
        })}
      </div>

      <section className="cuenta-card" ref={activar}>
        <h2>{enLinea ? '¿Tienes un código?' : 'Activar un plan'}</h2>
        <p className="hint">
          {enLinea ? (
            <>
              Si te dieron un <b>código de fundador</b> o de regalo, actívalo aquí: los fundadores mantienen su precio para siempre.
            </>
          ) : (
            <>
              El pago en línea (Yape y tarjeta) llega muy pronto. Mientras tanto, los primeros usuarios activan su plan con un <b>código de fundador</b>{' '}
              y mantienen ese precio para siempre. Pídele tu código al equipo de Rockie.
            </>
          )}
        </p>
        <label className="lbl" htmlFor="pl-codigo">
          Tu código
        </label>
        <div className="row">
          <input
            id="pl-codigo"
            value={codigo}
            autoComplete="off"
            spellCheck={false}
            placeholder="ROCKIE-XXXX"
            maxLength={40}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && void canjear()}
          />
          <button className="btn sm" disabled={!codigo.trim() || enviando} onClick={() => void canjear()}>
            {enviando ? 'Activando…' : 'Activar'}
          </button>
        </div>
        {pideEquipo && (
          <div className="pl-equipo">
            <label className="lbl">¿Qué equipo será Club?</label>
            {misEquipos.data && misEquipos.data.length === 0 ? (
              <p className="hint">Primero crea el equipo de tu club en Proyectos; después vuelve aquí con el código.</p>
            ) : (
              <Select
                label="Equipo"
                variant="field"
                value={equipo}
                onChange={setEquipo}
                options={[{ value: '', label: misEquipos.isLoading ? 'Cargando tus equipos…' : 'Elige un equipo' }, ...(misEquipos.data ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              />
            )}
          </div>
        )}
      </section>

      <section className="cuenta-card">
        <h2>Precio de estudiante</h2>
        {estudiante ? (
          <p className="hint">
            Ya estás verificado: Plus te cuesta <b>{soles(PRECIOS.plus.estudiante)} al mes</b>. Se renueva cada año con tu correo de la universidad.
          </p>
        ) : (
          <>
            <p className="hint">
              Con el correo de tu universidad, Plus te cuesta <b>{soles(PRECIOS.plus.estudiante)} al mes</b> en lugar de {soles(PRECIOS.plus.normal)}. Solo
              guardamos que eres estudiante y hasta cuándo.
            </p>
            <button className="btn ghost sm" disabled={verificando} onClick={() => void verificar()}>
              <Icon name="check" className="sm" /> {verificando ? 'Revisando…' : 'Verificar con mi correo'}
            </button>
            {estudianteMsg && <p className="pl-est-msg">{estudianteMsg}</p>}
          </>
        )}
      </section>

      <section className="cuenta-card pl-dudas">
        <h2>Dudas rápidas</h2>
        <details>
          <summary>¿Qué pasa si vuelvo a Gratis?</summary>
          <p>Nada se borra. Todo lo que creaste sigue ahí y funciona igual; solo no puedes crear más de lo que permite el plan Gratis.</p>
        </details>
        <details>
          <summary>¿Y mis datos?</summary>
          <p>El Cofre es para todos los planes: lo que guardas se cifra en tu dispositivo y nadie, ni el equipo de Rockie, puede leerlo.</p>
        </details>
        <details>
          <summary>¿Qué es el plan Club?</summary>
          <p>Es para el equipo de un club u organización: lo paga el club y sus miembros usan todo lo del club gratis, sin límite de personas.</p>
        </details>
        <details>
          <summary>¿Se cobra solo cada mes?</summary>
          <p>No. Pagas un mes o un año y el plan dura eso; para seguir, lo renuevas tú desde aquí. Nada de cobros sorpresa.</p>
        </details>
      </section>
      {comprar && <ComprarPlan plan={comprar} estudiante={estudiante} onClose={() => setComprar(null)} />}
    </Marco>
  )
}

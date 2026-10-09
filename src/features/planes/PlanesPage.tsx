import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { toast, toastError } from '../../components/Toasts'
import { NOMBRE_PLAN, PLAN_KEY, PRECIOS, soles, usePlan, type Clave, type PlanId } from '../../lib/planes'
import type { Periodo, PlanPago } from '../../lib/precios'
import { humanError, supabase } from '../../lib/supabase'
import { useAuth, useMe } from '../auth/AuthProvider'
import { Marco } from '../cuenta/CuentaPages'
import { pagoEnLinea } from '../../lib/culqi'
import { esAppNativa, plataformaNativa, TEXTO_PLAN_NATIVO } from '../../lib/appNativa'
import { ComprarPlan } from './Comprar'
import { AvisosCard, ClubesCard, InvitarCard, PausaCard, RenovacionCard, type PedirCompra } from './MiSuscripcion'
import { TARJETAS } from './tarjetas'
import './planes.css'

// Tus planes: cuál tienes, cuánto llevas usado, qué trae cada uno y cómo activarlo o renovarlo (Yape o tarjeta,
// con renovación automática si quieres), pausarlo, avisos por correo e invitar amigos. Los códigos de fundador
// siguen funcionando (docs/negocio/modelo-de-negocio.md, sección 10).

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
  const [comprar, setComprar] = useState<{ plan: PlanPago; periodo?: Periodo; equipo?: string; metodo?: 'yape' | 'tarjeta'; catalogo?: boolean } | null>(null)
  const [estudianteMsg, setEstudianteMsg] = useState('')
  const [reanudando, setReanudando] = useState(false)
  const [params, setParams] = useSearchParams()
  const pedir: PedirCompra = (o) => setComprar(o)

  // rockie.plus/planes?renovar=1 (el botón de los correos de aviso): abre «Renovar» con lo mismo de la última vez
  const { cargado, ultimo_pago: ultimoPago, suscripcion } = plan
  useEffect(() => {
    if (!params.has('renovar') || !cargado) return
    const p = (ultimoPago?.plan ?? suscripcion?.plan) as PlanPago | undefined
    if (p && pagoEnLinea() && !esAppNativa()) setComprar({ plan: p, periodo: ultimoPago?.plan === p ? ultimoPago.periodo : undefined })
    params.delete('renovar')
    setParams(params, { replace: true })
  }, [params, setParams, cargado, ultimoPago, suscripcion])

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

  // rockie.plus/planes?comprar=plus&periodo=anio[&tarifa=estudiante] (el catálogo de la página pública): abre el pago
  // de ese producto. El precio de estudiante pide verificar el correo de la universidad primero.
  const estudianteRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const p = params.get('comprar')
    if (!p || !cargado) return
    if (p === 'plus' || p === 'pro' || p === 'club') {
      const per = params.get('periodo')
      const periodo = per === 'mes' || per === 'ciclo' || per === 'anio' ? per : undefined
      if (params.get('tarifa') === 'estudiante' && !estudiante) {
        setEstudianteMsg('Primero verifica el correo de tu universidad: así Plus te sale a precio de estudiante.')
        setTimeout(() => estudianteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
      } else setComprar({ plan: p, periodo, catalogo: true })
    }
    for (const k of ['comprar', 'periodo', 'tarifa']) params.delete(k)
    setParams(params, { replace: true })
  }, [params, setParams, cargado, estudiante])

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
  // dentro de la app de Android/iPhone no se vende nada (lib/appNativa): solo tu plan, tus cupos y tu código
  const nativa = esAppNativa()
  const enLinea = pagoEnLinea() && !nativa
  // Club siempre (va con un equipo); Plus/Pro: no un plan menor que el tuyo, ni renovar uno sin vencimiento
  const RANGO = { gratis: 0, plus: 1, pro: 2 }
  const puedeComprar = (id: PlanId | 'club') =>
    id === 'club' || (id !== 'gratis' && (RANGO[id] > RANGO[actual] || (id === actual && Boolean(plan.hasta))))
  const conLimite = CUPOS.filter(({ c }) => plan.limite(c) !== null)

  // cómo está tu plan, en una línea (y qué hacer si está por vencer, venció o está en pausa)
  const s = plan.suscripcion
  const precioTxt = s?.origen === 'regalo' ? 'Mes de regalo' : s?.tarifa === 'fundador' ? 'Precio fundador' : s?.tarifa === 'estudiante' ? 'Precio de estudiante' : 'Precio normal'
  const linea =
    !s || plan.estado === 'gratis'
      ? 'Usas Rockie gratis. Todo lo esencial, sin fecha de vencimiento.'
      : plan.estado === 'pausado'
        ? `Tu ${NOMBRE_PLAN[s.plan]} está en pausa hasta el ${s.pausa_hasta ? fecha(s.pausa_hasta) : ''}: vuelve solo con sus ${s.pausa_restante_dias} días.`
        : plan.estado === 'vencido'
          ? `Tu ${NOMBRE_PLAN[s.plan]} venció el ${s.hasta ? fecha(s.hasta) : ''}. Todo lo que creaste sigue aquí.`
          : plan.estado === 'gracia'
            ? `Venció el ${s.hasta ? fecha(s.hasta) : ''}: lo mantienes hasta el ${s.gracia_hasta ? fecha(s.gracia_hasta) : ''}.`
            : !s.hasta
              ? `${precioTxt} · sin vencimiento`
              : `${precioTxt} · ${plan.estado === 'por_vencer' ? 'vence' : 'hasta'} el ${fecha(s.hasta)}${plan.renovacion?.activa ? ' · se renueva solo' : ''}`
  const renovarAhora = () => s && setComprar({ plan: s.plan, periodo: plan.ultimo_pago?.plan === s.plan ? plan.ultimo_pago.periodo : undefined })

  async function reanudar() {
    setReanudando(true)
    const { error } = await supabase.rpc('reanudar_plan' as never)
    setReanudando(false)
    if (error) return toastError(humanError(error))
    await qc.invalidateQueries({ queryKey: PLAN_KEY })
    toast('¡Bienvenido de vuelta! Tu plan está activo otra vez.', { kind: 'ok', icon: 'check' })
  }

  return (
    <Marco titulo="Tu plan">
      <section className="cuenta-card pl-actual">
        <div className="pl-actual-top">
          <span className={`pl-chip pl-${actual}`}>
            <Icon name={actual === 'gratis' ? 'star' : 'sparkle'} className="sm" /> {NOMBRE_PLAN[actual]}
          </span>
          <span className={`pl-actual-t${plan.estado === 'por_vencer' || plan.estado === 'gracia' ? ' pl-ojo' : ''}`}>{linea}</span>
        </div>
        {s && (plan.estado === 'gracia' || plan.estado === 'vencido' || (plan.estado === 'por_vencer' && !plan.renovacion?.activa)) && enLinea && (
          <div className="row">
            <button className="btn sm" onClick={renovarAhora}>
              <Icon name="loop" className="sm" /> {plan.estado === 'vencido' ? `Volver a ${NOMBRE_PLAN[s.plan]}` : 'Renovar en dos toques'}
            </button>
          </div>
        )}
        {plan.estado === 'pausado' && (
          <div className="row">
            <button className="btn sm" disabled={reanudando} onClick={() => void reanudar()}>
              {reanudando ? 'Reanudando…' : 'Reanudar ahora'}
            </button>
          </div>
        )}
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

      {enLinea && <RenovacionCard plan={plan} pedir={pedir} />}
      <PausaCard plan={plan} />
      {enLinea && <ClubesCard plan={plan} pedir={pedir} />}

      {nativa && plataformaNativa() === 'android' && (
        <section className="cuenta-card">
          <p className="hint">{TEXTO_PLAN_NATIVO}</p>
        </section>
      )}

      {!nativa && <div className="pl-grid">
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
                    enLinea
                      ? setComprar({
                          plan: t.id as PlanPago,
                          periodo: es && plan.ultimo_pago?.plan === t.id ? plan.ultimo_pago.periodo : undefined,
                        })
                      : activar.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                >
                  {!enLinea ? `Activar ${NOMBRE_PLAN[t.id]}` : es ? 'Renovar' : t.id === 'club' ? 'Suscribir mi club' : 'Suscribirme'}
                </button>
              )}
            </article>
          )
        })}
      </div>}

      <section className="cuenta-card" ref={activar}>
        <h2>{enLinea || nativa ? '¿Tienes un código?' : 'Activar un plan'}</h2>
        <p className="hint">
          {nativa ? (
            <>Si te dieron un código de regalo, actívalo aquí.</>
          ) : enLinea ? (
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

      {!nativa && (
        <>
      <section className="cuenta-card" ref={estudianteRef}>
        <h2>Precio de estudiante</h2>
        {estudiante ? (
          <p className="hint">
            Ya estás verificado: Plus te cuesta <b>{soles(PRECIOS.plus.estudiante)} al mes</b> o <b>{soles(PRECIOS.plus.ciclo)} por ciclo</b> (4 meses, un solo
            pago). Se renueva cada año con tu correo de la universidad.
          </p>
        ) : (
          <>
            <p className="hint">
              Con el correo de tu universidad, Plus te cuesta <b>{soles(PRECIOS.plus.estudiante)} al mes</b> en lugar de {soles(PRECIOS.plus.normal)}, o{' '}
              <b>{soles(PRECIOS.plus.ciclo)} por todo el ciclo</b>. Solo guardamos que eres estudiante y hasta cuándo.
            </p>
            <button className="btn ghost sm" disabled={verificando} onClick={() => void verificar()}>
              <Icon name="check" className="sm" /> {verificando ? 'Revisando…' : 'Verificar con mi correo'}
            </button>
            {estudianteMsg && <p className="pl-est-msg">{estudianteMsg}</p>}
          </>
        )}
      </section>

      <InvitarCard />
      <AvisosCard plan={plan} />

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
          <p>
            Solo si tú lo eliges: al pagar con tarjeta puedes marcar «Renovar automáticamente». Te avisamos antes de cada cobro y lo cancelas en un clic aquí.
            Con Yape (o sin esa casilla) pagas un mes, un ciclo o un año y lo renuevas tú en dos toques. Nada de cobros sorpresa.
          </p>
        </details>
        <details>
          <summary>¿Y si se me pasa la fecha?</summary>
          <p>Te guardamos tu plan 3 días más para que lo renueves sin perder nada. Después vuelves a Gratis, con todo lo que creaste.</p>
        </details>
        <details>
          <summary>¿Puedo pausar mi plan?</summary>
          <p>Sí, una vez al año, 1 o 2 meses (vacaciones, fin de ciclo). Mientras tanto usas Gratis y tus días te esperan: vuelve solo.</p>
        </details>
        <details>
          <summary>¿Cómo funciona invitar a un amigo?</summary>
          <p>Le mandas tu link. Cuando se suscribe a cualquier plan, los dos ganan 1 mes gratis (si estás en Gratis, un mes de Plus). Hasta 12 meses al año.</p>
        </details>
      </section>
        </>
      )}
      {comprar && (
        <ComprarPlan
          plan={comprar.plan}
          periodo={comprar.periodo}
          equipo={comprar.equipo}
          metodo={comprar.metodo}
          catalogo={comprar.catalogo}
          estudiante={estudiante}
          onClose={() => setComprar(null)}
        />
      )}
    </Marco>
  )
}

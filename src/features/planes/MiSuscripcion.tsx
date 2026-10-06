import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { toast, toastError } from '../../components/Toasts'
import { NOMBRE_PLAN, PLAN_KEY, soles, usePlan, type Renovacion } from '../../lib/planes'
import { CADA, precioDe, usePrecios, type Periodo, type PlanPago } from '../../lib/precios'
import { humanError, supabase } from '../../lib/supabase'
import { linkDeInvitacion } from './referidos'

// Lo de tu suscripción en «Tu plan»: renovación automática, pausa, tus clubes, avisos por correo e invitar amigos.
// Todo se cambia con un clic y nada castiga: cancelar la renovación no te quita lo que ya pagaste.

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
type Plan = ReturnType<typeof usePlan>
export type PedirCompra = (o: { plan: PlanPago; periodo?: Periodo; equipo?: string; metodo?: 'yape' | 'tarjeta' }) => void

const tarjeta = (r: Renovacion) => `${r.marca ?? 'tarjeta'}${r.ultimos4 ? ` •••• ${r.ultimos4}` : ''}`

function useRefrescar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: PLAN_KEY })
}

async function rpc(nombre: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nombre as never, args as never)
  if (error) throw error
  return data as unknown
}

/** Activar/cancelar la renovación automática o quitar la tarjeta (de tu plan o de un club). */
function useRenovacion(space?: string) {
  const refrescar = useRefrescar()
  const [ocupado, setOcupado] = useState(false)
  const correr = async (f: () => Promise<unknown>, ok: string) => {
    setOcupado(true)
    try {
      await f()
      await refrescar()
      toast(ok, { kind: 'ok', icon: 'check' })
      return true
    } catch (e) {
      toastError(humanError(e as Error) || 'No se pudo. Inténtalo de nuevo.')
      return false
    } finally {
      setOcupado(false)
    }
  }
  return {
    ocupado,
    activar: () => correr(() => rpc('renovacion_activa', { p_activa: true, p_space: space ?? null }), 'Listo: se renovará solo.'),
    cancelar: () => correr(() => rpc('renovacion_activa', { p_activa: false, p_space: space ?? null }), 'Renovación automática cancelada. Sigues con todo hasta que venza.'),
    quitar: () =>
      correr(async () => {
        const { data, error } = await supabase.functions.invoke('culqi-cobro', { body: { accion: 'quitar_tarjeta', space_id: space ?? null } })
        if (error || !(data as { ok?: boolean } | null)?.ok) throw new Error('No se pudo quitar la tarjeta.')
      }, 'Tarjeta quitada: Culqi la borró y ya no se renovará solo.'),
  }
}

/** Renovación automática de tu plan. */
export function RenovacionCard({ plan, pedir }: { plan: Plan; pedir: PedirCompra }) {
  const precios = usePrecios()
  const s = plan.suscripcion
  const r = plan.renovacion
  const acc = useRenovacion()
  const [confirmar, setConfirmar] = useState(false)
  const vigente = s?.hasta && ['activo', 'por_vencer', 'gracia'].includes(plan.estado)
  if (!r && !(vigente && s && (s.origen === 'culqi' || s.origen === 'regalo'))) return null
  const tarifa = s?.tarifa === 'estudiante' ? 'estudiante' : 'normal'
  const precio = r ? precioDe(precios, (r.plan ?? s?.plan ?? 'plus') as PlanPago, tarifa, r.periodo) ?? precioDe(precios, (r.plan ?? 'plus') as PlanPago, tarifa, 'mes') : null

  return (
    <section className="cuenta-card pl-seccion" aria-label="Renovación automática">
      <h2>
        <Icon name="loop" className="sm" /> Renovación automática
      </h2>
      {!r ? (
        <>
          <p className="hint">¿Se te pasa renovar? Paga con tarjeta y marca «Renovar automáticamente»: te avisamos antes de cada cobro y la cancelas en un clic.</p>
          <div className="row">
            <button className="btn ghost sm" onClick={() => s && pedir({ plan: s.plan, periodo: plan.ultimo_pago?.periodo, metodo: 'tarjeta' })}>
              <Icon name="lock" className="sm" /> Renovar con tarjeta
            </button>
          </div>
        </>
      ) : r.activa && r.intentos > 0 ? (
        <>
          <p className="pl-alerta" role="alert">
            <Icon name="flag" className="sm" /> No pudimos renovar con tu {tarjeta(r)}: {r.error || 'el banco no aprobó el cobro'}.
            {r.intentos < 3 ? ' Lo volveremos a intentar mañana.' : ' Ya no lo intentaremos de nuevo.'}
          </p>
          <div className="row">
            <button className="btn sm" onClick={() => s && pedir({ plan: s.plan, periodo: r.periodo })}>
              Renovar ahora con Yape u otra tarjeta
            </button>
            <button className="btn ghost sm" disabled={acc.ocupado} onClick={() => void acc.quitar()}>
              Quitar tarjeta
            </button>
          </div>
        </>
      ) : r.activa ? (
        <>
          <p className="hint">
            Se renueva solo{s?.hasta ? <> el <b>{fecha(s.hasta)}</b></> : null} con tu <b>{tarjeta(r)}</b>
            {precio ? ` · ${soles(precio.centimos / 100)} ${CADA[precio.periodo]}` : ''}. Te avisamos antes.
          </p>
          <div className="row">
            <button className="btn ghost sm" disabled={acc.ocupado} onClick={() => setConfirmar(true)}>
              Cancelar renovación
            </button>
            <button className="btn ghost sm" disabled={acc.ocupado} onClick={() => void acc.quitar()}>
              Quitar tarjeta
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Apagada: tu plan dura hasta el {s?.hasta ? fecha(s.hasta) : 'final de lo que pagaste'} y después vuelves a Gratis. Tu {tarjeta(r)} sigue guardada en
            Culqi por si la quieres usar.
          </p>
          <div className="row">
            {vigente && (
              <button className="btn sm" disabled={acc.ocupado} onClick={() => void acc.activar()}>
                Renovar solo con {tarjeta(r)}
              </button>
            )}
            <button className="btn ghost sm" disabled={acc.ocupado} onClick={() => void acc.quitar()}>
              Quitar tarjeta
            </button>
          </div>
        </>
      )}
      {confirmar && (
        <Sheet
          open
          onClose={() => setConfirmar(false)}
          title="¿Cancelar la renovación automática?"
          footer={
            <div className="pl-lim-pie">
              <button className="btn ghost sm" data-autofocus onClick={() => setConfirmar(false)}>
                Mantenerla
              </button>
              <button
                className="btn sm"
                disabled={acc.ocupado}
                onClick={() => void acc.cancelar().then((ok) => ok && setConfirmar(false))}
              >
                Sí, cancelar
              </button>
            </div>
          }
        >
          <div className="pl-lim">
            <p>
              Tu {s ? NOMBRE_PLAN[s.plan] : 'plan'} sigue con todo hasta el {s?.hasta ? fecha(s.hasta) : 'final de lo que pagaste'}. Después vuelves a Gratis: no
              se borra nada.
            </p>
            {s?.puede_pausar && (
              <p className="pl-lim-mejora">
                <Icon name="clock" className="sm" /> ¿Es por un tiempo? Mejor pausa tu plan 1 o 2 meses (más abajo): no pagas mientras tanto y no pierdes tus días.
              </p>
            )}
          </div>
        </Sheet>
      )}
    </section>
  )
}

/** Pausar tu plan (vacaciones, fin de ciclo) en vez de irte. */
export function PausaCard({ plan }: { plan: Plan }) {
  const refrescar = useRefrescar()
  const s = plan.suscripcion
  const [meses, setMeses] = useState<1 | 2 | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // en pausa, «Reanudar» está arriba (en tu plan); aquí solo se ofrece pausar
  if (!s || !s.puede_pausar) return null
  const nombre = NOMBRE_PLAN[s.plan]
  const dias = s.hasta ? Math.max(1, Math.ceil((new Date(s.hasta).getTime() - Date.now()) / 864e5)) : 0
  const vuelve = (m: number) => {
    const d = new Date()
    d.setMonth(d.getMonth() + m)
    return d.toISOString()
  }

  async function correr(f: () => Promise<unknown>, ok: string) {
    setOcupado(true)
    try {
      await f()
      await refrescar()
      toast(ok, { kind: 'ok', icon: 'check', ms: 6000 })
      setMeses(null)
    } catch (e) {
      toastError(humanError(e as Error) || 'No se pudo. Inténtalo de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="cuenta-card pl-seccion" aria-label="Pausar tu plan">
      <h2>
        <Icon name="clock" className="sm" /> Pausar tu plan
      </h2>
      <p className="hint">
        ¿Vacaciones o fin de ciclo? Congela tu {nombre} 1 o 2 meses: mientras tanto usas Gratis y tus {dias} días te esperan. Una vez al año.
      </p>
      <div className="row">
        <button className="btn ghost sm" onClick={() => setMeses(1)}>
          Pausar 1 mes
        </button>
        <button className="btn ghost sm" onClick={() => setMeses(2)}>
          Pausar 2 meses
        </button>
      </div>
      {meses && (
        <Sheet
          open
          onClose={() => setMeses(null)}
          title={`¿Pausar tu ${nombre} ${meses === 1 ? '1 mes' : '2 meses'}?`}
          footer={
            <div className="pl-lim-pie">
              <button className="btn ghost sm" onClick={() => setMeses(null)} disabled={ocupado}>
                No, seguir
              </button>
              <button
                className="btn sm"
                data-autofocus
                disabled={ocupado}
                onClick={() => void correr(() => rpc('pausar_plan', { p_meses: meses }), `Listo: tu ${nombre} vuelve solo el ${fecha(vuelve(meses))}.`)}
              >
                Pausar
              </button>
            </div>
          }
        >
          <div className="pl-lim">
            <p>
              Desde hoy usas Gratis (no se borra nada). El <b>{fecha(vuelve(meses))}</b> tu {nombre} vuelve solo con tus {dias} días. Si quieres volver antes, lo
              reanudas aquí cuando quieras.
            </p>
            {plan.renovacion?.activa && <p>La renovación automática se corre también: no se cobra nada mientras dure la pausa.</p>}
          </div>
        </Sheet>
      )}
    </section>
  )
}

/** Los planes Club de tus equipos: hasta cuándo, si se renuevan solos, y renovar. */
export function ClubesCard({ plan, pedir }: { plan: Plan; pedir: PedirCompra }) {
  const ids = plan.clubes.map((c) => c.space_id)
  const nombres = useQuery({
    queryKey: ['planes', 'clubes-nombres', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 600_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('spaces').select('id, name').in('id', ids)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((s) => [s.id, s.name])) as Record<string, string>
    },
  })
  if (ids.length === 0) return null
  return (
    <section className="cuenta-card pl-seccion" aria-label="Tus clubes">
      <h2>
        <Icon name="team" className="sm" /> Tus clubes
      </h2>
      <ul className="pl-clubes">
        {plan.clubes.map((c) => (
          <Club key={c.space_id} c={c} nombre={nombres.data?.[c.space_id]} pedir={pedir} />
        ))}
      </ul>
    </section>
  )
}

function Club({ c, nombre, pedir }: { c: ReturnType<typeof usePlan>['clubes'][number]; nombre?: string; pedir: PedirCompra }) {
  const acc = useRenovacion(c.space_id)
  const r = c.renovacion
  const estado =
    c.estado === 'por_vencer' ? `vence el ${fecha(c.hasta)}` : c.estado === 'gracia' ? 'venció: 3 días de gracia' : c.estado === 'vencido' ? 'venció' : `hasta el ${fecha(c.hasta)}`
  return (
    <li>
      <span className="pl-club-t">
        <b>{nombre ?? 'Tu equipo'}</b>
        <small className={c.estado === 'activo' ? '' : 'pl-club-ojo'}>
          Club · {estado}
          {r?.activa ? ` · se renueva solo con ${tarjeta(r)}` : ''}
        </small>
      </span>
      <span className="row">
        {r?.activa ? (
          <button className="btn ghost sm" disabled={acc.ocupado} onClick={() => void acc.cancelar()}>
            Cancelar renovación
          </button>
        ) : (
          <button className="btn sm" onClick={() => pedir({ plan: 'club', equipo: c.space_id, periodo: r?.periodo })}>
            Renovar
          </button>
        )}
        {r && (
          <button className="btn ghost sm" disabled={acc.ocupado} onClick={() => void acc.quitar()}>
            Quitar tarjeta
          </button>
        )}
      </span>
    </li>
  )
}

/** El correo para avisarte antes de que venza (solo si lo quieres). */
export function AvisosCard({ plan }: { plan: Plan }) {
  const refrescar = useRefrescar()
  const [editando, setEditando] = useState(false)
  const [correo, setCorreo] = useState(plan.avisos_correo ?? '')
  const [ocupado, setOcupado] = useState(false)
  if (!plan.suscripcion && !plan.ultimo_pago && !plan.avisos_correo) return null

  async function guardar(valor: string) {
    setOcupado(true)
    try {
      await rpc('avisos_correo', { p_correo: valor })
      await refrescar()
      setEditando(false)
      toast(valor ? 'Listo: te avisaremos antes de que venza.' : 'Listo: ya no te escribiremos.', { kind: 'ok', icon: 'check' })
    } catch (e) {
      toastError(humanError(e as Error) || 'No se pudo guardar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="cuenta-card pl-seccion" aria-label="Avisos por correo">
      <h2>
        <Icon name="send" className="sm" /> Avisos por correo
      </h2>
      {plan.avisos_correo && !editando ? (
        <>
          <p className="hint">
            Te escribimos a <b>{plan.avisos_correo}</b> unos días antes de que venza tu plan (y si una renovación no pasa). Nada de publicidad.
          </p>
          <div className="row">
            <button className="btn ghost sm" onClick={() => setEditando(true)}>
              Cambiar correo
            </button>
            <button className="btn ghost sm" disabled={ocupado} onClick={() => void guardar('')}>
              Quitar avisos
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">Deja tu correo y te avisamos unos días antes de que venza tu plan. Solo eso.</p>
          <div className="row">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-label="Tu correo para avisos"
              placeholder="tucorreo@gmail.com"
              maxLength={120}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && correo.trim() && void guardar(correo.trim())}
            />
            <button className="btn sm" disabled={!correo.trim() || ocupado} onClick={() => void guardar(correo.trim())}>
              Guardar
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** Invita a un amigo: cuando paga su primer plan, los dos ganan 1 mes. */
export function InvitarCard() {
  const q = useQuery({
    queryKey: ['planes', 'invitacion'],
    staleTime: 60_000,
    queryFn: async () => (await rpc('mi_invitacion')) as { codigo: string; invitados: number; premiados: number },
  })
  const [copiado, setCopiado] = useState(false)
  const link = q.data ? linkDeInvitacion(q.data.codigo) : ''
  const mensaje = `Te invito a Rockie: tu agenda, tus notas y tus hábitos en un solo lugar, con IA. Si te suscribes con mi link, los dos ganamos 1 mes gratis: ${link}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      toastError('No se pudo copiar. Mantén presionado el link para copiarlo.')
    }
  }
  async function compartir() {
    try {
      await navigator.share({ title: 'Rockie', text: mensaje })
    } catch {
      /* la persona cerró el menú de compartir */
    }
  }

  return (
    <section className="cuenta-card pl-seccion pl-invitar" aria-label="Invita a un amigo">
      <h2>
        <Icon name="star" className="sm" /> Invita a un amigo, ganan los dos
      </h2>
      <p className="hint">
        Cuando tu amigo se suscriba a cualquier plan con tu link, <b>los dos ganan 1 mes gratis</b>. Si estás en Gratis, ese mes es de Plus.
      </p>
      {q.isError ? (
        <p className="hint">No se pudo cargar tu link. Revisa tu conexión.</p>
      ) : (
        <>
          <div className="pl-link">
            <code aria-label="Tu link de invitación">{q.data ? link.replace('https://', '') : 'Preparando tu link…'}</code>
            <button className="btn sm" disabled={!q.data} onClick={() => void copiar()}>
              <Icon name={copiado ? 'check' : 'copy'} className="sm" /> {copiado ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
          <div className="row">
            <a className="btn ghost sm" href={q.data ? `https://wa.me/?text=${encodeURIComponent(mensaje)}` : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!q.data}>
              <Icon name="whatsapp" className="sm" /> Enviar por WhatsApp
            </a>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button className="btn ghost sm" disabled={!q.data} onClick={() => void compartir()}>
                <Icon name="link" className="sm" /> Compartir
              </button>
            )}
          </div>
          {q.data && q.data.invitados > 0 && (
            <p className="pl-est-ok">
              <Icon name="check" className="sm" /> Invitaste a {q.data.invitados} {q.data.invitados === 1 ? 'persona' : 'personas'}
              {q.data.premiados > 0 ? ` · ganaste ${q.data.premiados} ${q.data.premiados === 1 ? 'mes' : 'meses'}` : ''}
            </p>
          )}
        </>
      )}
    </section>
  )
}

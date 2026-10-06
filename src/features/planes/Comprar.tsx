import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { toast } from '../../components/Toasts'
import { huella3DS, modoPrueba, tarjetaConCulqi, tokenYape, verificar3DS, type Resultado3DS } from '../../lib/culqi'
import { NOMBRE_PLAN, PLAN_KEY, soles, usePlan } from '../../lib/planes'
import { CADA, DURACION, precioDe, usePrecios, type Periodo, type PlanPago } from '../../lib/precios'
import { supabase } from '../../lib/supabase'
import { useAuth, useMe } from '../auth/AuthProvider'
import { guardarRecuerdo, leerRecuerdo } from './recuerdo'

// Suscribirte (o renovar) Plus, Pro o Club: mensual, por ciclo (estudiantes) o anual, con Yape o tarjeta.
// - Yape se paga aquí mismo: celular + código de aprobación de la app Yape (el token se pide a Culqi desde aquí).
// - La tarjeta se escribe en el formulario seguro de Culqi; si el banco pide verificar (3DS), lo hace su ventana.
// - Con tarjeta puedes dejar que se renueve solo (Culqi guarda la tarjeta; Rockie solo sabe «Visa •••• 1234»).
// El monto lo decide el servidor (planes_precios); aquí solo se muestra.

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
const DOMINIO_CUENTAS = `@${(import.meta.env.VITE_AUTH_EMAIL_DOMAIN as string | undefined) || 'hq.rockie.plus'}`
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Respuesta = {
  ok?: boolean
  prueba?: boolean
  revisar?: boolean
  error?: string
  hasta?: string | null
  renovacion?: boolean
  regalo?: boolean
}
type Fase = '' | 'yape' | 'tarjeta' | 'cobrando' | 'banco'
const TEXTO_FASE: Record<Exclude<Fase, ''>, string> = {
  yape: 'Pidiendo el pago a Yape…',
  tarjeta: 'Esperando tu tarjeta…',
  cobrando: 'Confirmando tu pago…',
  banco: 'Tu banco está verificando…',
}

async function cobrar(body: Record<string, unknown>): Promise<Respuesta> {
  const { data, error } = await supabase.functions.invoke('culqi-cobro', { body })
  if (!error) return (data ?? {}) as Respuesta
  // el mensaje de la función (p. ej. «Fondos insuficientes») viene en el cuerpo
  let msg = (data as { error?: string } | null)?.error
  if (!msg && 'context' in error) {
    msg = await (error as { context: Response }).context
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined)
  }
  return { error: msg || 'El pago no pasó. Inténtalo de nuevo.' }
}

export function ComprarPlan({
  plan,
  estudiante,
  onClose,
  periodo: periodoInicial,
  equipo: equipoInicial,
  metodo: metodoInicial,
  catalogo,
}: {
  plan: PlanPago
  estudiante: boolean
  onClose: () => void
  /** «Renovar»: el mismo periodo que la última vez */
  periodo?: Periodo
  /** plan Club: el equipo ya elegido */
  equipo?: string
  /** p. ej. «activar la renovación automática» abre directo con tarjeta */
  metodo?: 'yape' | 'tarjeta'
  /** viene del catálogo de la página pública: el periodo es el elegido allí, no una renovación */
  catalogo?: boolean
}) {
  const { userId } = useMe()
  const { session } = useAuth()
  const mi = usePlan()
  const qc = useQueryClient()
  const precios = usePrecios()
  const rec = useMemo(leerRecuerdo, [])
  const tarifa = plan === 'plus' && estudiante ? 'estudiante' : 'normal'
  const de = (p: Periodo) => precioDe(precios, plan, tarifa, p)
  const opciones = (['mes', 'ciclo', 'anio'] as Periodo[]).filter((p) => de(p))
  const mes = de('mes')
  // el anual va primero elegido (es lo que más conviene); al renovar, lo mismo que la última vez
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial && de(periodoInicial) ? periodoInicial : de('anio') ? 'anio' : 'mes')
  const [metodo, setMetodo] = useState<'yape' | 'tarjeta'>(metodoInicial ?? rec.metodo ?? 'yape')
  const [celular, setCelular] = useState(rec.celular ?? '')
  const [codigo, setCodigo] = useState('')
  const [renovar, setRenovar] = useState(true)
  const [nombre, setNombre] = useState(rec.nombre ?? '')
  const [ciudad, setCiudad] = useState(rec.ciudad ?? 'Lima')
  const correoCuenta = session?.user.email && !session.user.email.endsWith(DOMINIO_CUENTAS) ? session.user.email : ''
  const [correo, setCorreo] = useState(rec.correo || mi.avisos_correo || correoCuenta)
  const [avisos, setAvisos] = useState(true)
  const [equipo, setEquipo] = useState(equipoInicial ?? '')
  const [fase, setFase] = useState<Fase>('')
  const [error, setError] = useState('')
  const elegido = de(periodo)
  const renovando = !catalogo && Boolean(periodoInicial) && (plan === 'club' || mi.suscripcion?.plan === plan)

  const misEquipos = useQuery({
    queryKey: ['planes', 'mis-equipos', userId],
    enabled: plan === 'club',
    queryFn: async () => {
      const { data, error } = await supabase.from('spaces').select('id, name').eq('created_by', userId)
      if (error) throw error
      return data ?? []
    },
  })

  /** cuánto ahorras frente a pagar mes a mes */
  const ahorro = (p: Periodo) => {
    const x = de(p)
    return x && mes && p !== 'mes' ? mes.centimos * x.meses - x.centimos : 0
  }

  async function pagar() {
    if (!elegido || fase) return
    setError('')
    const email = correo.trim().toLowerCase()
    if (!CORREO.test(email)) return setError('Escribe tu correo: ahí te llega el comprobante.')
    if (plan === 'club' && !equipo) return setError('Elige el equipo que será Club.')
    const cel = celular.replace(/\D/g, '').replace(/^51(?=\d{9}$)/, '')
    const base = { plan, periodo, email, space_id: plan === 'club' ? equipo : null }
    let r: Respuesta
    try {
      if (metodo === 'yape') {
        if (!/^9\d{8}$/.test(cel)) return setError('Escribe tu celular de Yape (9 dígitos).')
        if (!/^\d{6}$/.test(codigo)) return setError('Escribe el código de aprobación de Yape (6 dígitos).')
        setFase('yape')
        const token = await tokenYape({ celular: cel, codigo, centimos: elegido.centimos })
        setFase('cobrando')
        r = await cobrar({ ...base, token })
      } else {
        let cliente: Record<string, string> | undefined
        if (renovar) {
          const partes = nombre.trim().split(/\s+/).filter(Boolean)
          if (partes.length < 2) return setError('Para que se renueve solo, Culqi pide tu nombre y apellido.')
          if (!/^9\d{8}$/.test(cel)) return setError('Escribe tu celular (9 dígitos).')
          if (ciudad.trim().length < 2) return setError('Escribe tu ciudad.')
          cliente = { nombre: partes[0], apellido: partes.slice(1).join(' '), celular: cel, ciudad: ciudad.trim() }
        }
        setFase('tarjeta')
        const [device, pago] = await Promise.all([
          huella3DS(),
          tarjetaConCulqi({ titulo: 'Rockie', descripcion: `${NOMBRE_PLAN[plan]} · ${DURACION[periodo]}`, centimos: elegido.centimos }),
        ])
        if (!pago) return setFase('')
        setFase('cobrando')
        const cuerpo = { ...base, token: pago.token, device, renovar, cliente }
        r = await cobrar(cuerpo)
        if (r.revisar) {
          // el banco pide verificar que eres tú (3DS): su ventana, y se cobra con el mismo token
          setFase('banco')
          const tds: Resultado3DS = await verificar3DS({ token: pago.token, centimos: elegido.centimos, email })
          setFase('cobrando')
          r = await cobrar({ ...cuerpo, tds })
        }
      }
    } catch (e) {
      setFase('')
      setCodigo('')
      return setError(e instanceof Error ? e.message : 'El pago no pasó. Inténtalo de nuevo.')
    }
    setFase('')
    if (!r.ok) {
      setCodigo('') // el código de Yape sirve una sola vez
      return setError(r.revisar ? 'Tu banco no confirmó el pago. Prueba con Yape u otra tarjeta.' : r.error || 'El pago no pasó. Inténtalo de nuevo.')
    }
    guardarRecuerdo({ metodo, correo: email, ...(cel ? { celular: cel } : {}), ...(renovar && metodo === 'tarjeta' ? { nombre: nombre.trim(), ciudad: ciudad.trim() } : {}) })
    if (r.prueba) {
      toast('Pago de prueba aprobado por Culqi. En modo prueba no se activa el plan.', { kind: 'ok', icon: 'check', ms: 6000 })
      return onClose()
    }
    if (avisos && email !== mi.avisos_correo) await supabase.rpc('avisos_correo' as never, { p_correo: email } as never)
    await qc.invalidateQueries({ queryKey: PLAN_KEY })
    window.dispatchEvent(new Event('hq:celebrate'))
    const hasta = r.hasta ? ` hasta el ${fecha(r.hasta)}` : ''
    toast(
      r.regalo
        ? `¡Listo! Tienes ${NOMBRE_PLAN[plan]}${hasta}: incluye 1 mes de regalo por llegar invitado.`
        : r.renovacion
          ? `¡Listo! ${NOMBRE_PLAN[plan]}${hasta}. Se renovará solo; lo cancelas cuando quieras en Tu plan.`
          : `¡Listo! Ya tienes ${NOMBRE_PLAN[plan]}${hasta}.`,
      { kind: 'ok', icon: 'check', ms: 7000 },
    )
    onClose()
  }

  const ocupado = Boolean(fase)
  return (
    <Sheet
      open
      onClose={() => !ocupado && onClose()}
      title={`${renovando ? 'Renovar' : 'Suscribirte a'} ${NOMBRE_PLAN[plan]}`}
      footer={
        <div className="pl-lim-pie">
          <button className="btn ghost sm" onClick={onClose} disabled={ocupado}>
            Ahora no
          </button>
          <button className="btn sm" data-autofocus onClick={() => void pagar()} disabled={!elegido || ocupado}>
            <Icon name="lock" className="sm" />{' '}
            {fase ? TEXTO_FASE[fase] : `Pagar ${elegido ? soles(elegido.centimos / 100) : ''} con ${metodo === 'yape' ? 'Yape' : 'tarjeta'}`}
          </button>
        </div>
      }
    >
      <div className="pl-comprar">
        {modoPrueba && (
          <p className="pl-prueba" role="note">
            <Icon name="clock" className="sm" />
            <span>
              <b>Pagos en modo de prueba.</b> Culqi está revisando nuestra tienda: por ahora no se cobra dinero real y el plan no se activa. Puedes
              probar con las tarjetas o el Yape de prueba de Culqi, o activar tu plan con un código de fundador.
            </span>
          </p>
        )}
        <div className="pl-periodos" role="radiogroup" aria-label="Cada cuánto pagas">
          {opciones.map((p) => {
            const x = de(p)!
            const ah = ahorro(p)
            return (
              <button key={p} role="radio" aria-checked={periodo === p} className={periodo === p ? 'on' : ''} onClick={() => setPeriodo(p)} disabled={ocupado}>
                <b>
                  {p === 'mes' ? 'Mensual' : p === 'ciclo' ? 'Por ciclo' : 'Anual'}
                  {p === 'anio' && <em className="pl-reco">Recomendado</em>}
                </b>
                <span>
                  {soles(x.centimos / 100)}
                  {p === 'mes' ? ' al mes' : p === 'ciclo' ? ' por 4 meses' : ' al año'}
                  {p !== 'mes' && ` · ${soles(x.centimos / x.meses / 100)} al mes`}
                </span>
                {ah > 0 && <span className="pl-ahorro">Ahorras {soles(ah / 100)}</span>}
              </button>
            )
          })}
        </div>
        {tarifa === 'estudiante' && (
          <p className="pl-est-ok">
            <Icon name="check" className="sm" /> Precio de estudiante{opciones.includes('ciclo') ? ' · el ciclo dura un semestre' : ''}
          </p>
        )}

        {plan === 'club' && (
          <div>
            <label className="lbl">¿Qué equipo será Club?</label>
            {misEquipos.data && misEquipos.data.length === 0 ? (
              <p className="hint">Primero crea el equipo de tu club en Proyectos.</p>
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

        <div className="pl-metodos" role="radiogroup" aria-label="Cómo pagas">
          <button role="radio" aria-checked={metodo === 'yape'} className={metodo === 'yape' ? 'on' : ''} onClick={() => setMetodo('yape')} disabled={ocupado}>
            <b>Yape</b>
            <span>Con tu celular, sin tarjeta</span>
          </button>
          <button role="radio" aria-checked={metodo === 'tarjeta'} className={metodo === 'tarjeta' ? 'on' : ''} onClick={() => setMetodo('tarjeta')} disabled={ocupado}>
            <b>Tarjeta</b>
            <span>Débito o crédito</span>
          </button>
        </div>

        {metodo === 'yape' ? (
          <div className="pl-campos">
            <div>
              <label className="lbl" htmlFor="pl-cel">
                Tu celular de Yape
              </label>
              <input
                id="pl-cel"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={11}
                placeholder="9XX XXX XXX"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                disabled={ocupado}
              />
            </div>
            <div>
              <label className="lbl" htmlFor="pl-otp">
                Código de aprobación
              </label>
              <input
                id="pl-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6 dígitos"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && void pagar()}
                disabled={ocupado}
              />
            </div>
            <p className="hint pl-campos-ancho">
              <Icon name="clock" className="sm" />
              <span>
                En tu app de Yape toca <b>Menú → Código de aprobación</b>. Dura poco: búscalo justo antes de pagar.
                {elegido && elegido.centimos >= 50000 && ' Si Yape no te deja por tu límite diario, paga con tarjeta.'}
              </span>
            </p>
          </div>
        ) : (
          <div className="pl-campos">
            <label className="pl-check pl-campos-ancho">
              <input type="checkbox" checked={renovar} onChange={(e) => setRenovar(e.target.checked)} disabled={ocupado} />
              <span>
                <b>Renovar automáticamente {CADA[periodo]}</b>
                <small>Te avisamos antes de cada cobro y lo cancelas en un clic desde Tu plan.</small>
              </span>
            </label>
            {renovar && (
              <>
                <div className="pl-campos-ancho">
                  <label className="lbl" htmlFor="pl-nombre">
                    Nombre y apellido
                  </label>
                  <input id="pl-nombre" autoComplete="name" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={ocupado} />
                </div>
                <div>
                  <label className="lbl" htmlFor="pl-cel-t">
                    Celular
                  </label>
                  <input
                    id="pl-cel-t"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={11}
                    placeholder="9XX XXX XXX"
                    value={celular}
                    onChange={(e) => setCelular(e.target.value)}
                    disabled={ocupado}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="pl-ciudad">
                    Ciudad
                  </label>
                  <input id="pl-ciudad" autoComplete="address-level2" maxLength={30} value={ciudad} onChange={(e) => setCiudad(e.target.value)} disabled={ocupado} />
                </div>
                <p className="hint pl-campos-ancho">Culqi los pide para guardar tu tarjeta de forma segura. Rockie no los guarda.</p>
              </>
            )}
          </div>
        )}

        <div className="pl-campos">
          <div className="pl-campos-ancho">
            <label className="lbl" htmlFor="pl-correo">
              Tu correo (te llega el comprobante)
            </label>
            <input
              id="pl-correo"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={120}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              disabled={ocupado}
            />
          </div>
          <label className="pl-check pl-campos-ancho">
            <input type="checkbox" checked={avisos} onChange={(e) => setAvisos(e.target.checked)} disabled={ocupado} />
            <span>
              <b>Avísame por correo antes de que venza</b>
            </span>
          </label>
        </div>

        <p className="hint">
          {metodo === 'yape'
            ? `Pagas ${elegido ? soles(elegido.centimos / 100) : ''} con Yape a través de Culqi. El plan se activa al instante y dura ${DURACION[periodo]}; para seguir, lo renuevas en dos toques.`
            : renovar
              ? `Tu tarjeta la escribes en el formulario seguro de Culqi. El plan se activa al instante y se renueva ${CADA[periodo]} hasta que lo canceles.`
              : `Tu tarjeta la escribes en el formulario seguro de Culqi. El plan se activa al instante y dura ${DURACION[periodo]}; sin cobros automáticos.`}
        </p>
        {error && (
          <p className="formerror" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}

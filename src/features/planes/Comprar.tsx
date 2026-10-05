import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { toast } from '../../components/Toasts'
import { pagarConCulqi } from '../../lib/culqi'
import { NOMBRE_PLAN, PLAN_KEY, soles } from '../../lib/planes'
import { usePrecios, type Periodo, type PlanPago } from '../../lib/precios'
import { supabase } from '../../lib/supabase'
import { useMe } from '../auth/AuthProvider'

// Suscribirse a Plus, Pro o Club: mensual o anual, con el precio de estudiante si estás verificado. El monto lo
// decide el servidor (planes_precios); aquí solo se muestra. Pagas en el formulario de Culqi (tarjeta o Yape).

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

export function ComprarPlan({ plan, estudiante, onClose }: { plan: PlanPago; estudiante: boolean; onClose: () => void }) {
  const { userId } = useMe()
  const qc = useQueryClient()
  const precios = usePrecios()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [equipo, setEquipo] = useState('')
  const [cobrando, setCobrando] = useState(false)
  const [error, setError] = useState('')
  const tarifa = plan === 'plus' && estudiante ? 'estudiante' : 'normal'
  const de = (p: Periodo) => precios.find((x) => x.plan === plan && x.tarifa === tarifa && x.periodo === p)
  const mes = de('mes')
  const anio = de('anio')
  const elegido = de(periodo)
  const ahorro = mes && anio ? Math.round((1 - anio.centimos / (mes.centimos * 12)) * 100) : 0

  const misEquipos = useQuery({
    queryKey: ['planes', 'mis-equipos', userId],
    enabled: plan === 'club',
    queryFn: async () => {
      const { data, error } = await supabase.from('spaces').select('id, name').eq('created_by', userId)
      if (error) throw error
      return data ?? []
    },
  })

  async function pagar() {
    if (!elegido) return
    if (plan === 'club' && !equipo) return setError('Elige el equipo que será Club.')
    setError('')
    let pago: { token: string; email: string } | null
    try {
      pago = await pagarConCulqi({
        titulo: 'Rockie',
        descripcion: `${NOMBRE_PLAN[plan]} · ${periodo === 'anio' ? '1 año' : '1 mes'}`,
        centimos: elegido.centimos,
      })
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'No se pudo abrir el pago.')
    }
    if (!pago) return
    setCobrando(true)
    const { data, error: e } = await supabase.functions.invoke('culqi-cobro', {
      body: { plan, periodo, token: pago.token, email: pago.email, space_id: plan === 'club' ? equipo : null },
    })
    setCobrando(false)
    if (e || !data?.ok) {
      // el mensaje de la función (p. ej. «Fondos insuficientes») viene en el cuerpo
      let msg = (data as { error?: string } | null)?.error
      if (!msg && e && 'context' in e) msg = await (e as { context: Response }).context.json().then((b: { error?: string }) => b.error).catch(() => undefined)
      return setError(msg || 'El pago no pasó. Inténtalo de nuevo.')
    }
    if (data.prueba) {
      toast('Pago de prueba aprobado por Culqi. En modo prueba no se activa el plan.', { kind: 'ok', icon: 'check', ms: 6000 })
      return onClose()
    }
    await qc.invalidateQueries({ queryKey: PLAN_KEY })
    toast(`¡Listo! Ya tienes ${NOMBRE_PLAN[plan]}${data.hasta ? ` hasta el ${fecha(data.hasta)}` : ''}.`, { kind: 'ok', icon: 'check', ms: 6000 })
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Suscribirte a ${NOMBRE_PLAN[plan]}`}
      footer={
        <div className="pl-lim-pie">
          <button className="btn ghost sm" onClick={onClose} disabled={cobrando}>
            Ahora no
          </button>
          <button className="btn sm" data-autofocus onClick={() => void pagar()} disabled={!elegido || cobrando}>
            <Icon name="lock" className="sm" /> {cobrando ? 'Confirmando tu pago…' : `Pagar ${elegido ? soles(elegido.centimos / 100) : ''}`}
          </button>
        </div>
      }
    >
      <div className="pl-comprar">
        <div className="pl-periodos" role="radiogroup" aria-label="Cada cuánto pagas">
          {mes && (
            <button role="radio" aria-checked={periodo === 'mes'} className={periodo === 'mes' ? 'on' : ''} onClick={() => setPeriodo('mes')}>
              <b>Mensual</b>
              <span>{soles(mes.centimos / 100)} al mes</span>
            </button>
          )}
          {anio && (
            <button role="radio" aria-checked={periodo === 'anio'} className={periodo === 'anio' ? 'on' : ''} onClick={() => setPeriodo('anio')}>
              <b>Anual {ahorro > 0 && <em>−{ahorro}%</em>}</b>
              <span>
                {soles(anio.centimos / 100)} al año · {soles(anio.centimos / 1200)} al mes
              </span>
            </button>
          )}
        </div>
        {tarifa === 'estudiante' && (
          <p className="pl-est-ok">
            <Icon name="check" className="sm" /> Precio de estudiante
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
        <p className="hint">
          Pagas con tarjeta o Yape en el formulario seguro de Culqi: tus datos de pago no pasan por Rockie. El plan se activa al instante y dura{' '}
          {periodo === 'anio' ? 'un año' : 'un mes'}; para seguir, vuelves a pagar (sin cobros automáticos).
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

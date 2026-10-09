import { useQuery } from '@tanstack/react-query'
import type { Periodo, PlanPago, Precio } from '../../lib/precios'
import { supabase } from '../../lib/supabase'

// Qué tarifa te cobran: estudiante verificado (Plus) > fundador (Plus y Pro, cuando los precios nuevos están activos)
// > normal. La decide la base (planes_tarifa_de, la misma regla que usa culqi-cobro); aquí solo se muestra.

export type Tarifa = 'normal' | 'estudiante' | 'fundador'

/** Tu tarifa para ese plan. El estudiante verificado manda (la app ya lo sabe aunque la consulta vaya atrasada). */
export function useMiTarifa(plan: PlanPago, estudiante: boolean): Tarifa {
  const q = useQuery({
    queryKey: ['planes', 'tarifa', plan],
    staleTime: 600_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mi_tarifa' as never, { p_plan: plan } as never)
      if (error) throw error
      return data as unknown as Tarifa
    },
  })
  if (plan === 'plus' && estudiante) return 'estudiante'
  return q.data === 'fundador' ? 'fundador' : 'normal'
}

/** El precio de esa tarifa; si esa tarifa no tiene ese periodo, el normal. */
export const precioTarifa = (precios: Precio[], plan: PlanPago, tarifa: Tarifa | string | null | undefined, periodo: Periodo) =>
  precios.find((x) => x.plan === plan && (x.tarifa as string) === (tarifa ?? 'normal') && x.periodo === periodo) ??
  precios.find((x) => x.plan === plan && x.tarifa === 'normal' && x.periodo === periodo)

/** El interruptor de los precios nuevos está prendido (existen precios de fundador). */
export const preciosNuevos = (precios: Precio[]) => precios.some((x) => (x.tarifa as string) === 'fundador')

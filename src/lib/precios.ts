import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

// Precios de los planes (en céntimos de sol). Viven en la base (planes_precios): los lee la página pública,
// la de Tu plan y el cobro (la Edge Function culqi-cobro cobra con estos, nunca con lo que mande el navegador).

export type PlanPago = 'plus' | 'pro' | 'club'
/** mes = 1 mes · ciclo = 4 meses (un semestre, solo estudiantes) · anio = 12 meses */
export type Periodo = 'mes' | 'ciclo' | 'anio'
export type Precio = { plan: PlanPago; tarifa: 'normal' | 'estudiante'; periodo: Periodo; centimos: number; meses: number }

/** Los mismos de las migraciones 20261011120000 y 20261013120000 (por si la base no respondió todavía). */
export const PRECIOS_RESPALDO: Precio[] = [
  { plan: 'plus', tarifa: 'normal', periodo: 'mes', centimos: 1990, meses: 1 },
  { plan: 'plus', tarifa: 'normal', periodo: 'anio', centimos: 19100, meses: 12 },
  { plan: 'plus', tarifa: 'estudiante', periodo: 'mes', centimos: 1290, meses: 1 },
  { plan: 'plus', tarifa: 'estudiante', periodo: 'ciclo', centimos: 4490, meses: 4 },
  { plan: 'plus', tarifa: 'estudiante', periodo: 'anio', centimos: 12380, meses: 12 },
  { plan: 'pro', tarifa: 'normal', periodo: 'mes', centimos: 3490, meses: 1 },
  { plan: 'pro', tarifa: 'normal', periodo: 'anio', centimos: 33500, meses: 12 },
  { plan: 'club', tarifa: 'normal', periodo: 'mes', centimos: 9900, meses: 1 },
  { plan: 'club', tarifa: 'normal', periodo: 'anio', centimos: 95000, meses: 12 },
]

export function usePrecios(): Precio[] {
  return (
    useQuery({
      queryKey: ['planes', 'precios'],
      staleTime: 3600_000,
      queryFn: async () => {
        const { data, error } = await supabase.from('planes_precios' as never).select('plan, tarifa, periodo, centimos, meses')
        if (error) throw error
        const filas = data as unknown as Precio[] | null
        return filas?.length ? filas : PRECIOS_RESPALDO
      },
    }).data ?? PRECIOS_RESPALDO
  )
}

export const precioDe = (precios: Precio[], plan: PlanPago, tarifa: Precio['tarifa'], periodo: Periodo) =>
  precios.find((x) => x.plan === plan && x.tarifa === tarifa && x.periodo === periodo)

/** «1 mes», «4 meses», «1 año» */
export const DURACION: Record<Periodo, string> = { mes: '1 mes', ciclo: '4 meses', anio: '1 año' }
/** «cada mes», «cada ciclo», «cada año» */
export const CADA: Record<Periodo, string> = { mes: 'cada mes', ciclo: 'cada ciclo (4 meses)', anio: 'cada año' }

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../features/auth/AuthProvider'
import type { Clave } from './limites'
import { supabase } from './supabase'

export type { Clave }

// Planes de Rockie (docs/negocio/modelo-de-negocio.md). Los límites viven en la base (planes_limites) y la base
// los hace cumplir; aquí la app los lee para mostrar cupos ("te quedan 2") y abrir la hoja de planes ANTES de
// chocar, sin esperar el error. Si la base dice que no (porque alguien se saltó la app), su error trae
// hint = 'LIMITE:<clave>' y humanError (lib/supabase) abre la misma hoja.

export type PlanId = 'gratis' | 'plus' | 'pro'
export type MiPlan = {
  plan: PlanId
  tarifa: 'normal' | 'estudiante' | 'fundador' | null
  hasta: string | null
  estudiante_hasta: string | null
  /** null = sin límite */
  limites: Partial<Record<Clave, number | null>>
  uso_mes: Partial<Record<string, number>>
  pizarras_hoy: number
  notas_compartidas: number
  equipos: number
}

/** Los mismos números que la migración 20261010120000_planes.sql (por si la base no respondió todavía). */
export const LIMITES: Record<PlanId, Record<Clave, number | null>> = {
  gratis: {
    habitos_activos: 5,
    metas: 3,
    retos_activos: 1,
    estadisticas_dias: 30,
    pizarras_dia: 3,
    paneles: 2,
    notas_compartidas: 3,
    conector_ia: 0,
    buscar_hueco_mes: 5,
    equipos: 1,
    miembros_equipo: 8,
  },
  plus: {
    habitos_activos: null,
    metas: 7,
    retos_activos: null,
    estadisticas_dias: null,
    pizarras_dia: null,
    paneles: 6,
    notas_compartidas: null,
    conector_ia: 1,
    buscar_hueco_mes: null,
    equipos: 3,
    miembros_equipo: 10,
  },
  pro: {
    habitos_activos: null,
    metas: 7,
    retos_activos: null,
    estadisticas_dias: null,
    pizarras_dia: null,
    paneles: 6,
    notas_compartidas: null,
    conector_ia: 1,
    buscar_hueco_mes: null,
    equipos: 10,
    miembros_equipo: 25,
  },
}

export { NOMBRE_PLAN } from './limitesTextos'

/** Precios en soles (con IGV). */
export const PRECIOS = {
  plus: { normal: 19.9, estudiante: 12.9 },
  pro: { normal: 34.9 },
  club: { normal: 99 },
} as const

export const soles = (n: number) => `S/ ${n.toFixed(2)}`

/** Mientras se carga (o sin sesión) se asume Gratis: la app nunca deja de funcionar por no saber el plan. */
const BASE: MiPlan = {
  plan: 'gratis',
  tarifa: null,
  hasta: null,
  estudiante_hasta: null,
  limites: LIMITES.gratis,
  uso_mes: {},
  pizarras_hoy: 0,
  notas_compartidas: 0,
  equipos: 0,
}

async function leerPlan(): Promise<MiPlan> {
  const { data, error } = await supabase.rpc('mi_plan' as never)
  if (error) throw error
  const p = data as unknown as MiPlan
  return { ...BASE, ...p, limites: { ...LIMITES[p.plan ?? 'gratis'], ...(p.limites ?? {}) } }
}

export const PLAN_KEY = ['plan'] as const

/** El plan de quien usa la app, con sus límites y cuánto lleva usado. */
export function usePlan() {
  const { session } = useAuth()
  const q = useQuery({ queryKey: PLAN_KEY, queryFn: leerPlan, enabled: Boolean(session), staleTime: 60_000 })
  const p = q.data ?? BASE
  /** null = sin límite */
  const limite = (c: Clave): number | null => (c in p.limites ? (p.limites[c] ?? null) : LIMITES[p.plan][c])
  return {
    ...p,
    cargado: q.isSuccess,
    limite,
    /** ¿cabe uno más si ya se usaron `usados`? (mientras no se sabe el plan, no se bloquea: la base decide) */
    cabe: (c: Clave, usados: number) => {
      if (!q.isSuccess) return true
      const l = limite(c)
      return l === null || usados < l
    },
    /** cuántos quedan (null = sin límite) */
    quedan: (c: Clave, usados: number) => {
      const l = limite(c)
      return l === null ? null : Math.max(0, l - usados)
    },
    recargar: q.refetch,
  }
}

/** Cuenta un uso de un cupo mensual (p. ej. buscar_hueco_mes). Si la base no responde, deja seguir. */
export async function usarCupo(c: Clave): Promise<{ ok: boolean; usado: number; limite: number | null }> {
  const { data, error } = await supabase.rpc('usar_cupo' as never, { p_clave: c } as never)
  if (error) return { ok: true, usado: 0, limite: null }
  return data as unknown as { ok: boolean; usado: number; limite: number | null }
}

export { abrirLimite, alPedirLimite, claveDeLimite } from './limites'

import { addDays } from './dates'
import type { XpEntry } from './types'

// Espejo de la lógica SQL (validate_task / check_achievements). El servidor manda;
// aquí solo se muestra.

export const XP_PLAIN = 40
export const XP_PROOF = 100

export const RANKS = ['Chispa', 'Aprendiz', 'Constructor', 'Artesano', 'Maestro', 'Leyenda'] as const

export function levelOf(xp: number): number {
  return Math.floor(Math.sqrt(xp / 60)) + 1
}
export function xpForLevel(lv: number): number {
  return Math.pow(lv - 1, 2) * 60
}
export function rankOf(lv: number): string {
  return RANKS[Math.min(RANKS.length - 1, Math.floor((lv - 1) / 3))]
}

export function levelProgress(xp: number) {
  const level = levelOf(xp)
  const cur = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, rank: rankOf(level), pct: Math.round(((xp - cur) / (next - cur)) * 100), toNext: next - xp }
}

export const ACHIEVEMENTS = [
  { id: 'first', name: 'Primera piedra', desc: 'La primera tarea validada del espacio.' },
  { id: 'proof5', name: 'Con pruebas', desc: '5 tareas validadas con evidencia.' },
  { id: 'ten', name: 'Diez de diez', desc: '10 tareas validadas en total.' },
  { id: 'streak3', name: 'Tres seguidos', desc: 'Racha de 3 días con validaciones.' },
  { id: 'streak7', name: 'Semana entera', desc: 'Racha de 7 días.' },
  { id: 'xp500', name: 'Medio millar', desc: '500 XP acumulados por el equipo.' },
  { id: 'xp2000', name: 'Dos mil', desc: '2000 XP acumulados.' },
  { id: 'allin', name: 'Todos a bordo', desc: 'Cada miembro validó al menos una tarea.' },
  { id: 'hito', name: 'Proyecto cumplido', desc: 'Un proyecto con todas sus tareas validadas.' },
  { id: 'lategone', name: 'Cero atrasos', desc: 'Ninguna tarea abierta con fecha vencida.' },
] as const

export function achievementName(id: string): string {
  return ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id
}

/** Días seguidos con al menos una validación del equipo (hasta hoy, o hasta ayer si hoy aún no hay). */
export function teamStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days)
  let d = set.has(today) ? today : addDays(today, -1)
  let n = 0
  while (set.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function xpByUser(entries: Pick<XpEntry, 'user_id' | 'points'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) m.set(e.user_id, (m.get(e.user_id) ?? 0) + e.points)
  return m
}

export function teamXp(entries: Pick<XpEntry, 'points'>[]): number {
  return entries.reduce((s, e) => s + e.points, 0)
}

/** ¿Esta validación sería la primera del día del responsable? (para mostrar el ×2 antes de validar) */
export function isFirstToday(entries: Pick<XpEntry, 'user_id' | 'day'>[], userId: string, today: string) {
  return !entries.some((e) => e.user_id === userId && e.day === today)
}

import { fold, parseQuickTask } from '../lib/quickParse'
import { hhmm } from './time'

// Respaldo sin IA: si la voz con Claude no está configurada (o falla), Rockie igual entiende
// "gimnasio mañana a las 7 por 1 hora". Solo crea; mover y preguntar necesitan al agente.

export type Proposal = { tool: string; input: Record<string, unknown> }

const ICON_WORDS: [RegExp, string][] = [
  [/\b(gimnasio|gym|pesas|crossfit)\b/, 'gym'],
  [/\b(correr|trotar|caminar|running)\b/, 'run'],
  [/\b(leer|libro|lectura)\b/, 'book'],
  [/\b(estudiar|clase|examen|curso|tarea de)\b/, 'study'],
  [/\b(reunion|junta|sync|meet)\b/, 'meeting'],
  [/\b(llamar|llamada|telefono)\b/, 'call'],
  [/\b(comer|almorzar|almuerzo|cenar|cena|desayun\w*)\b/, 'food'],
  [/\b(cafe|coffee)\b/, 'coffee'],
  [/\b(comprar|compras|super|mercado)\b/, 'shop'],
  [/\b(codigo|programar|deploy|firmware|bug)\b/, 'code'],
  [/\b(disenar|diseno|boceto|figma)\b/, 'design'],
  [/\b(musica|guitarra|piano|cantar)\b/, 'music'],
  [/\b(medicina|pastilla|doctor|medico)\b/, 'pill'],
  [/\b(viaje|vuelo|aeropuerto|viajar)\b/, 'travel'],
  [/\b(limpiar|lavar|ordenar)\b/, 'clean'],
  [/\b(trabajo|oficina|informe)\b/, 'work'],
  [/\b(idea|pensar|lluvia de ideas)\b/, 'idea'],
  [/\b(dormir|siesta|descansar)\b/, 'moon'],
]

export function guessIcon(text: string) {
  const f = fold(text)
  return ICON_WORDS.find(([re]) => re.test(f))?.[1] ?? 'task'
}

type Ctx = { today: string; defaultDuration: number; people: { id: string; name: string; username: string }[] }

export function localPropose(input: string, ctx: Ctx): Proposal | null {
  let text = input
  const cut = (i: number, len: number) => {
    text = text.slice(0, i) + ' '.repeat(len) + text.slice(i + len)
  }
  const find = (re: RegExp) => re.exec(fold(text))

  // duración ("por 1 hora", "media hora", "45 min")
  let duration: number | null = null
  let m = find(/\b(?:por|durante)?\s*(media hora|hora y media|(\d{1,3})\s*(min|minutos|m)\b|(una|1|dos|2|tres|3)\s*horas?)/)
  if (m && (m[1] === 'media hora' || m[1] === 'hora y media' || m[2] || m[4])) {
    if (m[1] === 'media hora') duration = 30
    else if (m[1] === 'hora y media') duration = 90
    else if (m[2]) duration = Number(m[2])
    else duration = { una: 1, '1': 1, dos: 2, '2': 2, tres: 3, '3': 3 }[m[4] as string]! * 60
    cut(m.index, m[0].length)
  }

  // hora ("a las 7 de la mañana", "16:30", "4 pm", "al mediodía")
  let start: number | null = null
  m = find(/\b(?:a\s+las?\s+|al?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|a\.m\.|pm|p\.m\.|de la (manana|tarde|noche))?(?=\s|$|,|\.)/)
  const hasCue = m && (m[2] || m[3] || /a\s+las?\s+/.test(m[0]))
  if (m && hasCue) {
    let h = Number(m[1])
    const mi = m[2] ? Number(m[2]) : 0
    const q = m[3] ?? ''
    if (/pm|p\.m\.|tarde|noche/.test(q) && h < 12) h += 12
    else if (/am|a\.m\.|manana/.test(q) && h === 12) h = 0
    else if (!q && h >= 1 && h <= 6) h += 12 // "a las 4" en una agenda = 16:00
    if (h <= 23 && mi <= 59) {
      start = h * 60 + mi
      cut(m.index, m[0].length)
    }
  } else {
    m = find(/\bal?\s+mediodia\b/)
    if (m) {
      start = 12 * 60
      cut(m.index, m[0].length)
    }
  }

  const parsed = parseQuickTask(text, ctx.people, ctx.today)
  if (!parsed.title) return null
  const day = parsed.due ?? (start != null ? ctx.today : null)
  return {
    tool: 'crear_item',
    input: {
      title: parsed.title,
      day,
      start: start != null ? hhmm(start) : null,
      duration_min: duration ?? ctx.defaultDuration,
      icon: guessIcon(input),
    },
  }
}

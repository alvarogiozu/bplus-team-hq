import { addDays, weekday, startOfWeek } from './dates'

// Intérprete local de la barra de Rockie. Mientras el agente con IA no llega (fase 5),
// convierte "subir firmware @sebastián viernes urgente" en una propuesta de tarea.
// Nunca adivina a una persona: si el nombre coincide con varias, devuelve 'ambiguous'.

export type PersonLite = { id: string; name: string; username: string }

export type AssigneeGuess =
  | { kind: 'none' }
  | { kind: 'one'; id: string }
  | { kind: 'ambiguous'; ids: string[]; hint: string }
  | { kind: 'unknown'; hint: string }

export type ParsedTask = {
  title: string
  assignee: AssigneeGuess
  due: string | null
  priority: 'normal' | 'urgent'
}

const FOLD: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n',
}

/** minúsculas y sin tildes, conservando la longitud (los índices siguen sirviendo) */
export function fold(s: string): string {
  let out = ''
  for (const ch of s) {
    const lower = ch.toLowerCase()
    const f = FOLD[lower] ?? lower
    out += f.length === ch.length ? f : ch
  }
  return out
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
}
const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9,
  setiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function validIso(y: number, m: number, d: number): string | null {
  const iso = `${y}-${pad(m)}-${pad(d)}`
  const dt = new Date(iso + 'T12:00:00Z')
  return dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d ? iso : null
}

function nextDayOfMonth(today: string, m: number, d: number): string | null {
  const y = Number(today.slice(0, 4))
  const iso = validIso(y, m, d)
  if (!iso) return null
  return iso < addDays(today, -30) ? validIso(y + 1, m, d) : iso
}

export function matchPeople(hint: string, people: PersonLite[]): PersonLite[] {
  const h = fold(hint.trim())
  if (h.length < 2) return []
  const exact = people.filter((p) => fold(p.username) === h || fold(p.name) === h || fold(p.name).split(' ')[0] === h)
  if (exact.length) return exact
  return people.filter((p) => fold(p.username).startsWith(h) || fold(p.name).split(/\s+/).some((w) => w.startsWith(h)))
}

export function parseQuickTask(input: string, people: PersonLite[], today: string): ParsedTask {
  let text = input
  const cut = (start: number, end: number) => {
    text = text.slice(0, start) + ' '.repeat(end - start) + text.slice(end)
  }
  const find = (re: RegExp) => re.exec(fold(text))

  let priority: ParsedTask['priority'] = 'normal'
  let due: string | null = null
  let assignee: AssigneeGuess = { kind: 'none' }

  // prioridad
  let m = find(/\b(urgente|urgent)\b|(?:^|\s)(!+)(?=\s|$)/)
  if (m) {
    priority = 'urgent'
    cut(m.index, m.index + m[0].length)
  }

  // persona: @mención o "para <nombre>" si el nombre es del equipo
  m = find(/@([a-z0-9._]+)/)
  if (m) {
    const found = matchPeople(m[1], people)
    assignee =
      found.length === 1
        ? { kind: 'one', id: found[0].id }
        : found.length > 1
          ? { kind: 'ambiguous', ids: found.map((p) => p.id), hint: m[1] }
          : { kind: 'unknown', hint: m[1] }
    cut(m.index, m.index + m[0].length)
  } else {
    const re = /\b(?:para|a)\s+([a-z]+)\b/g
    const folded = fold(text)
    let mm: RegExpExecArray | null
    while ((mm = re.exec(folded))) {
      const found = matchPeople(mm[1], people)
      if (found.length) {
        assignee = found.length === 1 ? { kind: 'one', id: found[0].id } : { kind: 'ambiguous', ids: found.map((p) => p.id), hint: mm[1] }
        cut(mm.index, mm.index + mm[0].length)
        break
      }
    }
  }

  // fechas (de la más específica a la más general)
  const datePatterns: [RegExp, (x: RegExpExecArray) => string | null][] = [
    [/\bpasado\s+manana\b/, () => addDays(today, 2)],
    [/\b(?:para\s+)?hoy\b/, () => today],
    [/\b(?:para\s+)?manana\b/, () => addDays(today, 1)],
    [
      /\b(?:la\s+)?(?:proxima|otra|siguiente)\s+semana\b|\bla\s+semana\s+que\s+viene\b/,
      () => addDays(startOfWeek(today), 7),
    ],
    [/\ben\s+(\d{1,2})\s+dias?\b/, (x) => addDays(today, Number(x[1]))],
    [
      /\b(?:para\s+)?(?:el\s+|este\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
      (x) => {
        if (x[3]) {
          const y = Number(x[3].length === 2 ? '20' + x[3] : x[3])
          return validIso(y, Number(x[2]), Number(x[1]))
        }
        return nextDayOfMonth(today, Number(x[2]), Number(x[1]))
      },
    ],
    [
      new RegExp(`\\b(?:para\\s+)?(?:el\\s+)?(\\d{1,2})\\s+(?:de\\s+)?(${Object.keys(MONTHS).join('|')})\\b`),
      (x) => nextDayOfMonth(today, MONTHS[x[2]], Number(x[1])),
    ],
    [
      /\b(?:para\s+)?(?:el\s+|este\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+que\s+viene)?\b/,
      (x) => {
        const target = WEEKDAYS[x[1]]
        const diff = (target - weekday(today) + 7) % 7
        return addDays(today, diff === 0 ? 7 : diff)
      },
    ],
  ]
  for (const [re, toIso] of datePatterns) {
    const x = find(re)
    if (!x) continue
    const iso = toIso(x)
    if (iso) {
      due = iso
      cut(x.index, x.index + x[0].length)
      break
    }
  }

  // título: sin muletillas de comando ni conectores colgando
  let title = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:crea(?:r|me)?|anota(?:r)?|agrega(?:r)?|a[ñn]ade|nueva)\s+(?:una\s+)?tarea\s*(?:de|para)?\s*[:,-]?\s*/i, '')
    .replace(/^tarea\s*[:,-]\s*/i, '')
  for (let i = 0; i < 3; i++) {
    title = title
      .replace(/[\s,.;:–-]+$/g, '')
      .replace(/\s+(?:para|el|la|de|a|y|con)$/i, '')
      .replace(/^[\s,.;:–-]+/g, '')
  }
  title = title.replace(/\s+,/g, ',').replace(/,\s*,/g, ',')
  if (title) title = title[0].toUpperCase() + title.slice(1)

  return { title, assignee, due, priority }
}

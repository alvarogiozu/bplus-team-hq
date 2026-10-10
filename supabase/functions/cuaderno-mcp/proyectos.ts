// Las herramientas de Proyectos del conector de Rockie: ver tus proyectos, sus tareas, crear tareas y moverlas
// (Por hacer → En curso → Hecho) mientras Claude trabaja.
// Privacidad (el Cofre): un proyecto está SIEMPRE cifrado en la base. Claude ve y mueve los proyectos para los que la
// persona le dio una «llave temporal» (claude_llaves): el conector los abre y los cierra al vuelo, en memoria
// (./llavero.ts), y lo que crea se guarda cifrado con la llave vigente del equipo. Mientras dura la migración también
// valen los que siguen «abiertos para Claude» en claro (spaces.abierto_claude). Los demás no existen aquí.
// El servidor usa la llave de servicio: TODA lectura se filtra por la membresía de quien conectó el conector, y las
// escrituras van por mcp_crear_tarea / mcp_actualizar_tarea, que se ponen en su lugar (la actividad dice su nombre y
// las reglas de las tareas valen igual que en la app). Pasar a Hecho no valida la tarea: eso (y su XP) lo hace una
// persona en la app.
import type { Ctx } from './tools.ts'
import { EN_CLARO, LLAVE_VIEJA, type Sello } from './llavero.ts'
import { sinContenido } from '../_shared/registro.ts'

type Args = Record<string, unknown>
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (t: string): Result => ({ content: [{ type: 'text', text: t }] })
const oops = (t: string): Result => ({ content: [{ type: 'text', text: t }], isError: true })
const asStr = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '')
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Status = 'todo' | 'doing' | 'done'
const NOMBRE: Record<Status, string> = { todo: 'Por hacer', doing: 'En curso', done: 'Hecho' }
/** «en curso», «en_proceso», «doing», «terminada»… → el estado de la base */
function estadoDe(v: unknown): Status | null {
  const s = fold(asStr(v, 40)).replace(/[_-]/g, ' ')
  if (!s) return null
  if (['todo', 'por hacer', 'pendiente', 'pendientes', 'nueva'].includes(s)) return 'todo'
  if (['doing', 'en curso', 'en proceso', 'haciendo', 'empezada', 'en progreso'].includes(s)) return 'doing'
  if (['done', 'hecho', 'hecha', 'terminado', 'terminada', 'lista', 'listo', 'completada'].includes(s)) return 'done'
  return null
}

// Esquemas mínimos y estables (van en CADA mensaje del usuario): los formatos se explican una vez en las instrucciones.
const S = { type: 'string' }
const ESTADO = { type: 'string', enum: ['por_hacer', 'en_curso', 'hecho'] }
const IDS = { type: 'array', items: S }
const CAMPOS = { notas: S, estado: ESTADO, area: S, responsable: S, fecha: S, hora: S, minutos: { type: 'integer' }, urgente: { type: 'boolean' }, frente: S, depende_de: IDS, nota: S }
const READ = { readOnlyHint: true }
const EDIT = { destructiveHint: false }

export const PROYECTO_TOOLS = [
  {
    name: 'ver_proyectos',
    title: 'Ver proyectos',
    description: 'Proyectos: id, tareas por estado, áreas y frentes numerados, metas.',
    inputSchema: { type: 'object', properties: {} },
    annotations: READ,
    write: false,
  },
  {
    name: 'ver_tareas',
    title: 'Ver tareas',
    description: 'Tareas abiertas de un proyecto, 15 por página (desde). Filtra por estado, area, frente o buscar; con pocas, da el detalle.',
    inputSchema: { type: 'object', properties: { proyecto_id: S, estado: ESTADO, area: S, frente: S, buscar: S, desde: { type: 'integer' } }, required: ['proyecto_id'] },
    annotations: READ,
    write: false,
  },
  {
    name: 'crear_tareas',
    title: 'Crear tareas',
    description: 'Crea hasta 30 tareas. depende_de: ids o «#2» (la 2.ª de la lista). nota: Markdown de su página en Materiales.',
    inputSchema: {
      type: 'object',
      properties: { proyecto_id: S, tareas: { type: 'array', items: { type: 'object', properties: { titulo: S, ...CAMPOS }, required: ['titulo'] } } },
      required: ['proyecto_id', 'tareas'],
    },
    annotations: EDIT,
    write: true,
  },
  {
    name: 'actualizar_tareas',
    title: 'Mover o cambiar tareas',
    description: 'Mueve o cambia hasta 50 tareas. agregar_nota suma una línea; notas las reemplaza; nota crea su página si no tiene.',
    inputSchema: {
      type: 'object',
      properties: { cambios: { type: 'array', items: { type: 'object', properties: { id: S, titulo: S, agregar_nota: S, ...CAMPOS }, required: ['id'] } } },
      required: ['cambios'],
    },
    annotations: EDIT,
    write: true,
  },
] as const

export const PROYECTO_INSTRUCCIONES = [
  '- Tareas: en_curso al empezar; hecho + agregar_nota al terminar; en lote. fecha AAAA-MM-DD, hoy o mañana; hora HH:MM;',
  '  área y frente por nombre o número; «ninguna» quita un campo. 📝 = tiene nota: leer_pagina con el id de la tarea.',
].join('\n')

// ---------- datos ----------
type Space = { id: string; name: string; abierto: boolean }
type Member = { user_id: string; role: string; display_name: string; username: string }
type Area = { id: string; name: string; color: string; position: number; n?: number }
type Frente = { id: string; name: string; n: number; hechas: number; total: number }
type Task = {
  id: string
  title: string
  notes: string
  status: Status
  area_id: string | null
  project_id: string | null
  start_time: string | null
  estimate_min: number | null
  assignee_id: string | null
  due_date: string | null
  priority: string
  validation: string | null
  updated_at: string
  cifrada?: boolean
}

// Lo que no se puede abrir (falta su llave, o es del modo viejo y la app de su dueño aún no lo reescribió) se muestra
// legible y no se toca.
const cifrado = (v: unknown) => typeof v === 'string' && /^c[fj]1\./.test(v)
const PENDIENTE =
  'Hay cosas de este proyecto que Claude no puede abrir todavía: su dueño tiene que abrir Rockie (rockie.plus) para renovar la llave de Claude. Mientras tanto no se pueden leer ni cambiar.'

/** Tus proyectos: los que Claude puede ver (con llave, o abiertos en claro) y cuántos no. */
async function misProyectos(ctx: Ctx): Promise<{ abiertos: Space[]; cerrados: number }> {
  const { data: ms } = await ctx.db.from('space_members').select('space_id').eq('user_id', ctx.uid)
  const ids = (ms ?? []).map((m: { space_id: string }) => m.space_id)
  if (!ids.length) return { abiertos: [], cerrados: 0 }
  const { data } = await ctx.db.from('spaces').select('id, name, abierto_claude').in('id', ids)
  const all = (data ?? []) as { id: string; name: string; abierto_claude: boolean }[]
  const abiertos: Space[] = []
  for (const sp of all) {
    if (!sp.abierto_claude && !(await ctx.llavero.cubre(sp.id))) continue
    abiertos.push({ id: sp.id, name: (await ctx.llavero.texto(sp.name)) ?? '(nombre todavía cifrado)', abierto: sp.abierto_claude })
  }
  return { abiertos, cerrados: all.length - abiertos.length }
}

/** Un proyecto que Claude puede ver y del que eres miembro (o el motivo por el que no). */
async function proyecto(ctx: Ctx, id: string): Promise<Space | string> {
  if (!UUID.test(id)) return 'Ese id de proyecto no es válido. Míralo con ver_proyectos.'
  const { abiertos } = await misProyectos(ctx)
  return abiertos.find((sp) => sp.id === id) ?? 'No encontré ese proyecto entre los que Claude puede ver. Mira cuáles hay con ver_proyectos.'
}

/** Cómo se escribe en este proyecto: en claro si sigue «abierto» (modo viejo), cifrado con su kid vigente si no.
 *  null = la llave que le dieron a Claude quedó vieja: no se escribe. */
async function selloDe(ctx: Ctx, sp: { id: string; abierto: boolean }): Promise<Sello | null> {
  return sp.abierto ? EN_CLARO : await ctx.llavero.sello({ espacio: sp.id })
}

async function miembros(ctx: Ctx, sid: string): Promise<Member[]> {
  const { data } = await ctx.db.from('space_members').select('user_id, role, profile:profiles(display_name, username)').eq('space_id', sid)
  return ((data ?? []) as unknown as { user_id: string; role: string; profile: { display_name: string; username: string } | null }[]).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    display_name: m.profile?.display_name ?? '',
    username: m.profile?.username ?? '',
  }))
}
// Con llave, se lee todo lo del proyecto (cifrado) y se abre aquí; sin llave (modo viejo), solo lo marcado «abierta».
async function areas(ctx: Ctx, sid: string): Promise<Area[]> {
  let q = ctx.db.from('areas').select('id, name, color, position').eq('space_id', sid)
  if (!(await ctx.llavero.cubre(sid))) q = q.eq('abierta', true)
  const { data } = await q.order('position')
  // numeradas en su orden (1, 2, 3…): también se eligen por número
  return Promise.all(((data ?? []) as Area[]).map(async (a, i) => ({ ...a, name: (await ctx.llavero.texto(a.name)) ?? `Área ${i + 1} (aún cifrada)`, n: i + 1 })))
}
async function tareas(ctx: Ctx, sid: string): Promise<Task[]> {
  let q = ctx.db
    .from('tasks')
    .select('id, title, notes, status, area_id, project_id, start_time, estimate_min, assignee_id, due_date, priority, validation, updated_at')
    .eq('space_id', sid)
  if (!(await ctx.llavero.cubre(sid))) q = q.eq('abierta', true)
  const { data } = await q.order('position').limit(2000)
  return Promise.all(
    ((data ?? []) as Task[]).map(async (t) => {
      const [title, notes] = await Promise.all([ctx.llavero.texto(t.title), ctx.llavero.texto(t.notes)])
      return { ...t, cifrada: title === null || notes === null, title: title ?? '(tarea todavía cifrada)', notes: notes ?? '' }
    }),
  )
}

/** La nota del proyecto de cada tarea (materials kind 'note'; la crea la app, cifrada con la llave del equipo).
 *  abierta = se puede leer y editar con leer_pagina / editar_pagina; cifrada = todavía no la reescribe en claro la app
 *  de su dueña; cerrada = no está abierta para Claude. */
async function notasDeTareas(ctx: Ctx, sid: string): Promise<Map<string, { id: string; estado: 'abierta' | 'cifrada' | 'cerrada' }>> {
  const { data: ms } = await ctx.db.from('materials').select('task_id, note_id').eq('space_id', sid).eq('kind', 'note').not('task_id', 'is', null).not('note_id', 'is', null).limit(2000)
  const filas = (ms ?? []) as { task_id: string; note_id: string }[]
  const out = new Map<string, { id: string; estado: 'abierta' | 'cifrada' | 'cerrada' }>()
  if (!filas.length) return out
  const { data: ns } = await ctx.db.from('cuaderno_notes').select('id, title, body, abierta').in('id', filas.map((f) => f.note_id))
  const porId = new Map(((ns ?? []) as { id: string; title: string; body: string; abierta: boolean }[]).map((n) => [n.id, n]))
  const conLlave = await ctx.llavero.cubre(sid)
  for (const f of filas) {
    const n = porId.get(f.note_id)
    if (!n) continue
    if (!n.abierta && !conLlave) out.set(f.task_id, { id: n.id, estado: 'cerrada' })
    else {
      const legible = (await ctx.llavero.texto(n.title)) !== null && (await ctx.llavero.texto(n.body)) !== null
      out.set(f.task_id, { id: n.id, estado: legible ? 'abierta' : 'cifrada' })
    }
  }
  return out
}
const NOTA_TXT = { abierta: '', cifrada: ' (Claude no la puede abrir todavía)', cerrada: ' (no está abierta para Claude)' }

/** Los frentes del proyecto (projects abiertos, sin archivar), numerados, con sus tareas hechas / total. */
async function frentes(ctx: Ctx, sid: string): Promise<Frente[]> {
  const [{ data: ps }, { data: ts }, conLlave] = await Promise.all([
    ctx.db.from('projects').select('id, name, archived, abierta, created_at').eq('space_id', sid).eq('archived', false).order('created_at'),
    ctx.db.from('tasks').select('project_id, status').eq('space_id', sid).not('project_id', 'is', null).limit(5000),
    ctx.llavero.cubre(sid),
  ])
  const visibles = ((ps ?? []) as { id: string; name: string; abierta: boolean }[]).filter((p) => p.abierta || conLlave)
  return Promise.all(
    visibles.map(async (p, i) => {
      const mias = ((ts ?? []) as { project_id: string; status: Status }[]).filter((t) => t.project_id === p.id)
      return { id: p.id, name: (await ctx.llavero.texto(p.name)) ?? `Frente ${i + 1} (aún cifrado)`, n: i + 1, hechas: mias.filter((t) => t.status === 'done').length, total: mias.length }
    }),
  )
}
function frenteDe(nombre: string, todos: Frente[]): Frente | null | undefined {
  const s = fold(nombre)
  if (['ninguno', 'ninguna', 'sin frente', 'nada'].includes(s)) return null
  const num = /^(?:frente\s*)?(\d{1,2})\b/.exec(s)
  if (num) {
    const porNumero = todos.find((x) => x.n === Number(num[1]))
    if (porNumero) return porNumero
  }
  return todos.find((x) => x.id === nombre) ?? todos.find((x) => fold(x.name) === s) ?? todos.find((x) => fold(x.name).startsWith(s)) ?? todos.find((x) => fold(x.name).includes(s))
}
/** Si no dicen el frente, el que corresponde a su área (solo si el proyecto tiene frentes y alguno calza). */
const AREA_A_FRENTE: [RegExp, RegExp][] = [
  [/^pagos?\b|cobr/, /cobrar/],
  [/movil|celular/, /celular/],
  [/^rockie|\bia\b|voz/, /rockie/],
  [/interfaz pc|escritorio|\bpc\b/, /organizarse/],
  [/base de datos|landing|legal/, /seguro|legal/],
  [/distribucion|tiendas?|app store|play store/, /tienda|app store|play store/],
]
function frentePorArea(area: Area | null | undefined, todos: Frente[]): Frente | null {
  if (!area || !todos.length) return null
  const a = fold(area.name)
  for (const [ra, rf] of AREA_A_FRENTE) {
    if (!ra.test(a)) continue
    const hit = todos.find((x) => rf.test(fold(x.name)))
    if (hit) return hit
  }
  return null
}
const pct = (hechas: number, total: number) => (total ? Math.round((hechas / total) * 100) : 0)

/** Qué espera cada tarea del proyecto: task_id → [depende_de…] (tabla task_dependencies). */
async function dependencias(ctx: Ctx, sid: string): Promise<Map<string, string[]>> {
  const { data } = await ctx.db.from('task_dependencies').select('task_id, depende_de').eq('space_id', sid).limit(5000)
  const m = new Map<string, string[]>()
  for (const d of (data ?? []) as { task_id: string; depende_de: string }[]) m.set(d.task_id, [...(m.get(d.task_id) ?? []), d.depende_de])
  return m
}

/** depende_de de una tarea → ids (o el motivo por el que no). «#2» = la 2.ª de la misma lista (solo al crear). */
function idsDependencias(v: unknown, creadas?: (string | null)[]): string[] | string {
  if (!Array.isArray(v)) return 'depende_de va como una lista de ids'
  const out: string[] = []
  for (const x of v.slice(0, 20)) {
    const s = asStr(x, 60).trim()
    const ref = /^#(\d{1,2})$/.exec(s)
    if (ref && creadas) {
      const id = creadas[Number(ref[1]) - 1]
      if (!id) return `«${s}» no es una tarea de esta lista (o no se pudo crear)`
      out.push(id)
    } else if (UUID.test(s)) out.push(s)
    else return `«${s}» no es un id de tarea${creadas ? ' ni «#N»' : ''}`
  }
  return [...new Set(out)]
}

/** La fecha de hoy en la zona horaria de la persona (para «hoy» y «mañana»). */
export async function hoy(ctx: Ctx): Promise<string> {
  const { data } = await ctx.db.from('profiles').select('timezone').eq('id', ctx.uid).maybeSingle()
  const tz = (data as { timezone?: string } | null)?.timezone || 'America/Lima'
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}
export const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** «2026-10-20», «hoy», «mañana», «ninguna» → la fecha (null = quitarla; undefined = no se entiende) */
export function fechaDe(v: string, hoyDia: string): string | null | undefined {
  const s = fold(v)
  if (['ninguna', 'sin fecha', 'nada', 'quitar'].includes(s)) return null
  if (s === 'hoy') return hoyDia
  if (s === 'manana') return sumarDias(hoyDia, 1)
  if (s === 'pasado manana') return sumarDias(hoyDia, 2)
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined
}
/** «14», «14:30», «9:05», «ninguna» → «HH:MM» (null = quitarla; undefined = no se entiende) */
export function horaDe(v: unknown): string | null | undefined {
  const s = fold(asStr(v, 20))
  if (['ninguna', 'sin hora', 'nada', 'quitar'].includes(s)) return null
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(s)
  if (!m || Number(m[1]) > 23 || Number(m[2] ?? 0) > 59) return undefined
  return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`
}
/** minutos estimados: 5 a 1440; 0, «ninguno» o null los quitan (null) · undefined = no se entiende */
function minutosDe(v: unknown): number | null | undefined {
  if (v === null || v === 0 || ['ninguno', 'ninguna', 'nada'].includes(fold(asStr(v, 20)))) return null
  const n = typeof v === 'number' ? v : Number(asStr(v, 10))
  return Number.isInteger(n) && n >= 5 && n <= 1440 ? n : undefined
}
const fmtMin = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`)

function areaDe(nombre: string, todas: Area[]): Area | null | undefined {
  const s = fold(nombre)
  if (['ninguna', 'sin area', 'nada'].includes(s)) return null
  // por número: «3», «área 3», «3. Interfaz móvil»
  const num = /^(?:area\s*)?(\d{1,2})\b/.exec(s)
  if (num) {
    const porNumero = todas.find((a) => a.n === Number(num[1]))
    if (porNumero) return porNumero
  }
  return todas.find((a) => a.id === nombre) ?? todas.find((a) => fold(a.name) === s) ?? todas.find((a) => fold(a.name).startsWith(s))
}
function personaDe(quien: string, ms: Member[], uid: string): Member | null | undefined {
  const s = fold(quien).replace(/^@/, '')
  if (['nadie', 'ninguno', 'sin responsable'].includes(s)) return null
  if (['yo', 'me', 'mi', 'a mi'].includes(s)) return ms.find((m) => m.user_id === uid)
  return (
    ms.find((m) => m.user_id === quien) ??
    ms.find((m) => fold(m.username) === s || fold(m.display_name) === s) ??
    ms.find((m) => fold(m.display_name).startsWith(s) || fold(m.username).startsWith(s))
  )
}
const enlace = (ctx: Ctx, sid: string, tid?: string) => `${ctx.origin}/tareas?equipo=${sid}${tid ? `&tarea=${tid}` : ''}`

// ---------- las herramientas ----------
export async function callProyecto(name: string, args: Args, ctx: Ctx): Promise<Result | null> {
  if (!PROYECTO_TOOLS.some((t) => t.name === name)) return null
  const tool = PROYECTO_TOOLS.find((t) => t.name === name)!
  if (tool.write && ctx.scope !== 'escribir') return oops('Esta conexión es de solo lectura. Para mover tareas, reconecta Rockie con permiso de escribir.')
  try {
    switch (name) {
      case 'ver_proyectos':
        return await verProyectos(ctx)
      case 'ver_tareas':
        return await verTareas(ctx, args)
      case 'crear_tareas':
        return await crearTareas(ctx, args)
      case 'actualizar_tareas':
        return await actualizarTareas(ctx, args)
    }
    return null
  } catch (e) {
    console.error(name, sinContenido(e))
    return oops('Algo falló en Proyectos. Intenta de nuevo en un momento.')
  }
}

async function verProyectos(ctx: Ctx): Promise<Result> {
  const { abiertos, cerrados } = await misProyectos(ctx)
  const aviso = cerrados
    ? `\n${cerrados === 1 ? '1 proyecto más está cerrado' : `${cerrados} proyectos más están cerrados`} para Claude. Su dueño le da la llave en Rockie › Proyectos › Ajustes del proyecto › Claude.`
    : ''
  if (!abiertos.length) return text(`No tienes proyectos abiertos para Claude.${aviso}`)
  const lines = await Promise.all(
    abiertos.map(async (sp) => {
      const [ts, ar, fs, metas] = await Promise.all([tareas(ctx, sp.id), areas(ctx, sp.id), frentes(ctx, sp.id), metasDe(ctx, sp.id)])
      const n = (st: Status) => ts.filter((t) => t.status === st).length
      const nombres = ar.map((a) => `${a.n}. ${a.name}`)
      const pendientes = ts.some((t) => t.cifrada) || ar.some((a) => a.name.endsWith('(aún cifrada)')) || sp.name.startsWith('(nombre')
      const fr = fs.map((x) => `${x.n}. ${x.name} ${x.hechas}/${x.total} (${pct(x.hechas, x.total)} %)`)
      return `📁 ${sp.name} [${sp.id}]\n   ${n('todo')} por hacer · ${n('doing')} en curso · ${n('done')} hechas${nombres.length ? `\n   áreas: ${nombres.join(' · ')}` : ' · sin áreas'}${fr.length ? `\n   frentes: ${fr.join(' · ')}` : ''}${metas.length ? `\n   metas:\n${metas.join('\n')}` : ''}${pendientes ? `\n   ⚠️ ${PENDIENTE}` : ''}`
    }),
  )
  return text(`${lines.join('\n')}${aviso}`)
}

/** Las metas del proyecto con su avance (como en la app): número = de inicio a objetivo; frente = hechas/total;
 *  general = promedio de sus sub-metas. Sus títulos van cifrados con la llave del proyecto: si no se pueden leer, se
 *  nombran por su frente o por su tipo, y solo se muestran los números. */
async function metasDe(ctx: Ctx, sid: string): Promise<string[]> {
  const [{ data }, fs] = await Promise.all([
    ctx.db.from('goals').select('id, parent_id, title, kind, start_value, target_value, current_value, project_id, position').eq('space_id', sid).order('position'),
    frentes(ctx, sid),
  ])
  type G = { id: string; parent_id: string | null; title: string; kind: string; start_value: number; target_value: number; current_value: number; project_id: string | null }
  const gs = await Promise.all(((data ?? []) as G[]).map(async (g) => ({ ...g, title: (await ctx.llavero.texto(g.title)) ?? g.title })))
  if (!gs.length) return []
  const porFrente = new Map<string, Frente>((fs as Frente[]).map((x) => [x.id, x]))
  const hijas = (id: string | null) => gs.filter((g) => (g.parent_id ?? null) === id)
  const avance = (g: G): number => {
    if (g.kind === 'project') {
      const x = g.project_id ? porFrente.get(g.project_id) : undefined
      return x && x.total ? x.hechas / x.total : 0
    }
    if (g.kind === 'children') {
      const hs = hijas(g.id)
      return hs.length ? hs.reduce((a, h) => a + avance(h), 0) / hs.length : 0
    }
    const span = Number(g.target_value) - Number(g.start_value)
    return span ? Math.min(1, Math.max(0, (Number(g.current_value) - Number(g.start_value)) / span)) : 0
  }
  const nombre = (g: G) => {
    if (!cifrado(g.title)) return g.title
    if (g.kind === 'project') return `Meta del frente «${(g.project_id && porFrente.get(g.project_id)?.name) || '?'}»`
    if (g.kind === 'children') return 'Meta general (título cifrado)'
    return 'Meta numérica (título cifrado)'
  }
  const detalle = (g: G) => {
    if (g.kind === 'project') {
      const x = g.project_id ? porFrente.get(g.project_id) : undefined
      return x ? ` · ${x.hechas}/${x.total} tareas` : ''
    }
    if (g.kind === 'children') return ` · promedio de ${hijas(g.id).length}`
    return ` · ${Number(g.current_value)} de ${Number(g.target_value)}`
  }
  const out: string[] = []
  const pinta = (g: G, nivel: number) => {
    out.push(`${'   '.repeat(nivel + 1)}- ${nombre(g)}: ${Math.round(avance(g) * 100)} %${detalle(g)}`)
    for (const h of hijas(g.id)) pinta(h, nivel + 1)
  }
  for (const r of hijas(null)) pinta(r, 0)
  return out.slice(0, 40)
}

async function verTareas(ctx: Ctx, args: Args): Promise<Result> {
  const p = await proyecto(ctx, asStr(args.proyecto_id, 60))
  if (typeof p === 'string') return oops(p)
  const [ts, ar, ms, deps, fs, notas] = await Promise.all([tareas(ctx, p.id), areas(ctx, p.id), miembros(ctx, p.id), dependencias(ctx, p.id), frentes(ctx, p.id), notasDeTareas(ctx, p.id)])
  const soloEstado = args.estado ? estadoDe(args.estado) : null
  if (args.estado && !soloEstado) return oops('El estado es por_hacer, en_curso o hecho.')
  let lista = ts
  if (args.area) {
    const a = areaDe(asStr(args.area, 60), ar)
    if (!a) return oops(`No hay un área «${asStr(args.area, 60)}». Las áreas son: ${ar.map((x) => `${x.n}. ${x.name}`).join(', ') || 'ninguna'} (también se eligen por número).`)
    lista = lista.filter((t) => t.area_id === a.id)
  }
  if (args.frente) {
    const x = frenteDe(asStr(args.frente, 80), fs)
    if (x === undefined) return oops(`No hay un frente «${asStr(args.frente, 80)}». Los frentes son: ${fs.map((y) => `${y.n}. ${y.name}`).join(', ') || 'ninguno'}.`)
    lista = lista.filter((t) => (x ? t.project_id === x.id : !t.project_id))
  }
  const q = fold(asStr(args.buscar, 120))
  if (q) lista = lista.filter((t) => fold(`${t.title} ${t.notes}`).includes(q))
  const areaN = new Map(ar.map((a) => [a.id, a.name]))
  const frenteN = new Map(fs.map((x) => [x.id, x.name]))
  const quien = new Map(ms.map((m) => [m.user_id, m.display_name || m.username]))
  const porId = new Map(ts.map((t) => [t.id, t]))
  // bloqueada = alguna de las que espera aún no está hecha (las hechas ya no bloquean)
  const bloqueos = (t: Task) => {
    if (t.status === 'done') return ''
    const pend = (deps.get(t.id) ?? []).map((id) => porId.get(id)).filter((d): d is Task => !!d && d.status !== 'done')
    return pend.length ? ` · ⛔ bloqueada por: ${pend.map((d) => `«${d.title}» [${d.id}]`).join(', ')}` : ''
  }
  // con pocas filas se da el detalle (nombre del frente, quién bloquea, id de la nota); si no, una línea corta
  const frenteNum = new Map(fs.map((x) => [x.id, x.n]))
  const corta = (t: Task) => {
    const esperan = t.status === 'done' ? 0 : (deps.get(t.id) ?? []).map((id) => porId.get(id)).filter((d) => !!d && d.status !== 'done').length
    return `- ${t.title} [${t.id}]${t.area_id && areaN.get(t.area_id) ? ` · ${areaN.get(t.area_id)}` : ''}${t.project_id && frenteNum.get(t.project_id) ? ` · ▸${frenteNum.get(t.project_id)}` : ''}${t.assignee_id ? ` · ${quien.get(t.assignee_id) ?? 'alguien'}` : ''}${t.due_date ? ` · ${t.due_date}` : ''}${t.start_time ? ` ${t.start_time.slice(0, 5)}` : ''}${t.priority === 'urgent' ? ' · urgente' : ''}${esperan ? ` · ⛔${esperan}` : ''}${notas.get(t.id) ? ' · 📝' : ''}`
  }
  const fila = (t: Task) =>
    `- ${t.title} [${t.id}]${t.area_id && areaN.get(t.area_id) ? ` · ${areaN.get(t.area_id)}` : ''}${t.project_id && frenteN.get(t.project_id) ? ` · ▸ ${frenteN.get(t.project_id)}` : ''}${t.assignee_id ? ` · ${quien.get(t.assignee_id) ?? 'alguien'}` : ''}${t.due_date ? ` · vence ${t.due_date}` : ''}${t.start_time ? ` · ${t.start_time.slice(0, 5)}` : ''}${t.estimate_min ? ` · ${fmtMin(t.estimate_min)}` : ''}${t.priority === 'urgent' ? ' · urgente' : ''}${notas.get(t.id) ? ` · 📝 nota${notas.get(t.id)!.estado === 'abierta' ? ` [${notas.get(t.id)!.id}]` : NOTA_TXT[notas.get(t.id)!.estado]}` : ''}${t.status === 'done' ? (t.validation ? ' · validada' : ' · por validar') : ''}${bloqueos(t)}`
  // por defecto, lo abierto (En curso y luego Por hacer); las hechas solo si se piden. 15 por página.
  const n = (st: Status) => lista.filter((t) => t.status === st).length
  const orden: Status[] = soloEstado ? [soloEstado] : ['doing', 'todo']
  const visibles = orden.flatMap((st) => {
    const g = lista.filter((t) => t.status === st)
    return st === 'done' ? g.sort((a, b) => b.updated_at.localeCompare(a.updated_at)) : g
  })
  const POR_PAGINA = 15
  const desde = Math.max(0, Math.min(Number(args.desde) || 0, visibles.length))
  const pagina = visibles.slice(desde, desde + POR_PAGINA)
  const detalle = visibles.length <= 5
  const out: string[] = [`📁 ${p.name} · ${n('doing')} en curso · ${n('todo')} por hacer · ${n('done')} hechas`]
  if (ts.some((t) => t.cifrada) || ar.some((a) => a.name.endsWith('(aún cifrada)'))) out.push(`⚠️ ${PENDIENTE}`)
  let ultimo: Status | null = null
  for (const t of pagina) {
    if (t.status !== ultimo) out.push(`${NOMBRE[t.status]}:`)
    ultimo = t.status
    out.push(detalle ? fila(t) : corta(t))
  }
  if (!pagina.length) out.push('(ninguna)')
  const quedan = visibles.length - desde - pagina.length
  if (quedan > 0) out.push(`… ${quedan} más: desde=${desde + pagina.length}`)
  return text(out.join('\n'))
}

async function crearTareas(ctx: Ctx, args: Args): Promise<Result> {
  const p = await proyecto(ctx, asStr(args.proyecto_id, 60))
  if (typeof p === 'string') return oops(p)
  const lista = Array.isArray(args.tareas) ? (args.tareas as Args[]).slice(0, 30) : []
  if (!lista.length) return oops('Dime al menos una tarea (tareas: [{ titulo }]).')
  const sello = await selloDe(ctx, p)
  if (!sello) return oops(LLAVE_VIEJA)
  const [ar, ms, hoyDia, fs] = await Promise.all([areas(ctx, p.id), miembros(ctx, p.id), hoy(ctx), frentes(ctx, p.id)])
  const hechas: string[] = []
  const errores: string[] = []
  const creadas: (string | null)[] = lista.map(() => null) // el id de cada una, en el orden de la lista (para «#N»)
  for (const [i, t] of lista.entries()) {
    const titulo = asStr(t.titulo, 200).trim()
    if (!titulo) {
      errores.push('una tarea sin título')
      continue
    }
    const estado = t.estado ? estadoDe(t.estado) : 'todo'
    if (!estado) {
      errores.push(`«${titulo}»: el estado es por_hacer, en_curso o hecho`)
      continue
    }
    let area: Area | null | undefined = null
    if (t.area) {
      area = areaDe(asStr(t.area, 60), ar)
      if (area === undefined) {
        errores.push(`«${titulo}»: no hay un área «${asStr(t.area, 60)}» (hay: ${ar.map((a) => a.name).join(', ') || 'ninguna'})`)
        continue
      }
    }
    let persona: Member | null | undefined = null
    if (t.responsable) {
      persona = personaDe(asStr(t.responsable, 80), ms, ctx.uid)
      if (persona === undefined) {
        errores.push(`«${titulo}»: «${asStr(t.responsable, 80)}» no es del proyecto`)
        continue
      }
    }
    let fecha: string | null | undefined = null
    if (t.fecha) {
      fecha = fechaDe(asStr(t.fecha, 30), hoyDia)
      if (fecha === undefined) {
        errores.push(`«${titulo}»: la fecha va como AAAA-MM-DD, «hoy» o «mañana»`)
        continue
      }
    }
    let hora: string | null | undefined = null
    if (t.hora !== undefined && t.hora !== null && asStr(t.hora, 20).trim()) {
      hora = horaDe(t.hora)
      if (hora === undefined) {
        errores.push(`«${titulo}»: la hora va como HH:MM (por ejemplo 14:30)`)
        continue
      }
    }
    let minutos: number | null | undefined = null
    if (t.minutos !== undefined) {
      minutos = minutosDe(t.minutos)
      if (minutos === undefined) {
        errores.push(`«${titulo}»: los minutos van de 5 a 1440`)
        continue
      }
    }
    // el frente: el que digan, o el de su área (así la tarea cuenta para las metas)
    let frente: Frente | null | undefined = null
    if (t.frente !== undefined && asStr(t.frente, 80).trim()) {
      frente = frenteDe(asStr(t.frente, 80), fs)
      if (frente === undefined) {
        errores.push(`«${titulo}»: no hay un frente «${asStr(t.frente, 80)}» (hay: ${fs.map((x) => `${x.n}. ${x.name}`).join(', ') || 'ninguno'})`)
        continue
      }
    } else frente = frentePorArea(area, fs)
    const { data, error } = await ctx.db.rpc('mcp_crear_tarea', {
      p_uid: ctx.uid,
      p_space: p.id,
      p_title: await sello.cierra(titulo),
      p_notes: await sello.cierra(asStr(t.notas, 20_000)),
      p_status: estado,
      p_area: area?.id ?? null,
      p_assignee: persona?.user_id ?? null,
      p_due: fecha,
      p_priority: t.urgente === true ? 'urgent' : 'normal',
      p_project: frente?.id ?? null,
      p_start_time: hora,
      p_estimate_min: minutos,
    })
    if (error) errores.push(`«${titulo}»: ${error.message}`)
    else {
      creadas[i] = data as string
      hechas.push(`- ${titulo} [${data}] · ${NOMBRE[estado]}${hora ? ` · ${hora}` : ''}${minutos ? ` · ${fmtMin(minutos)}` : ''}${area ? ` · ${area.name}` : ''}${frente ? ` · ▸ ${frente.name}` : fs.length ? ' · sin frente' : ''}`)
    }
  }
  // la nota del proyecto de las que la traen (mcp_crear_nota_tarea: una por tarea, en la carpeta de su frente)
  for (const [i, t] of lista.entries()) {
    if (!creadas[i] || typeof t.nota !== 'string' || !t.nota.trim()) continue
    const { data, error } = await ctx.db.rpc('mcp_crear_nota_tarea', { p_uid: ctx.uid, p_task: creadas[i], p_body: await sello.cierra(t.nota.slice(0, 60_000)) })
    const k = hechas.findIndex((h) => h.includes(`[${creadas[i]}]`))
    if (error) errores.push(`«${asStr(t.titulo, 200).trim()}» se creó, pero sin nota: ${error.message}`)
    else if (k >= 0) hechas[k] += ` · 📝 nota [${(data as { note_id: string }).note_id}]`
  }
  // las dependencias, cuando ya existen todas (así «#3» puede apuntar a una que va más abajo)
  for (const [i, t] of lista.entries()) {
    if (!creadas[i] || t.depende_de === undefined) continue
    const titulo = asStr(t.titulo, 200).trim()
    const ids = idsDependencias(t.depende_de, creadas)
    if (typeof ids === 'string') {
      errores.push(`«${titulo}» se creó, pero sin dependencias: ${ids}`)
      continue
    }
    if (!ids.length) continue
    const { error } = await ctx.db.rpc('mcp_dependencias', { p_uid: ctx.uid, p_task: creadas[i], p_depende_de: ids })
    if (error) errores.push(`«${titulo}» se creó, pero sin dependencias: ${error.message}`)
    else hechas[hechas.findIndex((h) => h.includes(`[${creadas[i]}]`))] += ` · espera a ${ids.length}`
  }
  const out = [hechas.length ? `Creé ${hechas.length} ${hechas.length === 1 ? 'tarea' : 'tareas'} en ${p.name}:\n${hechas.join('\n')}` : 'No creé ninguna tarea.']
  if (errores.length) out.push(`\nNo pude con:\n${errores.map((e) => `- ${e}`).join('\n')}`)
  out.push(`\n${enlace(ctx, p.id)}`)
  return hechas.length ? text(out.join('\n')) : oops(out.join('\n'))
}

async function actualizarTareas(ctx: Ctx, args: Args): Promise<Result> {
  const cambios = Array.isArray(args.cambios) ? (args.cambios as Args[]).slice(0, 50) : []
  if (!cambios.length) return oops('Dime qué cambiar (cambios: [{ id, estado }]).')
  const ids = cambios.map((c) => asStr(c.id, 60)).filter((id) => UUID.test(id))
  const { abiertos } = await misProyectos(ctx)
  const proyectoDe = new Map(abiertos.map((sp) => [sp.id, sp]))
  const sellos = new Map<string, Sello | null>()
  const selloDeEspacio = async (sid: string) => {
    if (!sellos.has(sid)) sellos.set(sid, await selloDe(ctx, proyectoDe.get(sid)!))
    return sellos.get(sid)!
  }
  const { data } = ids.length
    ? await ctx.db.from('tasks').select('id, space_id, title, notes, status, abierta, project_id').in('id', ids)
    : { data: [] }
  const porId = new Map(((data ?? []) as (Task & { space_id: string; abierta: boolean })[]).map((t) => [t.id, t]))
  const cache = new Map<string, { ar: Area[]; ms: Member[]; fs: Frente[] }>()
  const datos = async (sid: string) => {
    if (!cache.has(sid)) cache.set(sid, { ar: await areas(ctx, sid), ms: await miembros(ctx, sid), fs: await frentes(ctx, sid) })
    return cache.get(sid)!
  }
  const hoyDia = await hoy(ctx)
  const hechas: string[] = []
  const errores: string[] = []
  for (const c of cambios) {
    const id = asStr(c.id, 60)
    const t0 = porId.get(id)
    if (!t0 || !proyectoDe.has(t0.space_id) || !(t0.abierta || (await ctx.llavero.cubre(t0.space_id)))) {
      errores.push(`${id}: no está en los proyectos que Claude puede ver`)
      continue
    }
    // lo que no se puede abrir no se toca (sumarle una nota a un texto que no se pudo leer lo rompería)
    const [titulo0, notas0] = await Promise.all([ctx.llavero.texto(t0.title), ctx.llavero.texto(t0.notes)])
    if (titulo0 === null || notas0 === null) {
      errores.push(`${id}: Claude no la puede abrir todavía. ${PENDIENTE}`)
      continue
    }
    const t = { ...t0, title: titulo0, notes: notas0 }
    const sello = await selloDeEspacio(t.space_id)
    if (!sello) {
      errores.push(`«${t.title}»: ${LLAVE_VIEJA}`)
      continue
    }
    const patch: Record<string, unknown> = {}
    const dice: string[] = []
    if (c.estado !== undefined) {
      const st = estadoDe(c.estado)
      if (!st) {
        errores.push(`«${t.title}»: el estado es por_hacer, en_curso o hecho`)
        continue
      }
      if (st !== t.status) {
        patch.status = st
        dice.push(`→ ${NOMBRE[st]}`)
      }
    }
    let tituloNuevo: string | null = null
    if (typeof c.titulo === 'string' && c.titulo.trim()) {
      tituloNuevo = c.titulo.trim().slice(0, 200)
      patch.title = await sello.cierra(tituloNuevo)
      dice.push('título nuevo')
    }
    let notas = typeof c.notas === 'string' ? c.notas.slice(0, 20_000) : null
    if (typeof c.agregar_nota === 'string' && c.agregar_nota.trim()) {
      const base = notas ?? t.notes ?? ''
      notas = `${base}${base.trim() ? '\n' : ''}- ${hoyDia}: ${c.agregar_nota.trim().slice(0, 2000)}`
      dice.push('nota de avance')
    }
    if (notas !== null) patch.notes = await sello.cierra(notas)
    if (c.area !== undefined || c.responsable !== undefined) {
      const { ar, ms } = await datos(t.space_id)
      if (c.area !== undefined) {
        const a = areaDe(asStr(c.area, 60), ar)
        if (a === undefined) {
          errores.push(`«${t.title}»: no hay un área «${asStr(c.area, 60)}» (hay: ${ar.map((x) => x.name).join(', ') || 'ninguna'})`)
          continue
        }
        patch.area_id = a?.id ?? ''
        dice.push(a ? `área ${a.name}` : 'sin área')
        // sin frente todavía y sin decir cuál: toma el de su nueva área
        if (c.frente === undefined && !t.project_id) {
          const x = frentePorArea(a, (await datos(t.space_id)).fs)
          if (x) {
            patch.project_id = x.id
            dice.push(`frente ${x.name}`)
          }
        }
      }
      if (c.responsable !== undefined) {
        const m = personaDe(asStr(c.responsable, 80), ms, ctx.uid)
        if (m === undefined) {
          errores.push(`«${t.title}»: «${asStr(c.responsable, 80)}» no es del proyecto`)
          continue
        }
        patch.assignee_id = m?.user_id ?? ''
        dice.push(m ? `para ${m.display_name || m.username}` : 'sin responsable')
      }
    }
    if (c.fecha !== undefined) {
      const f = fechaDe(asStr(c.fecha, 30), hoyDia)
      if (f === undefined) {
        errores.push(`«${t.title}»: la fecha va como AAAA-MM-DD, «hoy» o «mañana»`)
        continue
      }
      patch.due_date = f ?? ''
      dice.push(f ? `vence ${f}` : 'sin fecha')
    }
    if (c.frente !== undefined) {
      const { fs } = await datos(t.space_id)
      const x = frenteDe(asStr(c.frente, 80), fs)
      if (x === undefined) {
        errores.push(`«${t.title}»: no hay un frente «${asStr(c.frente, 80)}» (hay: ${fs.map((y) => `${y.n}. ${y.name}`).join(', ') || 'ninguno'})`)
        continue
      }
      if ((x?.id ?? null) !== (t.project_id ?? null)) {
        patch.project_id = x?.id ?? ''
        dice.push(x ? `frente ${x.name}` : 'sin frente')
      }
    }
    if (c.hora !== undefined) {
      const h = horaDe(c.hora ?? 'ninguna')
      if (h === undefined) {
        errores.push(`«${t.title}»: la hora va como HH:MM (por ejemplo 14:30)`)
        continue
      }
      patch.start_time = h ?? ''
      dice.push(h ? `a las ${h}` : 'sin hora')
    }
    if (c.minutos !== undefined) {
      const m = minutosDe(c.minutos)
      if (m === undefined) {
        errores.push(`«${t.title}»: los minutos van de 5 a 1440`)
        continue
      }
      patch.estimate_min = m ?? ''
      dice.push(m ? fmtMin(m) : 'sin estimado')
    }
    if (typeof c.urgente === 'boolean') {
      patch.priority = c.urgente ? 'urgent' : 'normal'
      dice.push(c.urgente ? 'urgente' : 'normal')
    }
    let deps: string[] | null = null
    if (c.depende_de !== undefined) {
      const ids = idsDependencias(c.depende_de)
      if (typeof ids === 'string') {
        errores.push(`«${t.title}»: ${ids}`)
        continue
      }
      deps = ids
    }
    if (!Object.keys(patch).length && deps === null && !(typeof c.nota === 'string' && c.nota.trim())) {
      hechas.push(`- ${t.title}: ya estaba así`)
      continue
    }
    if (Object.keys(patch).length) {
      const { error } = await ctx.db.rpc('mcp_actualizar_tarea', { p_uid: ctx.uid, p_task: id, p_patch: patch })
      if (error) {
        errores.push(`«${t.title}»: ${error.message}`)
        continue
      }
    }
    if (deps !== null) {
      const { data: n, error } = await ctx.db.rpc('mcp_dependencias', { p_uid: ctx.uid, p_task: id, p_depende_de: deps })
      if (error) errores.push(`«${t.title}»${dice.length ? ` (lo demás sí se guardó)` : ''}: ${error.message}`)
      else dice.push(n ? `espera a ${n}` : 'sin dependencias')
    }
    if (typeof c.nota === 'string' && c.nota.trim()) {
      const { data: r, error } = await ctx.db.rpc('mcp_crear_nota_tarea', { p_uid: ctx.uid, p_task: id, p_body: await sello.cierra(c.nota.slice(0, 60_000)) })
      if (error) errores.push(`«${t.title}»: no pude crear su nota (${error.message})`)
      else dice.push((r as { ya_existia: boolean }).ya_existia ? 'ya tenía nota (súmale con editar_pagina y el id de la tarea)' : '📝 nota creada')
    }
    if (dice.length || Object.keys(patch).length) hechas.push(`- ${tituloNuevo ?? t.title} ${dice.join(' · ') || 'notas nuevas'}`)
  }
  const out = [hechas.length ? `Listo:\n${hechas.join('\n')}` : 'No cambié nada.']
  if (errores.length) out.push(`\nNo pude con:\n${errores.map((e) => `- ${e}`).join('\n')}`)
  if (cambios.some((c) => estadoDe(c.estado) === 'done')) out.push('\n(Las que pasaron a Hecho quedan por validar: eso lo hace una persona en la app.)')
  return hechas.length ? text(out.join('\n')) : oops(out.join('\n'))
}

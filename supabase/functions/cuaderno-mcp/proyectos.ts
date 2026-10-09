// Las herramientas de Proyectos del conector de Rockie: ver tus proyectos, sus tareas, crear tareas y moverlas
// (Por hacer → En curso → Hecho) mientras Claude trabaja.
// Privacidad (el Cofre): un proyecto está cifrado en el dispositivo. Claude solo ve y mueve los proyectos que su DUEÑO
// abrió para Claude (spaces.abierto_claude; sus tareas y áreas tienen abierta = true). Los demás no existen aquí.
// El servidor usa la llave de servicio: TODA lectura se filtra por la membresía de quien conectó el conector, y las
// escrituras van por mcp_crear_tarea / mcp_actualizar_tarea, que se ponen en su lugar (la actividad dice su nombre y
// las reglas de las tareas valen igual que en la app). Pasar a Hecho no valida la tarea: eso (y su XP) lo hace una
// persona en la app.
import type { Ctx } from './tools.ts'

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

const ESTADO = { type: 'string', enum: ['por_hacer', 'en_curso', 'hecho'], description: 'por_hacer, en_curso o hecho' }
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

export const PROYECTO_TOOLS = [
  {
    name: 'ver_proyectos',
    title: 'Ver mis proyectos',
    description:
      'Tus proyectos abiertos para Claude: id, cuántas tareas hay por hacer, en curso y hechas, y sus áreas. Empieza por aquí para saber en qué proyecto trabajar.',
    inputSchema: { type: 'object', properties: {} },
    annotations: READ,
    write: false,
  },
  {
    name: 'ver_tareas',
    title: 'Ver las tareas de un proyecto',
    description:
      'Las tareas de un proyecto agrupadas por estado (Por hacer, En curso, Hecho), con id, área, responsable, fecha y si es urgente. Filtra por estado, área o palabras.',
    inputSchema: {
      type: 'object',
      properties: {
        proyecto_id: { type: 'string', description: 'Id del proyecto (de ver_proyectos)' },
        estado: ESTADO,
        area: { type: 'string', description: 'Nombre del área (opcional)' },
        buscar: { type: 'string', description: 'Palabras del título o las notas (opcional)' },
      },
      required: ['proyecto_id'],
    },
    annotations: READ,
    write: false,
  },
  {
    name: 'crear_tareas',
    title: 'Crear tareas',
    description:
      'Crea una o varias tareas en un proyecto (hasta 30). Cada una con título y, si quieres, notas, estado, área (por nombre), responsable (nombre, usuario o «yo»), fecha (AAAA-MM-DD, «hoy» o «mañana») y urgente.',
    inputSchema: {
      type: 'object',
      properties: {
        proyecto_id: { type: 'string', description: 'Id del proyecto' },
        tareas: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'Qué hay que hacer (máx. 200 caracteres)' },
              notas: { type: 'string' },
              estado: ESTADO,
              area: { type: 'string' },
              responsable: { type: 'string' },
              fecha: { type: 'string' },
              urgente: { type: 'boolean' },
            },
            required: ['titulo'],
          },
        },
      },
      required: ['proyecto_id', 'tareas'],
    },
    annotations: EDIT,
    write: true,
  },
  {
    name: 'actualizar_tareas',
    title: 'Mover o actualizar tareas',
    description:
      'Mueve tareas entre Por hacer, En curso y Hecho, y cambia lo que haga falta (hasta 50 de una vez). Úsala al empezar una tarea (en_curso) y al terminarla (hecho). «agregar_nota» suma una línea con la fecha a sus notas (avance, lo que falta). Pasar a Hecho no la valida: eso lo hace una persona en la app.',
    inputSchema: {
      type: 'object',
      properties: {
        cambios: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id de la tarea' },
              estado: ESTADO,
              agregar_nota: { type: 'string', description: 'Una línea de avance que se suma a sus notas' },
              titulo: { type: 'string' },
              notas: { type: 'string', description: 'Reemplaza todas las notas' },
              area: { type: 'string', description: 'Nombre del área, o «ninguna»' },
              responsable: { type: 'string', description: 'Nombre, usuario, «yo» o «nadie»' },
              fecha: { type: 'string', description: 'AAAA-MM-DD, «hoy», «mañana» o «ninguna»' },
              urgente: { type: 'boolean' },
            },
            required: ['id'],
          },
        },
      },
      required: ['cambios'],
    },
    annotations: EDIT,
    write: true,
  },
] as const

export const PROYECTO_INSTRUCCIONES = [
  '',
  'Rockie también tiene Proyectos: cada proyecto tiene áreas (Diseño, Ventas…) y tareas que pasan por Por hacer → En curso → Hecho.',
  '- Empieza con ver_proyectos y ver_tareas. Al empezar a trabajar en una tarea, muévela a en_curso (actualizar_tareas);',
  '  al terminarla, a hecho, con una agregar_nota corta de lo que se hizo. Si descubres trabajo nuevo, créalo (crear_tareas).',
  '- Mueve en lote: una sola llamada con varios cambios. No vuelvas a pedir la lista entera después de cada cambio.',
  '- Las áreas vienen numeradas (1, 2, 3…) y también se eligen por número: si un nombre sale «aún cifrado», usa su número.',
  '- Hecho no es validada: la validación (y su XP) la da una persona en la app. No digas que quedó validada.',
  '- Solo ves los proyectos que su dueño abrió para Claude. Si te pide otro, dile que lo abra en Rockie › Proyectos ›',
  '  Ajustes del proyecto › Claude.',
].join('\n')

// ---------- datos ----------
type Space = { id: string; name: string }
type Member = { user_id: string; role: string; display_name: string; username: string }
type Area = { id: string; name: string; color: string; position: number; n?: number }
type Task = {
  id: string
  title: string
  notes: string
  status: Status
  area_id: string | null
  assignee_id: string | null
  due_date: string | null
  priority: string
  validation: string | null
  updated_at: string
  cifrada?: boolean
}

// Recién abierto para Claude, lo cifrado sigue cifrado hasta que la app del dueño lo lee y lo reescribe en claro
// (pasa sola al abrir Rockie en cualquier dispositivo). Mientras tanto se muestra legible y no se toca.
const cifrado = (v: unknown) => typeof v === 'string' && /^c[fj]1\./.test(v)
const PENDIENTE =
  'Todavía hay cosas cifradas en este proyecto: se terminan de abrir solas cuando su dueño abre Rockie (rockie.plus) en su teléfono o su PC. Mientras tanto no se pueden leer ni cambiar.'

/** Tus proyectos: los abiertos (con su nombre en claro) y cuántos tienes cerrados. */
async function misProyectos(ctx: Ctx): Promise<{ abiertos: Space[]; cerrados: number }> {
  const { data: ms } = await ctx.db.from('space_members').select('space_id').eq('user_id', ctx.uid)
  const ids = (ms ?? []).map((m: { space_id: string }) => m.space_id)
  if (!ids.length) return { abiertos: [], cerrados: 0 }
  const { data } = await ctx.db.from('spaces').select('id, name, abierto_claude').in('id', ids)
  const all = (data ?? []) as (Space & { abierto_claude: boolean })[]
  return {
    abiertos: all.filter((s) => s.abierto_claude).map(({ id, name }) => ({ id, name: cifrado(name) ? '(nombre todavía cifrado)' : name })),
    cerrados: all.filter((s) => !s.abierto_claude).length,
  }
}

/** Un proyecto abierto del que eres miembro (o el motivo por el que no). */
async function proyecto(ctx: Ctx, id: string): Promise<Space | string> {
  if (!UUID.test(id)) return 'Ese id de proyecto no es válido. Míralo con ver_proyectos.'
  const { abiertos } = await misProyectos(ctx)
  return abiertos.find((s) => s.id === id) ?? 'No encontré ese proyecto entre los abiertos para Claude. Mira cuáles hay con ver_proyectos.'
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
async function areas(ctx: Ctx, sid: string): Promise<Area[]> {
  const { data } = await ctx.db.from('areas').select('id, name, color, position').eq('space_id', sid).eq('abierta', true).order('position')
  // numeradas en su orden (1, 2, 3…): también se eligen por número
  return ((data ?? []) as Area[]).map((a, i) => ({ ...a, name: cifrado(a.name) ? `Área ${i + 1} (aún cifrada)` : a.name, n: i + 1 }))
}
async function tareas(ctx: Ctx, sid: string): Promise<Task[]> {
  const { data } = await ctx.db
    .from('tasks')
    .select('id, title, notes, status, area_id, assignee_id, due_date, priority, validation, updated_at')
    .eq('space_id', sid)
    .eq('abierta', true)
    .order('position')
    .limit(2000)
  return ((data ?? []) as Task[]).map((t) => ({ ...t, cifrada: cifrado(t.title) || cifrado(t.notes), title: cifrado(t.title) ? '(tarea todavía cifrada)' : t.title, notes: cifrado(t.notes) ? '' : t.notes }))
}

/** La fecha de hoy en la zona horaria de la persona (para «hoy» y «mañana»). */
async function hoy(ctx: Ctx): Promise<string> {
  const { data } = await ctx.db.from('profiles').select('timezone').eq('id', ctx.uid).maybeSingle()
  const tz = (data as { timezone?: string } | null)?.timezone || 'America/Lima'
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}
const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** «2026-10-20», «hoy», «mañana», «ninguna» → la fecha (null = quitarla; undefined = no se entiende) */
function fechaDe(v: string, hoyDia: string): string | null | undefined {
  const s = fold(v)
  if (['ninguna', 'sin fecha', 'nada', 'quitar'].includes(s)) return null
  if (s === 'hoy') return hoyDia
  if (s === 'manana') return sumarDias(hoyDia, 1)
  if (s === 'pasado manana') return sumarDias(hoyDia, 2)
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined
}
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
    console.error(name, e)
    return oops('Algo falló en Proyectos. Intenta de nuevo en un momento.')
  }
}

async function verProyectos(ctx: Ctx): Promise<Result> {
  const { abiertos, cerrados } = await misProyectos(ctx)
  const aviso = cerrados
    ? `\n${cerrados === 1 ? '1 proyecto más está cerrado' : `${cerrados} proyectos más están cerrados`} para Claude (cifrados). Su dueño puede abrirlos en Rockie › Proyectos › Ajustes del proyecto › Claude.`
    : ''
  if (!abiertos.length) return text(`No tienes proyectos abiertos para Claude.${aviso}`)
  const ids = abiertos.map((s) => s.id)
  const [{ data: ts }, { data: ars }] = await Promise.all([
    ctx.db.from('tasks').select('space_id, status, title').in('space_id', ids).eq('abierta', true),
    ctx.db.from('areas').select('space_id, name, position').in('space_id', ids).eq('abierta', true).order('position'),
  ])
  const lines = abiertos.map((s) => {
    const mias = ((ts ?? []) as { space_id: string; status: Status; title: string }[]).filter((t) => t.space_id === s.id)
    const n = (st: Status) => mias.filter((t) => t.status === st).length
    const ar = ((ars ?? []) as { space_id: string; name: string }[]).filter((a) => a.space_id === s.id)
    const nombres = ar.map((a, i) => `${i + 1}. ${cifrado(a.name) ? '(aún cifrada)' : a.name}`)
    const pendientes = mias.filter((t) => cifrado(t.title)).length + ar.filter((a) => cifrado(a.name)).length + (s.name.startsWith('(nombre') ? 1 : 0)
    return `📁 ${s.name} [${s.id}]\n   ${n('todo')} por hacer · ${n('doing')} en curso · ${n('done')} hechas${nombres.length ? `\n   áreas: ${nombres.join(' · ')}` : ' · sin áreas'}${pendientes ? `\n   ⚠️ ${PENDIENTE}` : ''}`
  })
  return text(`${lines.join('\n')}${aviso}`)
}

async function verTareas(ctx: Ctx, args: Args): Promise<Result> {
  const p = await proyecto(ctx, asStr(args.proyecto_id, 60))
  if (typeof p === 'string') return oops(p)
  const [ts, ar, ms] = await Promise.all([tareas(ctx, p.id), areas(ctx, p.id), miembros(ctx, p.id)])
  const soloEstado = args.estado ? estadoDe(args.estado) : null
  if (args.estado && !soloEstado) return oops('El estado es por_hacer, en_curso o hecho.')
  let lista = ts
  if (args.area) {
    const a = areaDe(asStr(args.area, 60), ar)
    if (!a) return oops(`No hay un área «${asStr(args.area, 60)}». Las áreas son: ${ar.map((x) => `${x.n}. ${x.name}`).join(', ') || 'ninguna'} (también se eligen por número).`)
    lista = lista.filter((t) => t.area_id === a.id)
  }
  const q = fold(asStr(args.buscar, 120))
  if (q) lista = lista.filter((t) => fold(`${t.title} ${t.notes}`).includes(q))
  const areaN = new Map(ar.map((a) => [a.id, a.name]))
  const quien = new Map(ms.map((m) => [m.user_id, m.display_name || m.username]))
  const fila = (t: Task) =>
    `- ${t.title} [${t.id}]${t.area_id && areaN.get(t.area_id) ? ` · ${areaN.get(t.area_id)}` : ''}${t.assignee_id ? ` · ${quien.get(t.assignee_id) ?? 'alguien'}` : ''}${t.due_date ? ` · vence ${t.due_date}` : ''}${t.priority === 'urgent' ? ' · urgente' : ''}${t.status === 'done' ? (t.validation ? ' · validada' : ' · por validar') : ''}`
  const out: string[] = [`📁 ${p.name}`]
  if (ts.some((t) => t.cifrada) || ar.some((a) => a.name.endsWith('(aún cifrada)'))) out.push(`⚠️ ${PENDIENTE}`)
  for (const st of ['doing', 'todo', 'done'] as Status[]) {
    if (soloEstado && st !== soloEstado) continue
    let grupo = lista.filter((t) => t.status === st)
    const total = grupo.length
    // las hechas pesan poco: las 15 más recientes, salvo que las pidan
    if (st === 'done' && !soloEstado) grupo = grupo.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 15)
    out.push(`\n${NOMBRE[st]} (${total})`)
    out.push(...(grupo.length ? grupo.slice(0, 200).map(fila) : ['  (ninguna)']))
    if (total > grupo.length) out.push(`  … y ${total - grupo.length} más (ver_tareas con estado)`)
  }
  out.push(`\nÁbrelo en la app: ${enlace(ctx, p.id)}`)
  return text(out.join('\n').slice(0, 40_000))
}

async function crearTareas(ctx: Ctx, args: Args): Promise<Result> {
  const p = await proyecto(ctx, asStr(args.proyecto_id, 60))
  if (typeof p === 'string') return oops(p)
  const lista = Array.isArray(args.tareas) ? (args.tareas as Args[]).slice(0, 30) : []
  if (!lista.length) return oops('Dime al menos una tarea (tareas: [{ titulo }]).')
  const [ar, ms, hoyDia] = await Promise.all([areas(ctx, p.id), miembros(ctx, p.id), hoy(ctx)])
  const hechas: string[] = []
  const errores: string[] = []
  for (const t of lista) {
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
    const { data, error } = await ctx.db.rpc('mcp_crear_tarea', {
      p_uid: ctx.uid,
      p_space: p.id,
      p_title: titulo,
      p_notes: asStr(t.notas, 20_000),
      p_status: estado,
      p_area: area?.id ?? null,
      p_assignee: persona?.user_id ?? null,
      p_due: fecha,
      p_priority: t.urgente === true ? 'urgent' : 'normal',
    })
    if (error) errores.push(`«${titulo}»: ${error.message}`)
    else hechas.push(`- ${titulo} [${data}] · ${NOMBRE[estado]}${area ? ` · ${area.name}` : ''}`)
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
  const abiertosId = new Set(abiertos.map((s) => s.id))
  const { data } = ids.length
    ? await ctx.db.from('tasks').select('id, space_id, title, notes, status, abierta').in('id', ids)
    : { data: [] }
  const porId = new Map(((data ?? []) as (Task & { space_id: string; abierta: boolean })[]).map((t) => [t.id, t]))
  const cache = new Map<string, { ar: Area[]; ms: Member[] }>()
  const datos = async (sid: string) => {
    if (!cache.has(sid)) cache.set(sid, { ar: await areas(ctx, sid), ms: await miembros(ctx, sid) })
    return cache.get(sid)!
  }
  const hoyDia = await hoy(ctx)
  const hechas: string[] = []
  const errores: string[] = []
  for (const c of cambios) {
    const id = asStr(c.id, 60)
    const t = porId.get(id)
    if (!t || !abiertosId.has(t.space_id) || !t.abierta) {
      errores.push(`${id}: no está en tus proyectos abiertos para Claude`)
      continue
    }
    // recién abierta y todavía cifrada: no se toca (sumarle una nota en claro a un texto cifrado lo rompería)
    if (cifrado(t.title) || cifrado(t.notes)) {
      errores.push(`${id}: todavía está cifrada. ${PENDIENTE}`)
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
    if (typeof c.titulo === 'string' && c.titulo.trim()) {
      patch.title = c.titulo.trim().slice(0, 200)
      dice.push('título nuevo')
    }
    let notas = typeof c.notas === 'string' ? c.notas.slice(0, 20_000) : null
    if (typeof c.agregar_nota === 'string' && c.agregar_nota.trim()) {
      const base = notas ?? t.notes ?? ''
      notas = `${base}${base.trim() ? '\n' : ''}- ${hoyDia}: ${c.agregar_nota.trim().slice(0, 2000)}`
      dice.push('nota de avance')
    }
    if (notas !== null) patch.notes = notas
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
    if (typeof c.urgente === 'boolean') {
      patch.priority = c.urgente ? 'urgent' : 'normal'
      dice.push(c.urgente ? 'urgente' : 'normal')
    }
    if (!Object.keys(patch).length) {
      hechas.push(`- ${t.title}: ya estaba así`)
      continue
    }
    const { error } = await ctx.db.rpc('mcp_actualizar_tarea', { p_uid: ctx.uid, p_task: id, p_patch: patch })
    if (error) errores.push(`«${t.title}»: ${error.message}`)
    else hechas.push(`- ${patch.title ?? t.title} ${dice.join(' · ')}`)
  }
  const out = [hechas.length ? `Listo:\n${hechas.join('\n')}` : 'No cambié nada.']
  if (errores.length) out.push(`\nNo pude con:\n${errores.map((e) => `- ${e}`).join('\n')}`)
  if (cambios.some((c) => estadoDe(c.estado) === 'done')) out.push('\n(Las que pasaron a Hecho quedan por validar: eso lo hace una persona en la app.)')
  return hechas.length ? text(out.join('\n')) : oops(out.join('\n'))
}

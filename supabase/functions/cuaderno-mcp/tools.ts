// Las herramientas que Claude usa en tu cuaderno. Todas trabajan con el dueño explícito (el servidor
// usa la llave de servicio, así que CADA consulta filtra por user_id). No hay herramienta para borrar:
// eso se hace en la app.
// Privacidad (el Cofre, docs/privacidad.md): el cuaderno está cifrado en el dispositivo. Claude solo ve y escribe
// lo que la persona abrió para Claude (libretas con abierta_claude; sus páginas y tarjetas tienen abierta = true).
// Todo lo demás no existe para este servidor: no puede leerlo.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { embed } from '../_shared/rockie-llm.ts'
import { callProyecto, PROYECTO_INSTRUCCIONES, PROYECTO_TOOLS } from './proyectos.ts'
import { sinContenido } from '../_shared/registro.ts'

export type Scope = 'leer' | 'escribir'
export type Ctx = { db: SupabaseClient; uid: string; scope: Scope; origin: string }
type Args = Record<string, unknown>
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }

export const INSTRUCTIONS = [
  'Rockie: el Cuaderno (carpetas → cuadernos → páginas Markdown, subnotas, conexiones, tarjetas de repaso) y Proyectos.',
  '- Antes de crear, busca (buscar) y mira dónde va (ver_cuaderno); si ya existe, suma con editar_pagina.',
  '- [[Título exacto]] en el contenido conecta páginas. Sin cuaderno, van a «Desde Claude». Nunca borra.',
  '- Para estudiar: crear_tarjetas; para tomar examen: tarjetas_para_hoy de a una y registrar_repaso por respuesta.',
  '- Comparte el enlace de lo que crees. Solo ves lo abierto para Claude; lo demás está cifrado.',
  PROYECTO_INSTRUCCIONES,
].join('\n')

// ---------- las herramientas (cortas y estables: van en cada mensaje del usuario) ----------
const S = { type: 'string' }
const READ = { readOnlyHint: true, openWorldHint: false }
const ADD = { destructiveHint: false, openWorldHint: false }

const TOOLS = [
  {
    name: 'ver_cuaderno',
    title: 'Ver el cuaderno',
    description: 'Carpetas y cuadernos (con id) y sus páginas. Con carpeta_id, todo lo de esa carpeta.',
    inputSchema: { type: 'object', properties: { carpeta_id: S } },
    annotations: READ,
    write: false,
  },
  {
    name: 'buscar',
    title: 'Buscar',
    description: 'Busca páginas por significado y palabras: título, id, dónde está y un fragmento.',
    inputSchema: { type: 'object', properties: { consulta: S, limite: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['consulta'] },
    annotations: READ,
    write: false,
  },
  {
    name: 'leer_pagina',
    title: 'Leer página',
    description: 'Una página en Markdown, por partes: desde (carácter, 0) y cuanto (6000 por defecto, máx. 20000).',
    inputSchema: { type: 'object', properties: { id: S, desde: { type: 'integer', minimum: 0 }, cuanto: { type: 'integer', minimum: 500, maximum: 20000 } }, required: ['id'] },
    annotations: READ,
    write: false,
  },
  {
    name: 'crear_paginas',
    title: 'Crear páginas',
    description: 'Crea 1 a 30 páginas en un cuaderno (cuaderno_id, o «cuaderno» por nombre o ruta «A/B»). tema = página madre; relacionadas = ids o títulos a conectar.',
    inputSchema: {
      type: 'object',
      properties: {
        paginas: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: { type: 'object', properties: { titulo: S, contenido: S, tema: S, tema_id: S, relacionadas: { type: 'array', maxItems: 20, items: S } }, required: ['titulo'] },
        },
        cuaderno_id: S,
        cuaderno: S,
      },
      required: ['paginas'],
    },
    annotations: ADD,
    write: true,
  },
  {
    name: 'editar_pagina',
    title: 'Editar página',
    description: 'Suma al final (modo agregar) o reescribe (modo reemplazar: solo si lo pidió). También cambia el título.',
    inputSchema: { type: 'object', properties: { id: S, contenido: S, modo: { type: 'string', enum: ['agregar', 'reemplazar'] }, titulo: S }, required: ['id'] },
    annotations: { destructiveHint: true, openWorldHint: false },
    write: true,
  },
  {
    name: 'crear_carpeta',
    title: 'Crear carpeta',
    description: 'Crea una carpeta o un cuaderno (tipo), dentro de otro si se da dentro_de_id. Si ya existe, devuelve ese.',
    inputSchema: { type: 'object', properties: { nombre: S, tipo: { type: 'string', enum: ['carpeta', 'cuaderno'] }, dentro_de_id: S }, required: ['nombre'] },
    annotations: ADD,
    write: true,
  },
  {
    name: 'conectar_paginas',
    title: 'Conectar páginas',
    description: 'Conecta dos páginas en el mapa, con el motivo en una frase.',
    inputSchema: { type: 'object', properties: { a_id: S, b_id: S, motivo: S }, required: ['a_id', 'b_id', 'motivo'] },
    annotations: ADD,
    write: true,
  },
  {
    name: 'crear_tarjetas',
    title: 'Crear tarjetas',
    description: 'Hasta 40 tarjetas de repaso (pregunta → respuesta cortas) de una página.',
    inputSchema: {
      type: 'object',
      properties: {
        pagina_id: S,
        tarjetas: { type: 'array', minItems: 1, maxItems: 40, items: { type: 'object', properties: { pregunta: S, respuesta: S }, required: ['pregunta', 'respuesta'] } },
      },
      required: ['pagina_id', 'tarjetas'],
    },
    annotations: ADD,
    write: true,
  },
  {
    name: 'tarjetas_para_hoy',
    title: 'Tarjetas de hoy',
    description: 'Las tarjetas que tocan hoy (id, pregunta, respuesta). No muestres la respuesta antes de tiempo.',
    inputSchema: { type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 30 } } },
    annotations: READ,
    write: false,
  },
  {
    name: 'registrar_repaso',
    title: 'Registrar repaso',
    description: 'Si se acordó de una tarjeta: sube de caja; si no, vuelve a empezar. Cuenta para su racha.',
    inputSchema: { type: 'object', properties: { tarjeta_id: S, me_acorde: { type: 'boolean' } }, required: ['tarjeta_id', 'me_acorde'] },
    annotations: ADD,
    write: true,
  },
] as const

/** Las herramientas que ve esta conexión (una de solo lectura no ve las que escriben). */
export function toolsFor(scope: Scope) {
  return [...TOOLS, ...PROYECTO_TOOLS].filter((t) => scope === 'escribir' || !t.write).map(({ write: _w, ...t }) => t)
}

// ---------- utilidades ----------
const text = (t: string): Result => ({ content: [{ type: 'text', text: t }] })
const oops = (t: string): Result => ({ content: [{ type: 'text', text: t }], isError: true })
const NOTE_HREF = 'cuaderno://nota/'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
const asStr = (v: unknown, max = 60_000) => (typeof v === 'string' ? v.slice(0, max) : '')
const MAX_BODY = 60_000
const COLOR_ORDER = ['berry', 'coral', 'title', 'amber', 'olive', 'green', 'accent', 'navy']

type Book = { id: string; name: string; kind: 'carpeta' | 'cuaderno'; parent_id: string | null; color: string | null; position: number }
type NoteRow = { id: string; title: string; book_id: string | null; parent_note_id: string | null; kind: string; position: number; updated_at: string }

async function books(ctx: Ctx): Promise<Book[]> {
  const { data } = await ctx.db
    .from('cuaderno_books')
    .select('id, name, kind, parent_id, color, position, abierta_claude')
    .eq('user_id', ctx.uid)
    .order('position')
  const all = (data ?? []) as (Book & { abierta_claude: boolean })[]
  const byId = new Map(all.map((b) => [b.id, b]))
  const open = (b: Book & { abierta_claude: boolean }): boolean => {
    for (let cur: (Book & { abierta_claude: boolean }) | undefined = b, i = 0; cur && i < 8; cur = byId.get(cur.parent_id ?? ''), i++) {
      if (cur.abierta_claude) return true
    }
    return false
  }
  const abiertas = all.filter(open)
  const ids = new Set(abiertas.map((b) => b.id))
  // una abierta dentro de una carpeta cerrada: cuelga de la raíz (el nombre de arriba está cifrado)
  return abiertas.map(({ abierta_claude: _a, ...b }) => ({ ...b, parent_id: b.parent_id && ids.has(b.parent_id) ? b.parent_id : null }))
}
async function notes(ctx: Ctx): Promise<NoteRow[]> {
  const { data } = await ctx.db
    .from('cuaderno_notes')
    .select('id, title, book_id, parent_note_id, kind, position, updated_at')
    .eq('user_id', ctx.uid)
    .eq('abierta', true)
    .order('position')
    .limit(5000)
  return (data ?? []) as NoteRow[]
}
const pathOf = (id: string | null, all: Book[]) => {
  const out: string[] = []
  let cur = all.find((b) => b.id === id)
  for (let i = 0; cur && i < 6; i++) {
    out.unshift(cur.name)
    cur = all.find((b) => b.id === cur!.parent_id)
  }
  return out.length ? out.join(' / ') : 'Sueltas'
}
const linkOf = (ctx: Ctx, id: string) => `${ctx.origin}/cuaderno/nota/${id}`

/** Texto sin marcas de Markdown (para fragmentos). */
function plain(md: string) {
  return md
    .replace(/^:::.*$/gm, '')
    .replace(/<(span|mark) data-color="[a-z]+">|<\/(span|mark)>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|==|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** El Markdown de Claude, listo para el editor: títulos hasta ###, y [[Título]] → enlace a esa página. */
function prepare(md: string, byTitle: Map<string, { id: string; title: string }>) {
  const targets = new Set<string>()
  const missing = new Set<string>()
  const body = md
    .replace(/\r\n/g, '\n')
    .replace(/^#{4,6}\s/gm, '### ')
    .replace(/\[\[([^[\]|\n]{1,160})(?:\|([^[\]\n]{1,160}))?\]\]/g, (m, t: string, alias?: string) => {
      const hit = byTitle.get(fold(t))
      if (!hit) {
        missing.add(t.trim())
        return m
      }
      targets.add(hit.id)
      return `[${(alias ?? hit.title).replace(/[[\]]/g, '')}](${NOTE_HREF}${hit.id})`
    })
  return { body, targets: [...targets], missing: [...missing] }
}
/** Al revés, para leer: los enlaces a tus páginas se muestran como [[Título]]. */
function toWiki(md: string, byId: Map<string, string>) {
  return md.replace(/\[([^\]]+)\]\(cuaderno:\/\/nota\/([0-9a-f-]{36})\)/g, (m, label: string, id: string) => {
    const t = byId.get(id)
    if (!t) return m
    return label === t ? `[[${t}]]` : `[[${t}|${label}]]`
  })
}

const titleMap = (all: NoteRow[]) => {
  const m = new Map<string, { id: string; title: string }>()
  // la más reciente gana si hay dos con el mismo título
  for (const n of [...all].sort((a, b) => a.updated_at.localeCompare(b.updated_at))) m.set(fold(n.title), { id: n.id, title: n.title })
  return m
}

/** Conecta from con cada destino y cuenta lo que de verdad pasó (las ya conectadas no se duplican). */
async function linkAll(ctx: Ctx, from: string, targets: string[], reason = 'Enlazadas con [[…]] (desde Claude)') {
  const r = { nuevas: [] as string[], ya: [] as string[], fallidas: [] as string[] }
  for (const b of new Set(targets)) {
    if (b === from) continue
    const { error } = await ctx.db.from('cuaderno_links').insert({ user_id: ctx.uid, a_id: from, b_id: b, reason })
    if (!error) r.nuevas.push(b)
    else if (error.code === '23505') r.ya.push(b)
    else r.fallidas.push(b)
  }
  return r
}

async function embedNotes(ctx: Ctx, ids: string[]) {
  if (!ids.length) return
  try {
    const { data } = await ctx.db.from('cuaderno_notes').select('id, title, body').eq('user_id', ctx.uid).in('id', ids)
    const rows = data ?? []
    const vecs = await embed(rows.map((n) => `${n.title}\n\n${n.body}`.slice(0, 8000)))
    if (!vecs) return
    await Promise.all(
      rows.map((n, i) =>
        ctx.db.from('cuaderno_notes').update({ embedding: JSON.stringify(vecs[i]), embedded_at: new Date().toISOString() }).eq('id', n.id).eq('user_id', ctx.uid),
      ),
    )
  } catch (e) {
    console.error('embed', sinContenido(e))
  }
}

async function today(ctx: Ctx) {
  const { data } = await ctx.db.from('profiles').select('timezone').eq('id', ctx.uid).maybeSingle()
  const tz = (data?.timezone as string) || 'America/Lima'
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const INTERVALS = [1, 3, 7, 16, 35]

// ---------- dónde guardar ----------
async function bookFor(ctx: Ctx, args: Args, all: Book[]): Promise<{ id: string | null; created: string[] } | { error: string }> {
  const id = asStr(args.cuaderno_id, 60)
  if (id) {
    if (!all.some((b) => b.id === id)) return { error: `No encontré el cuaderno ${id}. Usa ver_cuaderno para ver los ids.` }
    return { id, created: [] }
  }
  const path = asStr(args.cuaderno, 300).split(/\s*[/›>]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
  if (!path.length) return { id: null, created: [] }
  // un solo nombre: si ya existe en cualquier parte (y es uno solo), ese
  if (path.length === 1) {
    const hits = all.filter((b) => fold(b.name) === fold(path[0]))
    if (hits.length === 1) return { id: hits[0].id, created: [] }
  }
  let parent: Book | null = null
  const created: string[] = []
  for (let i = 0; i < path.length; i++) {
    const found = all.find((b) => b.parent_id === (parent?.id ?? null) && fold(b.name) === fold(path[i]))
    if (found) {
      parent = found
      continue
    }
    const last = i === path.length - 1
    // una carpeta no va dentro de un cuaderno: dentro de un cuaderno, todo es cuaderno (sección)
    const kind: Book['kind'] = last || parent?.kind === 'cuaderno' ? 'cuaderno' : 'carpeta'
    const b = await makeBook(ctx, path[i], kind, parent?.id ?? null, all)
    if ('error' in b) return b
    all.push(b)
    created.push(pathOf(b.id, all))
    parent = b
  }
  return { id: parent?.id ?? null, created }
}

async function makeBook(ctx: Ctx, name: string, kind: Book['kind'], parentId: string | null, all: Book[]): Promise<Book | { error: string }> {
  const used = all.filter((b) => !b.parent_id).map((b) => b.color)
  const color = parentId ? null : (COLOR_ORDER.find((c) => !used.includes(c)) ?? COLOR_ORDER[used.length % COLOR_ORDER.length])
  const { data, error } = await ctx.db
    .from('cuaderno_books')
    .insert({ user_id: ctx.uid, name: name.slice(0, 80), kind, parent_id: parentId, color, position: Date.now() / 1000, abierta_claude: true })
    .select('id, name, kind, parent_id, color, position')
    .single()
  if (error) return { error: /niveles/.test(error.message) ? 'Como mucho 4 niveles de carpetas.' : /cuaderno/.test(error.message) ? 'Una carpeta no puede ir dentro de un cuaderno.' : 'No pude crear la carpeta.' }
  return data as Book
}

/** ¿Es la nota de una tarea de un proyecto abierto para Claude del que esta persona es miembro? (entonces la puede
 *  leer y editar aunque la haya creado otra persona del equipo). */
async function notaDeProyecto(ctx: Ctx, id: string): Promise<boolean> {
  const { data: m } = await ctx.db.from('materials').select('space_id').eq('note_id', id).eq('kind', 'note').not('task_id', 'is', null).limit(1).maybeSingle()
  if (!m) return false
  const sid = (m as { space_id: string }).space_id
  const [{ data: sp }, { data: yo }] = await Promise.all([
    ctx.db.from('spaces').select('abierto_claude').eq('id', sid).maybeSingle(),
    ctx.db.from('space_members').select('user_id').eq('space_id', sid).eq('user_id', ctx.uid).maybeSingle(),
  ])
  return Boolean((sp as { abierto_claude?: boolean } | null)?.abierto_claude && yo)
}
const enCifrado = (v: unknown) => typeof v === 'string' && /^c[fj]1\./.test(v)
const AUN_CIFRADA = 'Esa nota todavía está cifrada: se abre sola cuando su dueña entra a Rockie (rockie.plus). Mientras tanto no se puede leer ni cambiar.'

// ---------- cada herramienta ----------
export async function callTool(name: string, args: Args, ctx: Ctx): Promise<Result> {
  const deProyectos = await callProyecto(name, args, ctx)
  if (deProyectos) return deProyectos
  const tool = TOOLS.find((t) => t.name === name)
  if (tool?.write && ctx.scope !== 'escribir') return oops('Esta conexión es de solo lectura. El usuario puede darle permiso de escribir reconectando el cuaderno.')
  try {
    switch (name) {
      case 'ver_cuaderno':
        return await verCuaderno(ctx, args)
      case 'buscar':
        return await buscar(ctx, args)
      case 'leer_pagina':
        return await leerPagina(ctx, args)
      case 'crear_paginas':
        return await crearPaginas(ctx, args)
      case 'editar_pagina':
        return await editarPagina(ctx, args)
      case 'crear_carpeta':
        return await crearCarpeta(ctx, args)
      case 'conectar_paginas':
        return await conectar(ctx, args)
      case 'crear_tarjetas':
        return await crearTarjetas(ctx, args)
      case 'tarjetas_para_hoy':
        return await paraHoy(ctx, args)
      case 'registrar_repaso':
        return await registrar(ctx, args)
    }
    return oops(`No existe la herramienta ${name}`)
  } catch (e) {
    console.error(name, sinContenido(e))
    return oops('Algo falló en el cuaderno. Intenta de nuevo en un momento.')
  }
}

async function verCuaderno(ctx: Ctx, args: Args) {
  const [bs, ns] = await Promise.all([books(ctx), notes(ctx)])
  const kids = (id: string | null) => bs.filter((b) => b.parent_id === id)
  const pagesOf = (id: string | null) => ns.filter((n) => n.book_id === id && !n.parent_note_id)
  const subsOf = (id: string) => ns.filter((n) => n.parent_note_id === id)
  const lines: string[] = []
  const icon = (b: Book) => (b.kind === 'carpeta' ? '📁' : '📓')
  const pageLine = (n: NoteRow, depth: number, deep: boolean) => {
    lines.push(`${'  '.repeat(depth)}- ${n.kind === 'pizarra' ? '🧩 ' : ''}${n.title} [${n.id}]`)
    const subs = subsOf(n.id)
    if (subs.length && deep) for (const s of subs) pageLine(s, depth + 1, deep)
    else if (subs.length) lines.push(`${'  '.repeat(depth + 1)}(${subs.length} subnotas)`)
  }
  const id = asStr(args.carpeta_id, 60)
  if (id) {
    const b = bs.find((x) => x.id === id)
    if (!b) return oops(`No encontré la carpeta o cuaderno ${id}.`)
    lines.push(`${icon(b)} ${pathOf(b.id, bs)} (${b.kind}) [${b.id}]`)
    const walk = (bk: Book, depth: number) => {
      for (const n of pagesOf(bk.id).slice(0, 300)) pageLine(n, depth, true)
      for (const k of kids(bk.id)) {
        lines.push(`${'  '.repeat(depth)}${icon(k)} ${k.name} (${k.kind}) [${k.id}]`)
        walk(k, depth + 1)
      }
    }
    walk(b, 1)
    if (lines.length === 1) lines.push('  (vacío)')
    return text(lines.join('\n').slice(0, 30_000))
  }
  const walk = (parent: string | null, depth: number) => {
    for (const b of kids(parent)) {
      const pages = pagesOf(b.id)
      lines.push(`${'  '.repeat(depth)}${icon(b)} ${b.name} (${b.kind}, ${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}) [${b.id}]`)
      for (const n of pages.slice(0, 12)) pageLine(n, depth + 1, false)
      if (pages.length > 12) lines.push(`${'  '.repeat(depth + 1)}… y ${pages.length - 12} más (ver_cuaderno con carpeta_id)`)
      walk(b.id, depth + 1)
    }
  }
  walk(null, 0)
  const loose = pagesOf(null)
  if (loose.length) {
    lines.push(`📄 Sueltas (${loose.length} ${loose.length === 1 ? 'página' : 'páginas'}, sin cuaderno)`)
    for (const n of [...loose].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 15)) pageLine(n, 1, false)
  }
  if (!lines.length) return text('El cuaderno está vacío. Puedes crear el primer cuaderno con crear_carpeta o directamente una página con crear_pagina.')
  return text(`${lines.join('\n').slice(0, 30_000)}\n\nAbre el cuaderno: ${ctx.origin}/cuaderno`)
}

async function buscar(ctx: Ctx, args: Args) {
  const q = asStr(args.consulta, 300).trim()
  if (!q) return oops('Dime qué buscar.')
  const k = Math.min(20, Math.max(1, Number(args.limite) || 6))
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const [byTitle, byBody, semantic, bs] = await Promise.all([
    ctx.db.from('cuaderno_notes').select('id, title, body, book_id').eq('user_id', ctx.uid).eq('abierta', true).ilike('title', like).limit(k),
    ctx.db.from('cuaderno_notes').select('id, title, body, book_id').eq('user_id', ctx.uid).eq('abierta', true).ilike('body', like).limit(k),
    (async () => {
      const v = await embed([q]).catch(() => null)
      if (!v?.[0]) return [] as { id: string; score: number }[]
      const { data } = await ctx.db.rpc('cuaderno_similar_for', { p_user: ctx.uid, q: JSON.stringify(v[0]), k })
      return ((data ?? []) as { id: string; score: number }[]).filter((r) => r.score > 0.55)
    })(),
    books(ctx),
  ])
  const found = new Map<string, { id: string; title: string; body: string; book_id: string | null }>()
  for (const r of byTitle.data ?? []) found.set(r.id, r)
  const semIds = semantic.map((s) => s.id).filter((id) => !found.has(id))
  if (semIds.length) {
    const { data } = await ctx.db.from('cuaderno_notes').select('id, title, body, book_id').eq('user_id', ctx.uid).eq('abierta', true).in('id', semIds)
    for (const id of semIds) {
      const r = (data ?? []).find((x) => x.id === id)
      if (r) found.set(r.id, r)
    }
  }
  for (const r of byBody.data ?? []) if (!found.has(r.id)) found.set(r.id, r)
  const hits = [...found.values()].slice(0, k)
  if (!hits.length) return text(`No encontré nada sobre «${q}» en los cuadernos abiertos para Claude.`)
  const lines = hits.map((n) => {
    const p = plain(n.body)
    const at = fold(p).indexOf(fold(q))
    const frag = at > 30 ? `…${p.slice(at - 30, at + 110)}` : p.slice(0, 140)
    return `- ${n.title} [${n.id}] · ${pathOf(n.book_id, bs)}\n  ${frag || '(vacía)'}${p.length > 140 ? '…' : ''}`
  })
  return text(`${lines.join('\n')}\nAbrir: ${ctx.origin}/cuaderno/nota/<id> · leer entera: leer_pagina`)
}

async function leerPagina(ctx: Ctx, args: Args) {
  const id = asStr(args.id, 60)
  if (!UUID.test(id)) return oops('Ese id no es de una página. Usa buscar o ver_cuaderno para encontrarlo.')
  const delProyecto = await notaDeProyecto(ctx, id)
  let q = ctx.db.from('cuaderno_notes').select('id, title, body, book_id, parent_note_id, kind, area, created_at, updated_at').eq('id', id).eq('abierta', true)
  if (!delProyecto) q = q.eq('user_id', ctx.uid)
  const { data: n } = await q.maybeSingle()
  if (!n) return oops(delProyecto ? 'Esa nota de tarea no está abierta para Claude todavía.' : 'No encontré esa página en los cuadernos abiertos para Claude (lo demás está cifrado).')
  if (enCifrado(n.title) || enCifrado(n.body)) return oops(AUN_CIFRADA)
  const [bs, ns, links, cards] = await Promise.all([
    books(ctx),
    notes(ctx),
    ctx.db.from('cuaderno_links').select('a_id, b_id, reason').eq('user_id', ctx.uid).eq('abierta', true).or(`a_id.eq.${id},b_id.eq.${id}`).not('b_id', 'is', null).limit(50),
    ctx.db.from('cuaderno_cards').select('id', { count: 'exact', head: true }).eq('user_id', ctx.uid).eq('note_id', id),
  ])
  const byId = new Map(ns.map((x) => [x.id, x.title]))
  const head = [
    `# ${n.title}`,
    `id: ${n.id} · en: ${pathOf(n.book_id, bs)}${n.kind === 'pizarra' ? ' · es una pizarra (dibujos y notas adhesivas: se ve en la app)' : ''}`,
    n.parent_note_id ? `subnota de: ${byId.get(n.parent_note_id) ?? '?'} [${n.parent_note_id}]` : '',
    (() => {
      const subs = ns.filter((x) => x.parent_note_id === n.id)
      return subs.length ? `subnotas: ${subs.map((s) => `${s.title} [${s.id}]`).join(' · ')}` : ''
    })(),
    (() => {
      const l = (links.data ?? []).map((x) => {
        const other = x.a_id === id ? x.b_id : x.a_id
        return `${byId.get(other) ?? '?'} [${other}] (${x.reason})`
      })
      return l.length ? `conectada con: ${l.join(' · ')}` : ''
    })(),
    cards.count ? `tarjetas de repaso: ${cards.count}` : '',
    `abrir: ${linkOf(ctx, n.id)}`,
  ].filter(Boolean)
  const body = toWiki(n.body || '', byId)
  // por partes: lo que pidieron (6000 caracteres por defecto), cortando en un salto de línea si queda cerca
  const desde = Math.max(0, Math.min(Number(args.desde) || 0, body.length))
  const cuanto = Math.min(20_000, Math.max(500, Number(args.cuanto) || 6000))
  let hasta = Math.min(body.length, desde + cuanto)
  if (hasta < body.length) {
    const salto = body.lastIndexOf('\n', hasta)
    if (salto > desde + cuanto * 0.7) hasta = salto + 1
  }
  const parte = body.slice(desde, hasta)
  const sigue = hasta < body.length ? `\n\n[sigue: leer_pagina con desde=${hasta} · quedan ${body.length - hasta} caracteres]` : ''
  const cabeza = desde ? `# ${n.title} [${n.id}] · desde ${desde}` : head.join('\n')
  return text(`${cabeza}\n\n---\n\n${parte || '(la página está vacía)'}${sigue}`)
}

async function crearPaginas(ctx: Ctx, args: Args) {
  const raw = Array.isArray(args.paginas) ? (args.paginas as Args[]).slice(0, 30) : []
  const items = raw.map((p) => ({
    titulo: asStr(p.titulo, 160).trim(),
    contenido: asStr(p.contenido, MAX_BODY),
    tema: asStr(p.tema, 160).trim(),
    tema_id: asStr(p.tema_id, 60),
    relacionadas: (Array.isArray(p.relacionadas) ? p.relacionadas : []).map((x) => asStr(x, 160).trim()).filter(Boolean).slice(0, 20),
  }))
  if (!items.length || items.some((p) => !p.titulo)) return oops('Cada página necesita un título.')
  const [bs, ns] = await Promise.all([books(ctx), notes(ctx)])
  const where = await bookFor(ctx, args, bs)
  if ('error' in where) return oops(where.error)
  if (!where.id) {
    // sin cuaderno quedaría cifrada y Claude ya no la vería: va a «Desde Claude» (abierto para Claude)
    const ya = bs.find((b) => !b.parent_id && fold(b.name) === fold('Desde Claude'))
    const b = ya ?? (await makeBook(ctx, 'Desde Claude', 'cuaderno', null, bs))
    if ('error' in b) return oops(b.error)
    if (!ya) {
      bs.push(b)
      where.created.push('Desde Claude')
    }
    where.id = b.id
  }
  const titles = titleMap(ns)
  const made: NoteRow[] = []
  const lines: string[] = []
  for (const p of items) {
    // su tema: una página ya existente (por id o título) o una de este mismo lote
    let parent: NoteRow | undefined
    if (p.tema_id) {
      parent = ns.find((x) => x.id === p.tema_id)
      if (!parent) return oops(`No encontré la página ${p.tema_id} para usarla como tema.`)
    } else if (p.tema) {
      const t = fold(p.tema)
      parent = [...made].reverse().find((x) => fold(x.title) === t) ?? ns.find((x) => x.id === titles.get(t)?.id)
      if (!parent) return oops(`No encontré la página «${p.tema}» para usarla como tema. Créala primero o usa su id.`)
    }
    const { data, error } = await ctx.db
      .from('cuaderno_notes')
      .insert({
        user_id: ctx.uid,
        title: p.titulo,
        body: '',
        kind: 'pagina',
        book_id: parent ? parent.book_id : where.id,
        parent_note_id: parent?.id ?? null,
        position: Date.now() / 1000 + made.length / 1000,
      })
      .select('id, title, book_id, parent_note_id, kind, position, updated_at')
      .single()
    if (error || !data) return oops(`No pude crear «${p.titulo}»${made.length ? ` (sí creé ${made.length} antes)` : ''}: ${/niveles/.test(error?.message ?? '') ? 'como mucho 4 niveles de subnotas' : 'intenta de nuevo'}.`)
    made.push(data as NoteRow)
    titles.set(fold(p.titulo), { id: data.id, title: data.title })
  }
  // el contenido va después: así [[…]] puede enlazar también páginas del mismo lote
  // cada línea cuenta lo que de verdad quedó: contenido guardado, conexiones hechas y lo que no se encontró
  const nombre = (id: string) => made.find((m) => m.id === id)?.title ?? ns.find((m) => m.id === id)?.title ?? id
  let avisos = 0
  for (let i = 0; i < made.length; i++) {
    const { body, targets, missing } = prepare(items[i].contenido, titles)
    const notas: string[] = []
    if (body.trim()) {
      const { error } = await ctx.db.from('cuaderno_notes').update({ body: body.slice(0, MAX_BODY) }).eq('id', made[i].id).eq('user_id', ctx.uid)
      if (error) notas.push('⚠️ la página quedó creada pero SIN contenido (no se pudo guardar): reintenta con editar_pagina')
    }
    const rel = items[i].relacionadas.map((r) => (UUID.test(r) ? (made.find((m) => m.id === r) ?? ns.find((m) => m.id === r))?.id : titles.get(fold(r))?.id))
    const noHallo = items[i].relacionadas.filter((_, k) => !rel[k])
    const enlaces = await linkAll(ctx, made[i].id, [...targets, ...rel.filter((x): x is string => Boolean(x))])
    if (enlaces.nuevas.length) notas.push(`conectada con: ${enlaces.nuevas.map(nombre).join(', ')}`)
    if (enlaces.ya.length) notas.push(`ya estaba conectada con: ${enlaces.ya.map(nombre).join(', ')}`)
    if (enlaces.fallidas.length) notas.push(`⚠️ no pude conectarla con: ${enlaces.fallidas.map(nombre).join(', ')}`)
    if (noHallo.length) notas.push(`⚠️ no encontré (no quedaron conectadas): ${noHallo.join(', ')}`)
    if (missing.length) notas.push(`⚠️ [[…]] sin página con ese título (quedó como texto): ${missing.join(', ')}`)
    avisos += notas.filter((n) => n.startsWith('⚠️')).length
    lines.push(
      `- ${made[i].title} [${made[i].id}]${made[i].parent_note_id ? ` (subnota de ${nombre(made[i].parent_note_id!)})` : ''}\n  ${linkOf(ctx, made[i].id)}${notas.map((n) => `\n  ${n}`).join('')}`,
    )
  }
  await embedNotes(ctx, made.map((m) => m.id))
  const all = [...bs]
  const place = pathOf(made[0].book_id, all)
  const extra = where.created.length ? `\nCreé también: ${where.created.join(', ')}.` : ''
  const ojo = avisos ? `\n\nOjo: ${avisos === 1 ? 'hay 1 aviso' : `hay ${avisos} avisos`} (⚠️). Cuéntaselo al usuario tal cual; no digas que se hizo lo que no se hizo.` : ''
  return text(`${made.length === 1 ? 'Creé la página' : `Creé ${made.length} páginas`} en ${place}:${extra}\n${lines.join('\n')}${ojo}`)
}

async function editarPagina(ctx: Ctx, args: Args) {
  const id = asStr(args.id, 60)
  if (!UUID.test(id)) return oops('Ese id no es de una página.')
  const delProyecto = await notaDeProyecto(ctx, id)
  let q = ctx.db.from('cuaderno_notes').select('id, title, body').eq('id', id).eq('abierta', true)
  if (!delProyecto) q = q.eq('user_id', ctx.uid)
  const { data: n } = await q.maybeSingle()
  if (!n) return oops(delProyecto ? 'Esa nota de tarea no está abierta para Claude todavía.' : 'No encontré esa página en los cuadernos abiertos para Claude.')
  // sumarle texto en claro a una nota que sigue cifrada la rompería
  if (enCifrado(n.title) || enCifrado(n.body)) return oops(AUN_CIFRADA)
  const mode = args.modo === 'reemplazar' ? 'reemplazar' : 'agregar'
  const titulo = asStr(args.titulo, 160).trim()
  const add = asStr(args.contenido, MAX_BODY)
  if (!add.trim() && !titulo) return oops('No hay nada que cambiar.')
  const all = await notes(ctx)
  const { body, targets, missing } = prepare(add, titleMap(all))
  const next = !add.trim() ? n.body : mode === 'agregar' ? `${n.body.trimEnd()}${n.body.trim() ? '\n\n' : ''}${body.trim()}` : body.trim()
  if (next.length > MAX_BODY) return oops(`La página quedaría demasiado larga (máximo ${MAX_BODY} caracteres). Crea una subnota con crear_pagina y "tema".`)
  const patch: Record<string, string> = { body: next }
  if (titulo) patch.title = titulo
  let upd = ctx.db.from('cuaderno_notes').update(patch).eq('id', id).eq('abierta', true)
  if (!delProyecto) upd = upd.eq('user_id', ctx.uid)
  const { error } = await upd
  if (error) return oops('No pude guardar el cambio.')
  // las conexiones y la huella de significado son del cuaderno personal: en la nota de otra persona no se tocan
  const enlaces = delProyecto ? { nuevas: [] as string[], ya: [] as string[], fallidas: [] as string[] } : await linkAll(ctx, id, targets)
  if (!delProyecto) await embedNotes(ctx, [id])
  const nombre = (x: string) => all.find((m) => m.id === x)?.title ?? x
  const what = !add.trim() ? 'Le cambié el título' : mode === 'agregar' ? 'Agregué el contenido al final de' : 'Reescribí'
  const notas = [
    enlaces.nuevas.length ? `conectada ahora con: ${enlaces.nuevas.map(nombre).join(', ')}` : '',
    enlaces.fallidas.length ? `⚠️ no pude conectarla con: ${enlaces.fallidas.map(nombre).join(', ')}` : '',
    missing.length ? `⚠️ [[…]] sin página con ese título (quedó como texto): ${missing.join(', ')}` : '',
  ].filter(Boolean)
  return text(`${what} «${titulo || n.title}».\n${linkOf(ctx, id)}${notas.map((x) => `\n${x}`).join('')}`)
}

async function crearCarpeta(ctx: Ctx, args: Args) {
  const nombre = asStr(args.nombre, 80).trim()
  if (!nombre) return oops('Falta el nombre.')
  const kind: Book['kind'] = args.tipo === 'carpeta' ? 'carpeta' : 'cuaderno'
  const parentId = asStr(args.dentro_de_id, 60) || null
  const bs = await books(ctx)
  if (parentId && !bs.some((b) => b.id === parentId)) return oops(`No encontré la carpeta ${parentId}.`)
  const same = bs.find((b) => b.parent_id === parentId && fold(b.name) === fold(nombre))
  if (same) return text(`Ya existe: ${same.kind === 'carpeta' ? '📁' : '📓'} ${pathOf(same.id, bs)} [${same.id}]`)
  const b = await makeBook(ctx, nombre, kind, parentId, bs)
  if ('error' in b) return oops(b.error)
  bs.push(b)
  return text(`Creé ${kind === 'carpeta' ? 'la carpeta' : 'el cuaderno'} ${pathOf(b.id, bs)} [${b.id}].`)
}

async function conectar(ctx: Ctx, args: Args) {
  const a = asStr(args.a_id, 60)
  const b = asStr(args.b_id, 60)
  const motivo = asStr(args.motivo, 300).trim() || 'Conectadas desde Claude'
  if (!UUID.test(a) || !UUID.test(b) || a === b) return oops('Necesito dos páginas distintas (sus ids).')
  const { data } = await ctx.db.from('cuaderno_notes').select('id, title').eq('user_id', ctx.uid).eq('abierta', true).in('id', [a, b])
  if ((data ?? []).length !== 2) return oops('No encontré alguna de las dos páginas en los cuadernos abiertos para Claude.')
  const { error } = await ctx.db.from('cuaderno_links').insert({ user_id: ctx.uid, a_id: a, b_id: b, reason: motivo })
  const t = (id: string) => data!.find((x) => x.id === id)?.title
  if (error?.code === '23505') return text(`«${t(a)}» y «${t(b)}» ya estaban conectadas.`)
  if (error) return oops('No pude conectarlas.')
  return text(`Conecté «${t(a)}» con «${t(b)}» (${motivo}). Se ve en el Mapa: ${ctx.origin}/cuaderno/mapa`)
}

async function crearTarjetas(ctx: Ctx, args: Args) {
  const id = asStr(args.pagina_id, 60)
  if (!UUID.test(id)) return oops('Falta la página (pagina_id).')
  const { data: n } = await ctx.db.from('cuaderno_notes').select('id, title').eq('user_id', ctx.uid).eq('id', id).eq('abierta', true).maybeSingle()
  if (!n) return oops('No encontré esa página en los cuadernos abiertos para Claude.')
  const list = (Array.isArray(args.tarjetas) ? (args.tarjetas as Args[]) : [])
    .map((c) => ({ q: asStr(c.pregunta, 300).trim(), a: asStr(c.respuesta, 600).trim() }))
    .filter((c) => c.q && c.a)
    .slice(0, 40)
  if (!list.length) return oops('Cada tarjeta necesita pregunta y respuesta.')
  const due = await today(ctx)
  const { error } = await ctx.db.from('cuaderno_cards').insert(list.map((c) => ({ user_id: ctx.uid, note_id: id, q: c.q, a: c.a, due })))
  if (error) return oops('No pude crear las tarjetas.')
  return text(`Creé ${list.length} ${list.length === 1 ? 'tarjeta' : 'tarjetas'} en «${n.title}». Aparecen hoy en Repaso: ${ctx.origin}/cuaderno/repaso`)
}

async function paraHoy(ctx: Ctx, args: Args) {
  const k = Math.min(30, Math.max(1, Number(args.limite) || 10))
  const day = await today(ctx)
  const { data } = await ctx.db
    .from('cuaderno_cards')
    .select('id, q, a, box, due, note_id')
    .eq('user_id', ctx.uid)
    .eq('abierta', true)
    .lte('due', day)
    .order('due')
    .order('box')
    .limit(k)
  const cards = data ?? []
  if (!cards.length) return text('No hay tarjetas pendientes hoy. ¡Al día!')
  const { data: ns } = await ctx.db.from('cuaderno_notes').select('id, title').eq('user_id', ctx.uid).in('id', [...new Set(cards.map((c) => c.note_id))])
  const t = new Map((ns ?? []).map((x) => [x.id, x.title]))
  const lines = cards.map((c) => `- [${c.id}] (caja ${c.box}, de «${t.get(c.note_id) ?? '?'}»)\n  P: ${c.q}\n  R: ${c.a}`)
  return text(`Tarjetas para hoy (${cards.length}). Pregunta de a una sin mostrar la respuesta y registra cada una con registrar_repaso.\n${lines.join('\n')}`)
}

async function registrar(ctx: Ctx, args: Args) {
  const id = asStr(args.tarjeta_id, 60)
  if (!UUID.test(id)) return oops('Falta la tarjeta (tarjeta_id).')
  const { data: c } = await ctx.db.from('cuaderno_cards').select('id, box, q').eq('user_id', ctx.uid).eq('id', id).eq('abierta', true).maybeSingle()
  if (!c) return oops('No encontré esa tarjeta.')
  const remembered = args.me_acorde === true
  const day = await today(ctx)
  const box = remembered ? Math.min(5, c.box + 1) : 1
  const due = addDays(day, INTERVALS[box - 1])
  const { error } = await ctx.db.from('cuaderno_cards').update({ box, due, reviewed_at: new Date().toISOString() }).eq('id', id).eq('user_id', ctx.uid)
  if (error) return oops('No pude registrar el repaso.')
  // el día cuenta para la racha de repaso
  const { data: log } = await ctx.db.from('cuaderno_days').select('reviewed, remembered').eq('user_id', ctx.uid).eq('day', day).maybeSingle()
  await ctx.db
    .from('cuaderno_days')
    .upsert({ user_id: ctx.uid, day, reviewed: (log?.reviewed ?? 0) + 1, remembered: (log?.remembered ?? 0) + (remembered ? 1 : 0) }, { onConflict: 'user_id,day' })
  return text(remembered ? `¡Bien! Pasa a la caja ${box}; vuelve el ${due}.` : `Vuelve a la caja 1; la repasa de nuevo el ${due}.`)
}

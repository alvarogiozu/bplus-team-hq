// La Agenda en el conector: ver los días y crear o cambiar eventos (agenda_items de la persona). Todo lo de la agenda
// es personal y va cifrado: Claude la abre solo si puede abrir «todo su Rockie» (protección estándar del Cofre, o la
// llave de «todo» en la avanzada; ./llavero.ts). Lo que escribe se guarda cifrado con la misma llave que usaría la app:
// la de su agenda (la que reciben quienes comparten un equipo) si sus eventos se muestran con título; si no, la suya.
// Dos herramientas, descripciones cortas: van en cada mensaje de la persona.
import { cerrar, kidDe } from '../_shared/cofre.ts'
import type { Ctx } from './tools.ts'
import { fechaDe, horaDe, hoy, sumarDias } from './proyectos.ts'
import { sinContenido } from '../_shared/registro.ts'

type Args = Record<string, unknown>
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (t: string): Result => ({ content: [{ type: 'text', text: t }] })
const oops = (t: string): Result => ({ content: [{ type: 'text', text: t }], isError: true })
const asStr = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const S = { type: 'string' }

export const AGENDA_TOOLS = [
  {
    name: 'ver_agenda',
    title: 'Ver agenda',
    description: 'Muestra la agenda por días: hora, duración, título e id. desde (AAAA-MM-DD u hoy) y dias (7).',
    inputSchema: { type: 'object', properties: { desde: S, dias: { type: 'integer' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    write: false,
  },
  {
    name: 'guardar_eventos',
    title: 'Guardar eventos',
    description: 'Crea eventos (sin id) o cambia los que llevan id. Sin hora = todo el día; sin dia = pendiente.',
    inputSchema: {
      type: 'object',
      properties: { eventos: { type: 'array', items: { type: 'object', properties: { id: S, titulo: S, dia: S, hora: S, minutos: { type: 'integer' }, notas: S, hecho: { type: 'boolean' } } } } },
      required: ['eventos'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    write: true,
  },
]
export const AGENDA_INSTRUCCIONES = '- Agenda: ver_agenda antes de proponer horarios; dia AAAA-MM-DD, hoy o mañana; hora HH:MM.'

const SIN_ACCESO =
  'La agenda de esta persona está cifrada con la protección avanzada de su Cofre, así que Claude no puede abrirla. Si quiere usarla desde aquí, en Rockie (rockie.plus) › Ajustes › Tu Cofre puede volver a la protección estándar.'

type Item = { id: string; title: string; notes: string; day: string | null; end_day: string | null; start_min: number | null; duration_min: number; done_at: string | null; is_reserve: boolean }
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const fmtMin = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`)

export async function callAgenda(name: string, args: Args, ctx: Ctx): Promise<Result | null> {
  const tool = AGENDA_TOOLS.find((t) => t.name === name)
  if (!tool) return null
  if (tool.write && ctx.scope !== 'escribir') return oops('Esta conexión es de solo lectura. Para agendar, reconecta Rockie con permiso de escribir.')
  try {
    if (!(await ctx.llavero.todo())) return oops(SIN_ACCESO)
    return name === 'ver_agenda' ? await verAgenda(ctx, args) : await guardarEventos(ctx, args)
  } catch (e) {
    console.error(name, sinContenido(e))
    return oops('Algo falló en la Agenda. Intenta de nuevo en un momento.')
  }
}

async function linea(ctx: Ctx, it: Item): Promise<string> {
  const titulo = (await ctx.llavero.texto(it.title)) ?? '🔒 (no se pudo abrir)'
  const cuando = it.start_min == null ? 'todo el día' : `${hhmm(it.start_min)} · ${fmtMin(it.duration_min)}`
  return `- ${cuando} · ${titulo}${it.end_day && it.end_day !== it.day ? ` (hasta ${it.end_day})` : ''}${it.is_reserve ? ' (reserva)' : ''}${it.done_at ? ' ✓' : ''} [${it.id}]`
}

async function verAgenda(ctx: Ctx, args: Args): Promise<Result> {
  const hoyDia = await hoy(ctx)
  const desde = asStr(args.desde, 20) ? fechaDe(asStr(args.desde, 20), hoyDia) : hoyDia
  if (!desde) return oops('desde tiene que ser una fecha AAAA-MM-DD, hoy o mañana.')
  const dias = Number.isInteger(args.dias) ? Math.min(31, Math.max(1, args.dias as number)) : 7
  const hasta = sumarDias(desde, dias - 1)
  const cols = 'id, title, notes, day, end_day, start_min, duration_min, done_at, is_reserve'
  const [{ data: conDia }, { data: sinDia }] = await Promise.all([
    ctx.db.from('agenda_items').select(cols).eq('user_id', ctx.uid).lte('day', hasta).or(`day.gte.${desde},end_day.gte.${desde}`).order('day').order('start_min', { nullsFirst: true }).limit(200),
    ctx.db.from('agenda_items').select(cols).eq('user_id', ctx.uid).is('day', null).is('done_at', null).order('position').limit(15),
  ])
  const out = [`Agenda del ${desde} al ${hasta} (hoy es ${hoyDia}).`]
  let dia = ''
  for (const it of (conDia ?? []) as Item[]) {
    const d = it.day! < desde ? desde : it.day!
    if (d !== dia) out.push(`\n${(dia = d)}`)
    out.push(await linea(ctx, it))
  }
  if (!(conDia ?? []).length) out.push('Sin eventos en esos días.')
  if ((sinDia ?? []).length) {
    out.push('\nPendientes sin día')
    for (const it of sinDia as Item[]) out.push(await linea(ctx, it))
  }
  return text(out.join('\n'))
}

/** Con qué llave se cierra un evento nuevo de esta persona: la de su agenda si su equipo ve sus títulos; si no, la suya. */
async function kidParaNuevo(ctx: Ctx): Promise<string | null> {
  const [{ data: prefs }, { data: amb }, { data: cuenta }, llaves] = await Promise.all([
    ctx.db.from('agenda_prefs').select('share_level').eq('user_id', ctx.uid).maybeSingle(),
    ctx.db.from('cofre_ambitos').select('kid').eq('ambito', 'agenda').eq('ambito_id', ctx.uid).order('creado', { ascending: false }).limit(1),
    ctx.db.from('cofre_cuentas').select('kid').eq('user_id', ctx.uid).maybeSingle(),
    ctx.llavero.llaves(),
  ])
  const deAgenda = (amb?.[0]?.kid as string | undefined) ?? null
  if ((prefs as { share_level?: string } | null)?.share_level === 'details' && deAgenda && llaves.has(deAgenda)) return deAgenda
  const mia = (cuenta?.kid as string | undefined) ?? null
  return mia && llaves.has(mia) ? mia : null
}

async function guardarEventos(ctx: Ctx, args: Args): Promise<Result> {
  const lista = Array.isArray(args.eventos) ? (args.eventos as Args[]).slice(0, 20) : []
  if (!lista.length) return oops('Falta eventos: una lista con al menos uno.')
  const [hoyDia, llaves, kidNuevo] = await Promise.all([hoy(ctx), ctx.llavero.llaves(), kidParaNuevo(ctx)])
  if (!kidNuevo) return oops(SIN_ACCESO)
  const cierra = (kid: string, v: string) => (v === '' ? Promise.resolve('') : cerrar(llaves, kid, v))
  const ids = lista.map((e) => asStr(e.id, 40)).filter((id) => UUID.test(id))
  const { data: ya } = ids.length ? await ctx.db.from('agenda_items').select('id, title, day, start_min').eq('user_id', ctx.uid).in('id', ids) : { data: [] }
  const porId = new Map(((ya ?? []) as { id: string; title: string; day: string | null; start_min: number | null }[]).map((i) => [i.id, i]))

  const out: string[] = []
  let bien = 0
  for (const e of lista) {
    const id = asStr(e.id, 40)
    const titulo = asStr(e.titulo, 200).trim()
    const viejo = id ? porId.get(id) : undefined
    const nombre = titulo || (viejo ? ((await ctx.llavero.texto(viejo.title)) ?? 'evento') : 'evento')
    if (id && !viejo) {
      out.push(`✗ No encontré el evento ${id} en su agenda.`)
      continue
    }
    if (!id && !titulo) {
      out.push('✗ Un evento nuevo necesita titulo.')
      continue
    }
    const patch: Record<string, unknown> = {}
    if (e.dia !== undefined) {
      const d = fechaDe(asStr(e.dia, 20), hoyDia)
      if (d === undefined) {
        out.push(`✗ ${nombre}: dia tiene que ser AAAA-MM-DD, hoy o mañana.`)
        continue
      }
      patch.day = d
      if (d === null) patch.start_min = null
    }
    if (e.hora !== undefined) {
      const h = horaDe(e.hora)
      if (h === undefined) {
        out.push(`✗ ${nombre}: hora tiene que ser HH:MM.`)
        continue
      }
      patch.start_min = h === null ? null : Number(h.slice(0, 2)) * 60 + Number(h.slice(3))
    }
    const dia = patch.day !== undefined ? patch.day : (viejo?.day ?? null)
    if (patch.start_min != null && !dia) {
      out.push(`✗ ${nombre}: para ponerle hora necesita un dia.`)
      continue
    }
    if (e.minutos !== undefined) {
      if (!Number.isInteger(e.minutos) || (e.minutos as number) < 5 || (e.minutos as number) > 1440) {
        out.push(`✗ ${nombre}: minutos va de 5 a 1440.`)
        continue
      }
      patch.duration_min = e.minutos
    } else if (!id && patch.start_min != null) {
      patch.duration_min = 60
    }
    if (typeof e.hecho === 'boolean') patch.done_at = e.hecho ? new Date().toISOString() : null
    // lo que ya estaba cifrado se vuelve a cerrar con su misma llave (la suya o la de su agenda)
    const kidViejo = viejo ? kidDe(viejo.title) : null
    const kid = kidViejo && llaves.has(kidViejo) ? kidViejo : kidNuevo
    if (titulo) patch.title = await cierra(kid, titulo)
    if (typeof e.notas === 'string') patch.notes = await cierra(kid, e.notas.slice(0, 4000))

    if (!Object.keys(patch).length) {
      out.push(`✗ ${nombre}: no trae nada que cambiar.`)
      continue
    }
    const r = id
      ? await ctx.db.from('agenda_items').update(patch).eq('id', id).eq('user_id', ctx.uid).select('id, day, start_min').maybeSingle()
      : await ctx.db.from('agenda_items').insert({ user_id: ctx.uid, position: Date.now() / 1000, ...patch }).select('id, day, start_min').single()
    const f = r.data as { id: string; day: string | null; start_min: number | null } | null
    if (r.error || !f) {
      out.push(`✗ ${nombre}: no se pudo guardar.`)
      continue
    }
    bien++
    out.push(`✓ ${nombre} · ${f.day ?? 'sin día'}${f.start_min != null ? ` ${hhmm(f.start_min)}` : ''} [${f.id}]`)
  }
  out.unshift(bien === lista.length ? `Listo: ${bien} en la agenda.` : `${bien} de ${lista.length} guardados.`)
  if (bien) out.push(`${ctx.origin}/agenda`)
  return bien ? text(out.join('\n')) : oops(out.join('\n'))
}

// Hábitos en el conector: ver los hábitos de la persona (con lo cumplido hoy y su racha) y marcar uno como cumplido.
// Los datos viven en el esquema «habitos» de Rockie OS. Marcar NO escribe aquí: pasa por validate-habit, la única vía
// que escribe cumplidos, racha, XP y metas (así Claude marca igual que el «listo» de la app, sin foto).
// Dos herramientas, descripciones cortas: van en cada mensaje de la persona.
import type { Ctx } from './tools.ts'
import { sinContenido } from '../_shared/registro.ts'

type Args = Record<string, unknown>
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (t: string): Result => ({ content: [{ type: 'text', text: t }] })
const oops = (t: string): Result => ({ content: [{ type: 'text', text: t }], isError: true })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const HABITOS_TOOLS = [
  {
    name: 'ver_habitos',
    title: 'Ver hábitos',
    description: 'Lista los hábitos con su hora, si ya se cumplieron hoy, la racha y su id.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    write: false,
  },
  {
    name: 'marcar_habito',
    title: 'Marcar hábito',
    description: 'Marca un hábito como cumplido hoy (id de ver_habitos). Solo si la persona dice que ya lo hizo.',
    inputSchema: { type: 'object', properties: { habito: { type: 'string' } }, required: ['habito'] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    write: true,
  },
]

// Hábitos cuenta el día con la hora de Perú, igual que validate-habit.
const hoyLima = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)

export async function callHabitos(name: string, args: Args, ctx: Ctx): Promise<Result | null> {
  const tool = HABITOS_TOOLS.find((t) => t.name === name)
  if (!tool) return null
  if (tool.write && ctx.scope !== 'escribir') return oops('Esta conexión es de solo lectura. Para marcar hábitos, reconecta Rockie con permiso de escribir.')
  try {
    return name === 'ver_habitos' ? await verHabitos(ctx) : await marcarHabito(ctx, args)
  } catch (e) {
    console.error(name, sinContenido(e))
    return oops('Algo falló en Hábitos. Intenta de nuevo en un momento.')
  }
}

async function verHabitos(ctx: Ctx): Promise<Result> {
  const db = ctx.db.schema('habitos')
  const hoy = hoyLima()
  const [{ data: habitos, error }, { data: hechos }, { data: racha }] = await Promise.all([
    db.from('habits').select('id, name, time, freq').eq('user_id', ctx.uid).eq('active', true).order('time').limit(60),
    db.from('completions').select('habit_id, mode').eq('user_id', ctx.uid).eq('date', hoy),
    db.from('streaks').select('current, best').eq('user_id', ctx.uid).maybeSingle(),
  ])
  if (error) throw error
  const lista = (habitos ?? []) as { id: string; name: string; time: string; freq: string }[]
  if (!lista.length) return text(`Todavía no tiene hábitos. Se crean en Rockie: ${ctx.origin}/habitos`)
  const modo = new Map(((hechos ?? []) as { habit_id: string; mode: string }[]).map((c) => [c.habit_id, c.mode]))
  const r = racha as { current: number; best: number } | null
  const out = [`Hábitos (hoy es ${hoy}). Racha: ${r?.current ?? 0} días (la mejor: ${r?.best ?? 0}).`]
  for (const h of lista) {
    const m = modo.get(h.id)
    out.push(`- ${m === 'tomorrow' ? '⏭ aplazado' : m ? '✓ hecho' : '○ pendiente'} · ${h.time} · ${h.name} · ${h.freq} [${h.id}]`)
  }
  return text(out.join('\n'))
}

const ERRORES: Record<string, string> = {
  habito_no_encontrado: 'No encontré ese hábito entre los suyos. Usa el id que da ver_habitos.',
  ya_validado: 'Ese hábito ya estaba marcado hoy.',
  limite_diario: 'Llegó al tope de marcas de hoy en Hábitos. Mañana se puede otra vez.',
}

async function marcarHabito(ctx: Ctx, args: Args): Promise<Result> {
  const id = typeof args.habito === 'string' ? args.habito.trim() : ''
  if (!UUID.test(id)) return oops('habito tiene que ser el id que da ver_habitos.')
  const { data: h } = await ctx.db.schema('habitos').from('habits').select('name').eq('id', id).eq('user_id', ctx.uid).maybeSingle()
  if (!h) return oops(ERRORES.habito_no_encontrado)
  const llave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/validate-habit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llave}`, apikey: llave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ habit_id: id, mode: 'check', user_id: ctx.uid }),
  })
  const j = (await r.json().catch(() => ({}))) as { valido?: boolean; error?: string; racha?: number; xp_ganado?: number }
  if (!r.ok || !j.valido) return oops(ERRORES[j.error ?? ''] ?? 'No se pudo marcar el hábito. Intenta de nuevo en un momento.')
  return text(`✓ ${(h as { name: string }).name}: cumplido hoy. Racha: ${j.racha ?? 0} días${j.xp_ganado ? ` · +${j.xp_ganado} XP` : ''}.\n${ctx.origin}/habitos`)
}

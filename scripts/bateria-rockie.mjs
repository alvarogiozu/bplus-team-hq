// Batería de frases contra la IA REAL (agenda-agent, scope 'os'): ¿cada frase va a nota, hábito, agenda, tarea del
// equipo, pregunta o «¿cómo lo guardo?», con la fecha y la hora correctas? Contexto inventado (viernes 9 oct 2026),
// usuarios qa.* (node scripts/qa.mjs seed). Gasta cupo de IA: Gemini gratis aguanta ~15 por minuto, por eso va de a
// una con pausa. Imprime [usado/límite] del cupo y deja el detalle en test-results/bateria-rockie.json.
//   node scripts/bateria-rockie.mjs [filtro]     filtro = regex sobre el id o la frase (p. ej. "^ag" o "equipo")
//   PACE=ms (pausa, 7000) · CONC=n (a la vez, 1) · QA_USERS=qa.alvaro,qa.mariana (en orden, si uno se queda sin cupo)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CASOS, contexto, evaluar } from './rockie-casos.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const filtro = process.argv[2] ? new RegExp(process.argv[2], 'i') : null
const env = Object.fromEntries(
  readFileSync(join(repo, '.secrets/service.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY
const USERS = (process.env.QA_USERS ?? 'qa.intruso,qa.alvaro,qa.mariana,qa.sebastian').split(',')
const tokens = {}
async function token(u) {
  if (tokens[u]) return tokens[u]
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${u}@hq.rockie.plus`, password: 'qa-pass-1234' }) })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login ${u}: ${JSON.stringify(j).slice(0, 200)}`)
  return (tokens[u] = j.access_token)
}

const casos = CASOS.filter(([id, t]) => !filtro || filtro.test(id) || filtro.test(t))
let ui = 0
const out = []
async function correr(caso) {
  const [id, text, , , extra] = caso
  const context = contexto(extra)
  for (let intento = 0; intento < USERS.length; intento++) {
    const u = USERS[(ui + intento) % USERS.length]
    const t0 = Date.now()
    const r = await fetch(`${URL_}/functions/v1/agenda-agent`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${await token(u)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, history: [], context, caps: ['otra_app'], scope: 'os' }) })
    const j = await r.json().catch(() => ({}))
    if (r.status === 429 && (j.limite || /60 órdenes/.test(j.error ?? ''))) { ui++; continue }
    const ms = Date.now() - t0
    const tools = (j.proposals ?? []).map((p) => p.tool)
    const ok = r.ok && evaluar(caso, j.proposals ?? [])
    out.push({ id, text, ok, status: r.status, ms, u, tools, say: j.say, error: j.error, dropped: j.dropped, inputs: (j.proposals ?? []).map((p) => p.input) })
    console.log(`${ok ? 'OK ' : 'MAL'} ${j.cupo ? `[${j.cupo.usado}/${j.cupo.limite}] ` : ''}${id.padEnd(7)} ${String(ms).padStart(5)}ms ${tools.join('+') || '-'} ${ok ? '' : '| ' + JSON.stringify({ e: j.error, r: j.respaldo, say: j.say, in: (j.proposals ?? []).map((p) => p.input), d: j.dropped })}`)
    return
  }
  out.push({ id, text, ok: false, error: 'sin cupo en todos los qa' })
  console.log(`MAL ${id} sin cupo`)
}
const cola = [...casos]
const PACE = Number(process.env.PACE ?? 7000)
const CONC = Number(process.env.CONC ?? 1)
await Promise.all(Array.from({ length: CONC }, async () => {
  while (cola.length) { await correr(cola.shift()); if (cola.length) await new Promise((r) => setTimeout(r, PACE)) }
}))
writeFileSync(join(repo, 'test-results', 'bateria-rockie.json'), JSON.stringify(out, null, 1))
console.log(`\n${out.filter((o) => o.ok).length}/${out.length} bien`)


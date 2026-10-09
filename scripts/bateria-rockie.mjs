// Batería de frases contra la IA REAL (agenda-agent, scope 'os'): ¿cada frase va a nota, hábito, agenda, tarea del
// equipo, pregunta o «¿cómo lo guardo?», con la fecha y la hora correctas? Contexto inventado (viernes 9 oct 2026),
// con su PROPIO usuario desechable (iaprueba.*, scripts/ia-usuario.mjs): se crea al empezar y se borra al terminar.
// Gasta cupo de IA: Gemini gratis aguanta ~15 por minuto, por eso va de a una con pausa. Imprime [usado/límite] del
// cupo y deja el detalle en test-results/bateria-rockie.json.
//   node scripts/bateria-rockie.mjs [filtro]     filtro = regex sobre el id o la frase (p. ej. "^ag" o "equipo")
//   PACE=ms (pausa, 7000) · CONC=n (a la vez, 1)
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CASOS, contexto, evaluar } from './rockie-casos.mjs'
import { borrarCreados, limpiarViejos, pedirAgente } from './ia-usuario.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const filtro = process.argv[2] ? new RegExp(process.argv[2], 'i') : null
const casos = CASOS.filter(([id, t]) => !filtro || filtro.test(id) || filtro.test(t))
const out = []

async function correr(caso) {
  const [id, text, , , extra] = caso
  const { status, ok: httpOk, json: j, ms } = await pedirAgente(text, contexto(extra))
  const tools = (j.proposals ?? []).map((p) => p.tool)
  const ok = httpOk && evaluar(caso, j.proposals ?? [])
  out.push({
    id,
    text,
    ok,
    status,
    ms,
    tools,
    say: j.say,
    error: j.error,
    dropped: j.dropped,
    inputs: (j.proposals ?? []).map((p) => p.input),
  })
  console.log(
    `${ok ? 'OK ' : 'MAL'} ${j.cupo ? `[${j.cupo.usado}/${j.cupo.limite}] ` : ''}${id.padEnd(7)} ${String(ms).padStart(5)}ms ${tools.join('+') || '-'} ${ok ? '' : '| ' + JSON.stringify({ e: j.error, r: j.respaldo, say: j.say, in: (j.proposals ?? []).map((p) => p.input), d: j.dropped })}`,
  )
}

await limpiarViejos()
try {
  const cola = [...casos]
  const PACE = Number(process.env.PACE ?? 7000)
  const CONC = Number(process.env.CONC ?? 1)
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (cola.length) {
        await correr(cola.shift())
        if (cola.length) await new Promise((r) => setTimeout(r, PACE))
      }
    }),
  )
} finally {
  await borrarCreados()
}
writeFileSync(join(repo, 'test-results', 'bateria-rockie.json'), JSON.stringify(out, null, 1))
console.log(`\n${out.filter((o) => o.ok).length}/${out.length} bien`)

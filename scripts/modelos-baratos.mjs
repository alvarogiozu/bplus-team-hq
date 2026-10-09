// ¿Qué modelo barato sirve para el plan Gratis? 30 pedidos reales (scripts/rockie-casos.mjs, TREINTA) con las MISMAS
// instrucciones, herramientas, validación y posproceso que producción (supabase/functions/agenda-agent/kit.ts).
// Mide por modelo: bien hechas, errores de herramienta (llamadas inválidas o ids inventados), ACCIONES INVENTADAS
// (dice «listo / ya lo agendé» en vez de proponer: Rockie nunca ejecuta), latencia y costo por tarea bien hecha.
//
//   node scripts/modelos-baratos.mjs                  todos los que tengan llave
//   node scripts/modelos-baratos.mjs openai together  solo esos (gemini = producción, por agenda-agent con su usuario propio; tinfoil = IA confidencial)
//
// Llaves: .secrets/modelos.env (las pone Álvaro; nunca por chat):
//   OPENAI_API_KEY=…            OPENAI_MODEL=…    (si no, el primero que diga «luna» en /v1/models)
//   TOGETHER_API_KEY=…          TOGETHER_MODEL=…  (si no, un Qwen 3.5 de /v1/models, alojado en EE. UU.)
//   OPENAI_PRECIO=entrada,salida (USD por millón; Together trae el suyo en /v1/models)
//   TINFOIL_API_KEY=…  IA confidencial (enclave): TINFOIL_MODELS=gemma4-31b,deepseek-v4-1-flash,gpt-oss-120b (por defecto)
//   TINFOIL_PRECIO=gemma4-31b:entrada,salida;gpt-oss-120b:entrada,salida  (USD por millón; sus docs no los publican)
//   Ojo: la prueba llama a Tinfoil directo por HTTPS, SIN verificar la atestación (solo mide calidad, latencia y costo);
//   en producción iría con su SDK (SecureClient), que verifica el enclave antes de mandar nada.
// Resultado: tabla en la consola y el detalle en test-results/modelos-baratos.json. Nunca imprime las llaves.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CASOS, contexto, evaluar, TREINTA } from './rockie-casos.mjs'
import {
  pedidoDe,
  proximosDias,
  resolverAclarar,
  SYSTEM_OS,
  TOOLS_OS,
  valid,
} from '../supabase/functions/agenda-agent/kit.ts'
import { borrarCreados, limpiarViejos, pedirAgente, svc } from './ia-usuario.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const leer = (p) =>
  existsSync(p)
    ? Object.fromEntries(
        readFileSync(p, 'utf8')
          .split(/\r?\n/)
          .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
          .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {}
const env = { ...leer(join(repo, '.secrets/modelos.env')), ...process.env }
const pedidos = TREINTA.map((id) => CASOS.find((c) => c[0] === id))
const PACE = Number(env.PACE ?? 1500)

// lo que dice «ya lo hice» sin haber propuesto nada: Rockie solo propone, la persona confirma
const INVENTA =
  /\b(listo|hecho|ya (lo|la|te) (agend|guard|cre|anot|mov|borr|march|reserv)|(he|ya) (creado|agendado|guardado|anotado|movido|borrado|reservado|marcado)|qued[oó] (guardad|agendad|cread|anotad)|te lo (agend|anot|guard))/i

/** El pedido tal cual lo arma agenda-agent, con lo que el servidor le agrega al contexto. */
function preparar(caso) {
  const ctx = contexto(caso[4])
  ctx.proximos_dias = proximosDias(ctx.hoy)
  pedidoDe.set(ctx, { orden: caso[1], historia: false })
  return { ctx, prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>\n\nOrden: ${caso[1]}` }
}

// ---------- proveedores compatibles con OpenAI (OpenAI y Together) ----------
const TOOLS_OAI = TOOLS_OS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}))

async function elegirModelo(base, key, pedido, preferir) {
  if (pedido) return pedido
  const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`no pude listar modelos (${r.status})`)
  const j = await r.json()
  const lista = Array.isArray(j) ? j : (j.data ?? [])
  for (const re of preferir) {
    const hit = lista.find((m) => re.test(m.id) && !/coder|vl|vision|embed|guard|audio|image/i.test(m.id))
    if (hit) return hit
  }
  throw new Error(
    `ningún modelo calza; hay: ${lista
      .map((m) => m.id)
      .filter((id) => /gpt-5|qwen/i.test(id))
      .slice(0, 15)
      .join(', ')}`,
  )
}

function proveedorOAI({ nombre, base, key, modelo, precio }) {
  let toolChoice = 'required'
  return {
    nombre,
    modelo: typeof modelo === 'string' ? modelo : modelo.id,
    precio,
    async pedir(caso) {
      const { ctx, prompt } = preparar(caso)
      const body = (tc) => ({
        model: typeof modelo === 'string' ? modelo : modelo.id,
        messages: [
          { role: 'system', content: SYSTEM_OS },
          { role: 'user', content: prompt },
        ],
        tools: TOOLS_OAI,
        tool_choice: tc,
      })
      const t0 = Date.now()
      let r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body(toolChoice)),
      })
      if (r.status === 400 && toolChoice === 'required') {
        // algunos no aceptan «required»: se prueba con «auto» (y se queda así)
        toolChoice = 'auto'
        r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body(toolChoice)),
        })
      }
      const ms = Date.now() - t0
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return { ok: false, ms, error: `${r.status} ${JSON.stringify(j.error ?? j).slice(0, 200)}` }
      const msg = j.choices?.[0]?.message ?? {}
      const props = []
      let malas = 0
      for (const c of msg.tool_calls ?? []) {
        let input
        try {
          input =
            typeof c.function?.arguments === 'string'
              ? JSON.parse(c.function.arguments || '{}')
              : (c.function?.arguments ?? {})
        } catch {
          malas++
          continue
        }
        if (valid(c.function?.name ?? '', input, ctx)) props.push({ tool: c.function.name, input })
        else malas++
      }
      const u = j.usage ?? {}
      const cache = u.prompt_tokens_details?.cached_tokens ?? 0
      return {
        ok: true,
        ms,
        say: msg.content ?? '',
        proposals: resolverAclarar(props, ctx),
        malas,
        entrada: (u.prompt_tokens ?? 0) - cache,
        cache,
        salida: u.completion_tokens ?? 0,
      }
    },
  }
}

// ---------- Gemini en producción (agenda-agent con su propio usuario desechable): la línea base ----------
function proveedorGemini() {
  return {
    nombre: 'gemini (producción)',
    modelo: 'agenda-agent',
    async pedir(caso) {
      const desde = new Date().toISOString()
      const { ok, status, json: j, ms, uid } = await pedirAgente(caso[1], contexto(caso[4]))
      if (!ok) return { ok: false, ms, error: `${status} ${j.error ?? ''}` }
      // tokens y costo reales: lo que anotó ia_uso para ese usuario en ese momento
      await new Promise((res) => setTimeout(res, 800))
      const q = await fetch(
        `${svc.SUPABASE_URL}/rest/v1/ia_uso_costo?user_id=eq.${uid}&creado=gte.${encodeURIComponent(desde)}&ok=eq.true&select=modelo,entrada,salida,cache,costo_usd`,
        {
          headers: {
            apikey: svc.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${svc.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      )
      const filas = q.ok ? await q.json() : []
      const sum = (k) => filas.reduce((x, f) => x + Number(f[k] ?? 0), 0)
      return {
        ok: true,
        ms,
        say: j.say ?? '',
        proposals: j.proposals ?? [],
        malas: j.dropped ?? 0,
        entrada: sum('entrada'),
        salida: sum('salida'),
        cache: sum('cache'),
        usd: sum('costo_usd'),
        modelo: filas.map((f) => f.modelo).join('+'),
      }
    },
  }
}

// ---------- correr ----------
const pedidosProv = process.argv.slice(2)
const quiere = (n) => !pedidosProv.length || pedidosProv.includes(n)
const provs = []
if (quiere('gemini')) provs.push(proveedorGemini())
if (quiere('openai')) {
  if (!env.OPENAI_API_KEY) console.log('— openai: falta OPENAI_API_KEY en .secrets/modelos.env')
  else {
    const base = 'https://api.openai.com/v1'
    const m = await elegirModelo(base, env.OPENAI_API_KEY, env.OPENAI_MODEL, [/luna/i])
    const [pe, ps] = (env.OPENAI_PRECIO ?? '').split(',').map(Number)
    provs.push(
      proveedorOAI({
        nombre: 'openai',
        base,
        key: env.OPENAI_API_KEY,
        modelo: m,
        precio: pe >= 0 && ps >= 0 && env.OPENAI_PRECIO ? { entrada: pe, salida: ps } : null,
      }),
    )
  }
}
if (quiere('together')) {
  if (!env.TOGETHER_API_KEY) console.log('— together: falta TOGETHER_API_KEY en .secrets/modelos.env')
  else {
    const base = 'https://api.together.xyz/v1'
    const m = await elegirModelo(base, env.TOGETHER_API_KEY, env.TOGETHER_MODEL, [
      /qwen3\.5.*(instruct|a3b|a22b|30b|32b|35b)/i,
      /qwen3\.5/i,
      /qwen3.*instruct/i,
    ])
    const pr =
      typeof m === 'object' && m.pricing
        ? { entrada: Number(m.pricing.input), salida: Number(m.pricing.output) }
        : null
    provs.push(proveedorOAI({ nombre: 'together', base, key: env.TOGETHER_API_KEY, modelo: m, precio: pr }))
  }
}

if (quiere('tinfoil')) {
  if (!env.TINFOIL_API_KEY) console.log('— tinfoil: falta TINFOIL_API_KEY en .secrets/modelos.env')
  else {
    const precios = Object.fromEntries(
      (env.TINFOIL_PRECIO ?? '')
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
          const [id, p] = x.split(':')
          const [e, s] = (p ?? '').split(',').map(Number)
          return [id.trim(), e >= 0 && s >= 0 ? { entrada: e, salida: s } : null]
        }),
    )
    for (const id of (env.TINFOIL_MODELS ?? 'gemma4-31b,deepseek-v4-1-flash,gpt-oss-120b').split(',').map((x) => x.trim()).filter(Boolean)) {
      provs.push(proveedorOAI({ nombre: `tinfoil `, base: 'https://inference.tinfoil.sh/v1', key: env.TINFOIL_API_KEY, modelo: id, precio: precios[id] ?? null }))
    }
  }
}

const resultados = []
await limpiarViejos()
try {
  for (const p of provs) {
    console.log(`\n== ${p.nombre} · ${p.modelo}`)
    const filas = []
    for (const caso of pedidos) {
      let r
      try {
        r = await p.pedir(caso)
      } catch (e) {
        r = { ok: false, ms: 0, error: String(e).slice(0, 200) }
      }
      const bien = r.ok && evaluar(caso, r.proposals)
      const inventa =
        r.ok &&
        !r.proposals.some((x) => x.tool !== 'responder' && x.tool !== 'preguntar' && x.tool !== 'aclarar') &&
        INVENTA.test(r.say ?? '') &&
        !['ag5', 'ag17', 'sal1', 'sal2', 'sal3'].includes(caso[0])
      const usd =
        r.usd ??
        (p.precio
          ? ((r.entrada ?? 0) * p.precio.entrada +
              (r.cache ?? 0) * p.precio.entrada * 0.1 +
              (r.salida ?? 0) * p.precio.salida) /
            1e6
          : null)
      filas.push({
        id: caso[0],
        frase: caso[1],
        bien,
        inventa,
        malas: r.malas ?? 0,
        ms: r.ms,
        usd,
        error: r.error,
        tools: (r.proposals ?? []).map((x) => x.tool),
        inputs: (r.proposals ?? []).map((x) => x.input),
        say: r.say,
        modelo: r.modelo,
      })
      console.log(
        `${bien ? 'OK ' : 'MAL'} ${caso[0].padEnd(7)} ${String(r.ms).padStart(5)}ms ${(r.proposals ?? []).map((x) => x.tool).join('+') || '-'}${inventa ? ' ⚠️ INVENTA' : ''}${r.malas ? ` · ${r.malas} inválida(s)` : ''}${r.error ? ` · ${r.error}` : ''}`,
      )
      await new Promise((res) => setTimeout(res, PACE))
    }
    const ms = filas
      .map((f) => f.ms)
      .filter(Boolean)
      .sort((a, b) => a - b)
    const pct = (q) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] ?? 0
    const bien = filas.filter((f) => f.bien).length
    // costo de lo que respondió (un fallo de la API no cuesta)
    const conCosto = filas.filter((f) => !f.error)
    const usd =
      conCosto.length && conCosto.every((f) => f.usd != null) ? conCosto.reduce((a, f) => a + f.usd, 0) : null
    resultados.push({
      proveedor: p.nombre,
      modelo: p.modelo,
      bien: `${bien}/${filas.length}`,
      errores_herramienta: filas.reduce((a, f) => a + f.malas, 0),
      inventadas: filas.filter((f) => f.inventa).length,
      fallos_api: filas.filter((f) => f.error).length,
      p50_ms: pct(0.5),
      p90_ms: pct(0.9),
      usd_total: usd == null ? 'sin precio' : usd.toFixed(5),
      usd_por_bien: usd == null || !bien ? '-' : (usd / bien).toFixed(6),
      filas,
    })
  }
} finally {
  await borrarCreados()
}
console.log(
  '\n' + 'proveedor'.padEnd(22) + 'bien   inválidas inventadas p50     p90     USD/bien   USD total',
)
for (const r of resultados) {
  console.log(
    `${`${r.proveedor}`.padEnd(22)}${r.bien.padEnd(7)}${String(r.errores_herramienta).padEnd(10)}${String(r.inventadas).padEnd(11)}${`${r.p50_ms}ms`.padEnd(8)}${`${r.p90_ms}ms`.padEnd(8)}${String(r.usd_por_bien).padEnd(11)}${r.usd_total}`,
  )
  console.log(`  ${r.modelo}`)
}
writeFileSync(join(repo, 'test-results', 'modelos-baratos.json'), JSON.stringify(resultados, null, 1))

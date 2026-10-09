// ¿Cuántos tokens le cuesta el conector (rockie.plus/mcp) al usuario en SU Claude o ChatGPT? Mide lo que va en cada
// mensaje (instrucciones + tools/list) y las respuestas típicas, con un usuario desechable Plus (iaprueba.*) que tiene
// un proyecto y un cuaderno de ejemplo. Todo se borra al final.
//   node scripts/conector-tokens.mjs            (MCP_URL=… para medir otro despliegue)
// Tokens ≈ caracteres / 3,6 (español con JSON); sirve para comparar antes y después, no para facturar.
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { borrarCreados, limpiarViejos, nuevoUsuario, svc } from './ia-usuario.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const MCP = process.env.MCP_URL ?? `${svc.SUPABASE_URL}/functions/v1/cuaderno-mcp/mcp`
const rest = async (path, init = {}) => {
  const r = await fetch(`${svc.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: svc.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${svc.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}
const tok = (s) => Math.round(s.length / 3.6)
const token = randomBytes(24).toString('hex')
let n = 1
async function rpc(method, params) {
  const r = await fetch(MCP, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: n++, method, params }) })
  return r.json()
}
const filas = []
const medir = (que, texto) => {
  filas.push({ que, caracteres: texto.length, tokens: tok(texto) })
  console.log(`${que.padEnd(46)} ${String(texto.length).padStart(7)} car  ≈ ${String(tok(texto)).padStart(6)} tokens`)
}

await limpiarViejos()
let sid = null
try {
  const yo = (await nuevoUsuario()).uid
  await rest('planes_suscripciones', { method: 'POST', body: JSON.stringify({ user_id: yo, plan: 'plus', tarifa: 'normal', origen: 'manual', hasta: new Date(Date.now() + 3600e3).toISOString() }) })
  await rest('cuaderno_tokens', { method: 'POST', body: JSON.stringify({ user_id: yo, name: 'Medición', token_hash: createHash('sha256').update(token).digest('hex'), hint: token.slice(-6), scope: 'escribir', expires_at: new Date(Date.now() + 3600e3).toISOString() }) })
  // un proyecto abierto para Claude: 2 áreas, 1 frente, 60 tareas
  const [esp] = await rest('spaces', { method: 'POST', body: JSON.stringify({ name: 'Proyecto de medición', created_by: yo, abierto_claude: true }) })
  sid = esp.id
  await rest('space_members', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ space_id: sid, user_id: yo, role: 'owner' }) })
  const ar = await rest('areas', { method: 'POST', body: JSON.stringify([{ space_id: sid, name: 'Diseño', color: '#b4637a', position: 1, abierta: true }, { space_id: sid, name: 'Ventas', color: '#2a82ad', position: 2, abierta: true }]) })
  await rest('projects', { method: 'POST', body: JSON.stringify({ space_id: sid, name: 'Lanzar la tienda', abierta: true }) })
  await rest('tasks', {
    method: 'POST',
    body: JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ space_id: sid, title: `Tarea de ejemplo número ${i + 1} con un título normal`, notes: 'Notas de la tarea.', status: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'doing' : 'todo', area_id: ar[i % 2].id, abierta: true, position: i }))),
  })
  // un cuaderno abierto para Claude: 12 páginas, una larga
  const [libro] = await rest('cuaderno_books', { method: 'POST', body: JSON.stringify({ user_id: yo, name: 'Estudio', kind: 'cuaderno', abierta_claude: true, position: 1 }) })
  const parrafo = 'La fotosíntesis convierte la luz en energía química dentro de los cloroplastos de las células vegetales. '
  const notas = await rest('cuaderno_notes', {
    method: 'POST',
    body: JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ user_id: yo, book_id: libro.id, title: `Apunte ${i + 1} de biología`, body: i === 0 ? parrafo.repeat(250) : parrafo.repeat(4), kind: 'pagina', area: 'mente', abierta: true, position: i }))),
  })

  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'medicion', version: '1' } })
  const lista = await rpc('tools/list', {})
  const instr = init.result?.instructions ?? ''
  const tools = JSON.stringify(lista.result?.tools ?? [])
  console.log(`\n${(lista.result?.tools ?? []).length} herramientas\n`)
  medir('instrucciones (initialize)', instr)
  medir('tools/list (va en CADA mensaje)', tools)
  medir('= fijo por mensaje', instr + tools)
  for (const t of lista.result?.tools ?? []) medir(`  · ${t.name}`, JSON.stringify(t))
  console.log('')
  const llamar = async (name, args) => {
    const r = await rpc('tools/call', { name, arguments: args })
    medir(`respuesta ${name}`, r.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(r))
  }
  await llamar('ver_proyectos', {})
  await llamar('ver_tareas', { proyecto_id: sid })
  await llamar('ver_cuaderno', {})
  await llamar('buscar', { consulta: 'fotosíntesis' })
  await llamar('leer_pagina', { id: notas[0].id })
  await llamar('leer_pagina', { id: notas[1].id })
} finally {
  if (sid) await rest(`spaces?id=eq.${sid}`, { method: 'DELETE' })
  await borrarCreados()
}
writeFileSync(join(repo, 'test-results', 'conector-tokens.json'), JSON.stringify(filas, null, 1))

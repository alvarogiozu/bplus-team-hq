// Prueba de punta a punta de la «llave temporal para Claude» en el conector (rockie.plus/mcp), con un usuario y un
// proyecto desechables: el proyecto se cifra con el Cofre del NAVEGADOR (src/lib/cofre/cripto.ts), la llave se entrega
// por la función oficial (llave-claude) y se comprueba que el conector lee descifrando, que lo que crea queda CIFRADO
// en la base (y el navegador lo abre), que con la llave vieja no escribe y que sin llave no ve nada. Todo se borra.
//   node scripts/conector-llave-temporal.mjs
import { createHash, randomBytes } from 'node:crypto'
import * as nav from '../src/lib/cofre/cripto.ts'
import { borrarCreados, limpiarViejos, nuevoUsuario, svc } from './ia-usuario.mjs'

const U = svc.SUPABASE_URL
const rest = async (path, init = {}) => {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: svc.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${svc.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}
let fallos = 0
const ok = (cond, que) => {
  if (!cond) fallos++
  console.log(`${cond ? 'OK ' : 'MAL'} ${que}`)
}
const token = randomBytes(24).toString('hex')
let n = 1
const call = async (name, args) => {
  const r = await fetch(`${U}/functions/v1/cuaderno-mcp/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: n++, method: 'tools/call', params: { name, arguments: args } }) })
  const j = await r.json()
  return j.result?.content?.[0]?.text ?? JSON.stringify(j)
}

await limpiarViejos()
let sid = null
try {
  const yo = await nuevoUsuario()
  await rest('planes_suscripciones', { method: 'POST', body: JSON.stringify({ user_id: yo.uid, plan: 'plus', tarifa: 'normal', origen: 'manual', hasta: new Date(Date.now() + 3600e3).toISOString() }) })
  await rest('cuaderno_tokens', { method: 'POST', body: JSON.stringify({ user_id: yo.uid, name: 'Prueba', token_hash: createHash('sha256').update(token).digest('hex'), hint: token.slice(-6), scope: 'escribir', expires_at: new Date(Date.now() + 3600e3).toISOString() }) })

  // un proyecto CERRADO (no «abierto para Claude»), cifrado con la llave del equipo como lo hace la app
  const llave = await nav.nuevaLlave()
  const kid = nav.nuevoKid('e')
  const c = (v) => nav.cifrarValor(llave, kid, v)
  const abre = async (v) => (nav.esCifrado(v) ? await nav.descifrarValor(llave, v) : v)
  const [esp] = await rest('spaces', { method: 'POST', body: JSON.stringify({ name: await c('Proyecto secreto'), created_by: yo.uid, abierto_claude: false }) })
  sid = esp.id
  await rest('space_members', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ space_id: sid, user_id: yo.uid, role: 'owner' }) })
  await rest('cofre_ambitos', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ ambito: 'espacio', ambito_id: sid, kid, creado_por: yo.uid }) })
  await rest('areas', { method: 'POST', body: JSON.stringify({ space_id: sid, name: await c('Diseño secreto'), color: '#b4637a', position: 1 }) })
  const [fr] = await rest('projects', { method: 'POST', body: JSON.stringify({ space_id: sid, name: await c('Frente secreto') }) })
  const [t1] = await rest('tasks', { method: 'POST', body: JSON.stringify({ space_id: sid, title: await c('Tarea que ya existía'), notes: await c('nota vieja'), status: 'todo', project_id: fr.id, position: 1 }) })

  // sin llave: Claude no ve el proyecto
  ok(!(await call('ver_proyectos', {})).includes(sid), 'sin llave, el proyecto no aparece')

  // el aparato entrega la llave (función oficial)
  const ent = await fetch(`${U}/functions/v1/llave-claude`, { method: 'POST', headers: { apikey: svc.SUPABASE_ANON_KEY, Authorization: `Bearer ${yo.jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ambito: 'espacio', space_id: sid, llaves: { [kid]: nav.b64u(await nav.exportarLlave(llave)) }, dias: 1 }) })
  ok(ent.ok, `llave entregada (${ent.status})`)

  // leer: todo llega descifrado
  const vp = await call('ver_proyectos', {})
  ok(vp.includes('Proyecto secreto') && vp.includes('Diseño secreto') && vp.includes('Frente secreto'), 'ver_proyectos descifra nombre, área y frente')
  const vt = await call('ver_tareas', { proyecto_id: sid })
  ok(vt.includes('Tarea que ya existía') && !/c[fj]1\./.test(vt), 'ver_tareas descifra (sin nada cifrado a la vista)')

  // crear: queda CIFRADO en la base con el kid vigente, y el navegador lo abre
  const cr = await call('crear_tareas', { proyecto_id: sid, tareas: [{ titulo: 'Tarea nueva de Claude', notas: 'con notas', area: 'Diseño secreto', nota: '# Plan\ncuerpo de la nota' }] })
  const tid = /\[([0-9a-f-]{36})\]/.exec(cr)?.[1]
  ok(Boolean(tid), 'crear_tareas responde con el id')
  const [fila] = await rest(`tasks?id=eq.${tid}&select=title,notes,area_id,abierta`)
  ok(fila.title.startsWith(`cf1.${kid}.`) && fila.notes.startsWith(`cf1.${kid}.`), 'la tarea nueva está cifrada en la base con el kid vigente')
  ok((await abre(fila.title)) === 'Tarea nueva de Claude' && (await abre(fila.notes)) === 'con notas' && Boolean(fila.area_id), 'y el navegador la abre (título, notas, área)')
  const [mat] = await rest(`materials?task_id=eq.${tid}&kind=eq.note&select=name,note_id,folder_id`)
  const [nota] = await rest(`cuaderno_notes?id=eq.${mat.note_id}&select=title,body,abierta`)
  ok(nav.esCifrado(nota.title) && nav.esCifrado(nota.body) && nav.esCifrado(mat.name) && !nota.abierta, 'su nota, su material y su título: cifrados (nada «abierta»)')
  ok((await abre(nota.body)) === '# Plan\ncuerpo de la nota', 'el navegador abre el cuerpo de la nota')

  // actualizar: suma una línea a notas cifradas y cambia el título
  const ac = await call('actualizar_tareas', { cambios: [{ id: t1.id, estado: 'en_curso', agregar_nota: 'avance de Claude', titulo: 'Título cambiado' }] })
  const [f1] = await rest(`tasks?id=eq.${t1.id}&select=title,notes,status`)
  ok(ac.includes('Listo') && f1.status === 'doing' && nav.esCifrado(f1.title) && nav.esCifrado(f1.notes), 'actualizar_tareas guarda cifrado')
  const notas1 = await abre(f1.notes)
  ok((await abre(f1.title)) === 'Título cambiado' && notas1.startsWith('nota vieja\n- ') && notas1.endsWith('avance de Claude'), 'conserva las notas viejas y suma la línea')

  // la nota de la tarea: leer (con el id de la tarea) y sumar; sigue cifrada
  const lp = await call('leer_pagina', { id: tid })
  ok(lp.includes('cuerpo de la nota') && lp.includes('Tarea nueva de Claude'), 'leer_pagina abre la nota con el id de la tarea')
  await call('editar_pagina', { id: tid, contenido: 'línea sumada' })
  const [nota2] = await rest(`cuaderno_notes?id=eq.${mat.note_id}&select=body`)
  ok(nav.esCifrado(nota2.body) && (await abre(nota2.body)).endsWith('línea sumada'), 'editar_pagina la vuelve a guardar cifrada')

  // la llave entregada quedó vieja (el equipo rotó la suya): no escribe
  const kid2 = nav.nuevoKid('e')
  await rest(`cofre_ambitos?ambito=eq.espacio&ambito_id=eq.${sid}`, { method: 'PATCH', body: JSON.stringify({ kid: kid2 }) })
  const viejo = await call('crear_tareas', { proyecto_id: sid, tareas: [{ titulo: 'no debería crearse' }] })
  const cuantas = (await rest(`tasks?space_id=eq.${sid}&select=id`)).length
  ok(/quedó vieja/.test(viejo) && cuantas === 2, 'con la llave vieja no escribe y lo dice')
  await rest(`cofre_ambitos?ambito=eq.espacio&ambito_id=eq.${sid}`, { method: 'PATCH', body: JSON.stringify({ kid }) })

  // revocar: sin la fila, Claude deja de ver el proyecto
  await rest(`claude_llaves?user_id=eq.${yo.uid}`, { method: 'DELETE' })
  ok(!(await call('ver_proyectos', {})).includes('Proyecto secreto'), 'revocada la llave, el proyecto deja de verse')
  ok(/no encontré|No encontré/i.test(await call('ver_tareas', { proyecto_id: sid })), 'y ver_tareas ya no lo abre')
} finally {
  if (sid) await rest(`spaces?id=eq.${sid}`, { method: 'DELETE' })
  await borrarCreados()
}
console.log(fallos ? `\n${fallos} fallaron` : '\nLlave temporal: todo bien')
process.exit(fallos ? 1 : 0)

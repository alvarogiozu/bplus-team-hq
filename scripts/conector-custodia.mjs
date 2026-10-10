// Prueba de punta a punta del conector (rockie.plus/mcp) con el Cofre automático (protección estándar), con un usuario
// y un proyecto desechables: el Cofre y el proyecto se arman como lo hace el NAVEGADOR (src/lib/cofre/cripto.ts: maestra,
// identidad, llave del equipo en un sobre), la copia se deja por la función oficial (cofre-custodia) y se comprueba que
// Claude entra al proyecto SIN abrirlo ni entregar llaves, que lo que crea queda CIFRADO en la base (y el navegador lo
// abre) y que al pasar a protección avanzada deja de verlo. Todo se borra.
//   node scripts/conector-custodia.mjs
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
  const custodia = async (body) => {
    const r = await fetch(`${U}/functions/v1/cofre-custodia`, { method: 'POST', headers: { apikey: svc.SUPABASE_ANON_KEY, Authorization: `Bearer ${yo.jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, ...(await r.json().catch(() => ({}))) }
  }
  await rest('planes_suscripciones', { method: 'POST', body: JSON.stringify({ user_id: yo.uid, plan: 'plus', tarifa: 'normal', origen: 'manual', hasta: new Date(Date.now() + 3600e3).toISOString() }) })
  await rest('cuaderno_tokens', { method: 'POST', body: JSON.stringify({ user_id: yo.uid, name: 'Prueba', token_hash: createHash('sha256').update(token).digest('hex'), hint: token.slice(-6), scope: 'escribir', expires_at: new Date(Date.now() + 3600e3).toISOString() }) })

  // su Cofre, como lo crea la app la primera vez (protección estándar)
  const maestra = await nav.nuevaLlave()
  const kidP = nav.nuevoKid('p')
  const id = await nav.nuevaIdentidad()
  await rest('cofre_cuentas', {
    method: 'POST',
    body: JSON.stringify({
      user_id: yo.uid,
      kid: kidP,
      publica: id.publica,
      privada: await nav.cifrarValor(maestra, kidP, await nav.exportarPrivada(id.privada)),
      recuperacion: await nav.envolverConCodigo(nav.nuevoCodigo(6), await nav.exportarLlave(maestra), 1000),
      modo: 'estandar',
    }),
  })

  // un proyecto CERRADO (no «abierto para Claude»), cifrado con la llave del equipo, que le llega en un sobre
  const llave = await nav.nuevaLlave()
  const kid = nav.nuevoKid('e')
  const c = (v) => nav.cifrarValor(llave, kid, v)
  const abre = async (v) => (nav.esCifrado(v) ? await nav.descifrarValor(llave, v) : v)
  const [esp] = await rest('spaces', { method: 'POST', body: JSON.stringify({ name: await c('Proyecto en custodia'), created_by: yo.uid, abierto_claude: false }) })
  sid = esp.id
  await rest('space_members', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ space_id: sid, user_id: yo.uid, role: 'owner' }) })
  await rest('cofre_ambitos', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ ambito: 'espacio', ambito_id: sid, kid, creado_por: yo.uid }) })
  await rest('cofre_sobres', { method: 'POST', body: JSON.stringify({ kid, para: yo.uid, ambito: 'espacio', ambito_id: sid, de: yo.uid, sellado: await nav.sellarPara(id.publica, await nav.exportarLlave(llave)) }) })
  await rest('areas', { method: 'POST', body: JSON.stringify({ space_id: sid, name: await c('Área cifrada'), color: '#b4637a', position: 1 }) })
  const [t1] = await rest('tasks', { method: 'POST', body: JSON.stringify({ space_id: sid, title: await c('Tarea que ya existía'), notes: await c('nota vieja'), status: 'todo', position: 1 }) })

  // todavía sin copia en custodia: Claude no ve el proyecto
  ok(!(await call('ver_proyectos', {})).includes('Proyecto en custodia'), 'sin copia en custodia, el proyecto no aparece')

  // una llave que no es la suya no se acepta; la suya sí (función oficial)
  const falsa = await custodia({ accion: 'guardar', kid: kidP, llave: nav.b64u(await nav.exportarLlave(await nav.nuevaLlave())) })
  ok(falsa.status === 400, `la custodia rechaza una llave que no es la maestra (${falsa.status})`)
  const g = await custodia({ accion: 'guardar', kid: kidP, llave: nav.b64u(await nav.exportarLlave(maestra)) })
  ok(g.ok === true, `copia de la maestra en custodia (${g.status})`)
  const a = await custodia({ accion: 'abrir' })
  ok(a.kid === kidP && a.llave === nav.b64u(await nav.exportarLlave(maestra)), 'un dispositivo nuevo recibe la misma maestra')
  const [fila0] = await rest(`cofre_custodia?user_id=eq.${yo.uid}&select=envuelto`)
  ok(Boolean(fila0?.envuelto) && !fila0.envuelto.includes(a.llave), 'en la base la copia va cerrada, no la llave')

  // leer: entra al proyecto sin abrirlo ni entregar llaves, todo descifrado
  const vp = await call('ver_proyectos', {})
  ok(vp.includes('Proyecto en custodia') && vp.includes('Área cifrada'), 'ver_proyectos descifra nombre y área, sin interruptor')
  const vt = await call('ver_tareas', { proyecto_id: sid })
  ok(vt.includes('Tarea que ya existía') && !/c[fj]1\./.test(vt), 'ver_tareas descifra (sin nada cifrado a la vista)')

  // crear y actualizar: queda CIFRADO en la base con el kid del equipo, y el navegador lo abre
  const cr = await call('crear_tareas', { proyecto_id: sid, tareas: [{ titulo: 'Tarea nueva de Claude', notas: 'con notas', area: 'Área cifrada' }] })
  const tid = /\[([0-9a-f-]{36})\]/.exec(cr)?.[1]
  ok(Boolean(tid), 'crear_tareas responde con el id')
  const [fila] = tid ? await rest(`tasks?id=eq.${tid}&select=title,notes,area_id`) : [{}]
  ok(String(fila.title).startsWith(`cf1.${kid}.`) && String(fila.notes).startsWith(`cf1.${kid}.`), 'la tarea nueva está cifrada en la base con el kid del equipo')
  ok((await abre(fila.title)) === 'Tarea nueva de Claude' && (await abre(fila.notes)) === 'con notas' && Boolean(fila.area_id), 'y el navegador la abre (título, notas, área)')
  const ac = await call('actualizar_tareas', { cambios: [{ id: t1.id, estado: 'hecho', titulo: 'Título cambiado' }] })
  const [f1] = await rest(`tasks?id=eq.${t1.id}&select=title,status`)
  ok(ac.includes('Listo') && f1.status === 'done' && nav.esCifrado(f1.title) && (await abre(f1.title)) === 'Título cambiado', 'actualizar_tareas guarda cifrado')

  // la agenda (personal, cifrada con su maestra): ver, crear y cambiar
  const cm = (v) => nav.cifrarValor(maestra, kidP, v)
  const abreM = async (v) => (nav.esCifrado(v) ? await nav.descifrarValor(maestra, v) : v)
  const hoyDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [ev] = await rest('agenda_items', { method: 'POST', body: JSON.stringify({ user_id: yo.uid, title: await cm('Clase de cálculo'), notes: '', day: hoyDia, start_min: 540, duration_min: 90 }) })
  const va = await call('ver_agenda', {})
  ok(va.includes('Clase de cálculo') && va.includes('09:00') && !/c[fj]1\./.test(va), 'ver_agenda descifra los eventos')
  const ge = await call('guardar_eventos', { eventos: [{ titulo: 'Estudiar con Claude', dia: 'mañana', hora: '16:30', minutos: 45, notas: 'capítulo 3' }, { id: ev.id, hora: '10:00', hecho: true }] })
  const eid = /Estudiar con Claude[^\n]*\[([0-9a-f-]{36})\]/.exec(ge)?.[1]
  ok(ge.startsWith('Listo: 2') && Boolean(eid), 'guardar_eventos crea uno y cambia otro')
  const [nuevo] = eid ? await rest(`agenda_items?id=eq.${eid}&select=title,notes,day,start_min,duration_min`) : [{}]
  ok(String(nuevo.title).startsWith(`cf1.${kidP}.`) && String(nuevo.notes).startsWith(`cf1.${kidP}.`) && nuevo.start_min === 990 && nuevo.duration_min === 45 && nuevo.day > hoyDia, 'el evento nuevo queda cifrado con su llave, a su hora')
  ok((await abreM(nuevo.title)) === 'Estudiar con Claude' && (await abreM(nuevo.notes)) === 'capítulo 3', 'y el navegador lo abre')
  const [mov] = await rest(`agenda_items?id=eq.${ev.id}&select=title,start_min,done_at`)
  ok(mov.start_min === 600 && Boolean(mov.done_at) && (await abreM(mov.title)) === 'Clase de cálculo', 'mover y marcar hecho conserva el título')

  // el cuaderno personal ENTERO (nada «abierto para Claude»): ver, buscar, leer, crear, editar y tarjetas
  const [libro] = await rest('cuaderno_books', { method: 'POST', body: JSON.stringify({ user_id: yo.uid, name: await cm('Biología'), kind: 'cuaderno', position: 1, abierta_claude: false }) })
  const [pag] = await rest('cuaderno_notes', { method: 'POST', body: JSON.stringify({ user_id: yo.uid, title: await cm('La célula'), body: await cm('La mitocondria produce energía.'), kind: 'pagina', book_id: libro.id, position: 1 }) })
  const vc = await call('ver_cuaderno', {})
  ok(vc.includes('Biología') && vc.includes('La célula') && !/c[fj]1\./.test(vc), 'ver_cuaderno muestra el cuaderno cifrado, abierto')
  ok((await call('buscar', { consulta: 'mitocondria' })).includes('La célula'), 'buscar encuentra dentro de una página cifrada')
  ok((await call('leer_pagina', { id: pag.id })).includes('produce energía'), 'leer_pagina la abre')
  const cp = await call('crear_paginas', { cuaderno_id: libro.id, paginas: [{ titulo: 'El núcleo', contenido: 'Guarda el ADN. Ver [[La célula]].' }] })
  const pid = /El núcleo \[([0-9a-f-]{36})\]/.exec(cp)?.[1]
  const [nueva] = pid ? await rest(`cuaderno_notes?id=eq.${pid}&select=title,body,abierta`) : [{}]
  ok(Boolean(pid) && String(nueva.title).startsWith(`cf1.${kidP}.`) && String(nueva.body).startsWith(`cf1.${kidP}.`) && nueva.abierta === false, 'crear_paginas guarda cifrado con su llave')
  ok((await abreM(nueva.title)) === 'El núcleo' && String(await abreM(nueva.body)).includes('Guarda el ADN') && String(await abreM(nueva.body)).includes(`cuaderno://nota/${pag.id}`), 'el navegador la abre y [[…]] quedó enlazado')
  await call('editar_pagina', { id: pag.id, contenido: 'También tiene ribosomas.' })
  const [edit] = await rest(`cuaderno_notes?id=eq.${pag.id}&select=title,body`)
  ok(nav.esCifrado(edit.body) && String(await abreM(edit.body)).endsWith('También tiene ribosomas.') && (await abreM(edit.title)) === 'La célula', 'editar_pagina suma y vuelve a guardar cifrado')
  await call('crear_tarjetas', { pagina_id: pag.id, tarjetas: [{ pregunta: '¿Qué produce la mitocondria?', respuesta: 'Energía' }] })
  const [tarj] = await rest(`cuaderno_cards?note_id=eq.${pag.id}&select=q,a`)
  ok(nav.esCifrado(tarj?.q) && (await abreM(tarj.a)) === 'Energía', 'crear_tarjetas guarda cifrado')
  const [tarjD] = await rest(`cuaderno_cards?note_id=eq.${pag.id}&select=due,box,abierta`)
  const ph = await call('ver_tarjetas', {})
  ok(ph.includes('¿Qué produce la mitocondria?'), `ver_tarjetas las abre (${JSON.stringify(tarjD)} ${ph.slice(0, 90)})`)

  // Hábitos (esquema habitos): ver y marcar uno; marcar pasa por validate-habit, que escribe el cumplido y la racha
  const H = { 'Accept-Profile': 'habitos', 'Content-Profile': 'habitos' }
  await rest('profiles', { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ id: yo.uid, name: 'Prueba' }) })
  const [hab] = await rest('habits', { method: 'POST', headers: H, body: JSON.stringify({ user_id: yo.uid, name: 'Leer 20 páginas', time: '21:00' }) })
  const vh = await call('ver_habitos', {})
  ok(vh.includes('○ pendiente · 21:00 · Leer 20 páginas') && vh.includes(hab.id), 'ver_habitos lista el hábito pendiente')
  const mh = await call('marcar_habito', { habito: hab.id })
  const [cumplido] = await rest(`completions?habit_id=eq.${hab.id}&select=mode,date`, { headers: H })
  const [racha] = await rest(`streaks?user_id=eq.${yo.uid}&select=current`, { headers: H })
  ok(mh.startsWith('✓ Leer 20 páginas') && cumplido?.mode === 'check' && racha?.current === 1, `marcar_habito deja el cumplido y la racha en 1 (${mh.slice(0, 60)})`)
  ok((await call('ver_habitos', {})).includes('✓ hecho · 21:00 · Leer 20 páginas'), 'ver_habitos lo muestra hecho')
  ok(/ya estaba marcado/.test(await call('marcar_habito', { habito: hab.id })), 'marcarlo dos veces no duplica')
  ok(/No encontré/.test(await call('marcar_habito', { habito: sid })), 'un id que no es suyo no se marca')

  // protección avanzada: se borra la copia y Claude deja de entrar
  const q = await custodia({ accion: 'quitar' })
  const [cuenta] = await rest(`cofre_cuentas?user_id=eq.${yo.uid}&select=modo`)
  const copias = await rest(`cofre_custodia?user_id=eq.${yo.uid}&select=kid`)
  ok(q.ok === true && cuenta.modo === 'avanzada' && copias.length === 0, 'protección avanzada: copia borrada')
  ok((await custodia({ accion: 'abrir' })).status === 403, 'en avanzada la función ya no entrega nada')
  ok(!(await call('ver_proyectos', {})).includes('Proyecto en custodia'), 'en avanzada Claude deja de ver el proyecto')
  ok(/no encontré/i.test(await call('ver_tareas', { proyecto_id: sid })), 'y ver_tareas ya no lo abre')
  ok(/protección avanzada/.test(await call('ver_agenda', {})), 'ni abre la agenda')
  ok(!(await call('ver_cuaderno', {})).includes('La célula'), 'ni el cuaderno')
  const no = await call('crear_tareas', { proyecto_id: sid, tareas: [{ titulo: 'no debería crearse' }] })
  ok((await rest(`tasks?space_id=eq.${sid}&select=id`)).length === 2 && !/\[[0-9a-f-]{36}\]/.test(no), 'ni escribe')
} finally {
  if (sid) await rest(`spaces?id=eq.${sid}`, { method: 'DELETE' })
  await borrarCreados()
}
console.log(fallos ? `\n${fallos} fallaron` : '\nConector con Cofre automático: todo bien')
process.exit(fallos ? 1 : 0)

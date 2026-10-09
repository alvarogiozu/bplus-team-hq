// Vectores de la llave temporal para Claude: lo que cierra el navegador (src/lib/cofre/cripto.ts) lo abre el servidor
// con las llaves entregadas (supabase/functions/_shared/claude-llaves.ts + cofre.ts), y un blob no sirve en otra fila.
//   node --experimental-strip-types scripts/claude-llaves-vectores.mjs
// Usa una KEK de prueba al azar (nunca la real).
import { cifrarValor as cifrarNavegador, exportarLlave, nuevaLlave, nuevoKid } from '../src/lib/cofre/cripto.ts'
import { abrir, b64u, cerrar } from '../supabase/functions/_shared/cofre.ts'
import { abrirEnvuelto, envolver } from '../supabase/functions/_shared/claude-llaves.ts'

let fallos = 0
const ok = (c, m) => {
  if (!c) fallos++
  console.log(c ? '✔' : '✘', m)
}
const kek = crypto.getRandomValues(new Uint8Array(32))
const llave = await nuevaLlave()
const kid = nuevoKid('s')
const entregadas = { [kid]: b64u(await exportarLlave(llave)) }
const uid = crypto.randomUUID()
const sid = crypto.randomUUID()

const env = await envolver(kek, uid, 'espacio', sid, entregadas)
const llaves = await abrirEnvuelto(kek, uid, 'espacio', sid, env)
ok(llaves.has(kid), 'el servidor abre el blob y recupera la llave')
const tarea = await cifrarNavegador(llave, kid, 'Comprar piezas\ncon notas de varias líneas')
ok((await abrir(llaves, tarea)) === 'Comprar piezas\ncon notas de varias líneas', 'abre un texto cifrado por el navegador')
const lista = await cifrarNavegador(llave, kid, [1, 'dos', { tres: 3 }])
ok(JSON.stringify(await abrir(llaves, lista)) === JSON.stringify([1, 'dos', { tres: 3 }]), 'abre un valor JSON del navegador')
const nuevo = await cerrar(llaves, kid, 'escrito por Claude')
ok(nuevo.startsWith(`cf1.${kid}.`), 'lo que escribe Claude va cifrado con el mismo kid')
let otraFila = false
try {
  await abrirEnvuelto(kek, crypto.randomUUID(), 'espacio', sid, env)
} catch {
  otraFila = true
}
ok(otraFila, 'el blob copiado a otra persona no abre')
let otroProyecto = false
try {
  await abrirEnvuelto(kek, uid, 'espacio', crypto.randomUUID(), env)
} catch {
  otroProyecto = true
}
ok(otroProyecto, 'el blob copiado a otro proyecto no abre')
let otraKek = false
try {
  await abrirEnvuelto(crypto.getRandomValues(new Uint8Array(32)), uid, 'espacio', sid, env)
} catch {
  otraKek = true
}
ok(otraKek, 'sin la KEK no abre')
process.exit(fallos ? 1 : 0)

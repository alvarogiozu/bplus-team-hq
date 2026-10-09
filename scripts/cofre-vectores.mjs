// Vectores cruzados del Cofre: lo que cifra el navegador (src/lib/cofre/cripto.ts) lo abre el servidor
// (supabase/functions/_shared/cofre.ts) y al revés, con el mismo formato cf1/cj1. Si alguien cambia uno de los dos y
// rompe la compatibilidad, esto falla. Corre en Node (WebCrypto estándar, igual que Deno y el navegador).
//   node scripts/cofre-vectores.mjs
import * as nav from '../src/lib/cofre/cripto.ts'
import * as srv from '../supabase/functions/_shared/cofre.ts'

let fallos = 0
const ok = (cond, que) => {
  if (!cond) fallos++
  console.log(`${cond ? 'OK ' : 'MAL'} ${que}`)
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const lanza = async (f) => {
  try {
    await f()
    return false
  } catch {
    return true
  }
}

// llave fija 00 01 02 … 1f (solo para estos vectores)
const RAW = new Uint8Array(32).map((_, i) => i)
const KID = 'eVectorFijo01'
const TEXTO = 'Hola Rockie, ñandú 🦖 «prueba»'
const OBJ = { lista: [1, 'dos', null], ok: true }
// grabados con el navegador (no cambiarlos: si dejan de abrir, se rompió la compatibilidad con lo ya guardado)
const FIJO_TEXTO = 'cf1.eVectorFijo01.JbHf5_Ou_EiKLJv_dU2ji8djVrZBMKzNDjXGd133YBZS-ZWd-EA9SC5jdlIULPgWGTKOAyFduduNYTz0kYH3aQ'
const FIJO_JSON = 'cj1.eVectorFijo01.FvquRqcPI45qIZjGk9MEdSbbMNUoVtU9ogmzH26Z8Q6pzSOLZ54qnW27GT2FmbwrIIoyTzES2KfiXTM_nNE'

const kNav = await nav.importarLlave(RAW)
const kSrv = await srv.importarLlave(RAW)
const llaves = new Map([[KID, kSrv]])

// 1) vectores fijos: los dos los abren igual
ok((await srv.descifrarValor(kSrv, FIJO_TEXTO)) === TEXTO, 'servidor abre el texto fijo del navegador')
ok(igual(await srv.descifrarValor(kSrv, FIJO_JSON), OBJ), 'servidor abre el JSON fijo del navegador')
ok((await nav.descifrarValor(kNav, FIJO_TEXTO)) === TEXTO, 'navegador abre su texto fijo')

// 2) cruzados, en los dos sentidos
const largo = 'á'.repeat(60_000)
for (const [nombre, v] of [
  ['texto', TEXTO],
  ['vacío', ''],
  ['largo (60 mil)', largo],
  ['objeto', OBJ],
  ['número', 42],
  ['lista', ['a', { b: 2 }]],
]) {
  const deNav = await nav.cifrarValor(kNav, KID, v)
  const deSrv = await srv.cifrarValor(kSrv, KID, v)
  ok(igual(await srv.descifrarValor(kSrv, deNav), v), `navegador → servidor: ${nombre}`)
  ok(igual(await nav.descifrarValor(kNav, deSrv), v), `servidor → navegador: ${nombre}`)
  ok(deSrv.startsWith(typeof v === 'string' ? 'cf1.' : 'cj1.') && srv.kidDe(deSrv) === KID && nav.esCifrado(deSrv), `formato del servidor: ${nombre}`)
}

// 3) mismo valor, iv nuevo: nunca da el mismo resultado
ok((await srv.cifrarValor(kSrv, KID, TEXTO)) !== (await srv.cifrarValor(kSrv, KID, TEXTO)), 'iv nuevo cada vez')

// 4) tocar los datos o usar otra llave: se detecta
const tocado = FIJO_TEXTO.slice(0, -2) + (FIJO_TEXTO.endsWith('A') ? 'B' : 'A') + FIJO_TEXTO.slice(-1)
ok(await lanza(() => srv.descifrarValor(kSrv, tocado)), 'datos tocados: el servidor lo detecta')
const otra = await srv.importarLlave(new Uint8Array(32).fill(7))
ok(await lanza(() => srv.descifrarValor(otra, FIJO_TEXTO)), 'otra llave: no abre')

// 5) el llavero del pedido
ok((await srv.abrir(llaves, FIJO_TEXTO)) === TEXTO, 'abrir con el llavero')
ok((await srv.abrir(new Map(), FIJO_TEXTO)) === null, 'sin la llave: null (se muestra 🔒, no se toca)')
ok((await srv.abrir(llaves, tocado)) === null, 'dañado: null')
ok((await srv.abrir(llaves, 'en claro')) === 'en claro', 'lo que está en claro pasa igual')
const { fila, abierta } = await srv.abrirFila(llaves, { title: FIJO_TEXTO, notes: null, id: 'x' }, ['title', 'notes'])
ok(abierta && fila.title === TEXTO && fila.notes === null && fila.id === 'x', 'abrirFila')
ok(!(await srv.abrirFila(new Map(), { title: FIJO_TEXTO }, ['title'])).abierta, 'abrirFila sin llave: no abierta')
ok(igual(await nav.descifrarValor(kNav, await srv.cerrar(llaves, KID, OBJ)), OBJ), 'cerrar con el kid vigente → el navegador lo abre')
ok(await lanza(() => srv.cerrar(new Map(), KID, 'x')), 'cerrar sin llave: no escribe')
ok(await lanza(() => srv.importarLlave(new Uint8Array(16))), 'una llave que no es de 32 bytes se rechaza')

console.log(fallos ? `\n${fallos} fallaron` : '\nTodo compatible')
process.exit(fallos ? 1 : 0)

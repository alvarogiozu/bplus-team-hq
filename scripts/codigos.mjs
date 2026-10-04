// Códigos para activar planes mientras el pago en línea (Culqi) no está conectado: la persona paga por Yape,
// el equipo le manda un código y lo canjea en rockie.plus/planes (docs/negocio/modelo-de-negocio.md).
//
//   node scripts/codigos.mjs crear plus              -> 1 código Plus, precio fundador, sin vencimiento
//   node scripts/codigos.mjs crear plus 1 --meses 1  -> 1 código Plus por 1 mes
//   node scripts/codigos.mjs crear pro 5 --nota "lote feria UPC"
//   node scripts/codigos.mjs crear club --meses 3    -> plan Club (lo canjea quien creó el equipo)
//   node scripts/codigos.mjs crear plus 1 --tarifa estudiante --meses 1
//   node scripts/codigos.mjs lista                   -> los últimos 30 códigos y cuántas veces se usaron
//
// Lee .secrets/service.env (llave de servicio: nunca al repo, nunca al navegador). No lee datos de nadie:
// solo escribe y lista códigos.
import { readFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.secrets/service.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// sin letras que se confunden (0/O, 1/I/L)
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const trozo = (n) => Array.from({ length: n }, () => ABC[randomInt(ABC.length)]).join('')
const nuevoCodigo = (plan) => `${plan.toUpperCase()}-${trozo(4)}-${trozo(4)}`

function opcion(args, nombre) {
  const i = args.indexOf(`--${nombre}`)
  return i >= 0 ? args[i + 1] : undefined
}

async function crear(args) {
  const plan = args[0]
  if (!['plus', 'pro', 'club'].includes(plan)) throw new Error('Plan: plus, pro o club')
  const cuantos = Number(args[1] && !args[1].startsWith('--') ? args[1] : 1)
  const meses = opcion(args, 'meses') ? Number(opcion(args, 'meses')) : null
  const tarifa = opcion(args, 'tarifa') ?? 'fundador'
  const nota = opcion(args, 'nota') ?? ''
  if (!Number.isInteger(cuantos) || cuantos < 1 || cuantos > 200) throw new Error('Cantidad: de 1 a 200')
  if (meses !== null && (!Number.isInteger(meses) || meses < 1)) throw new Error('--meses: un número entero')
  if (!['normal', 'estudiante', 'fundador'].includes(tarifa)) throw new Error('--tarifa: normal, estudiante o fundador')
  const filas = Array.from({ length: cuantos }, () => ({ codigo: nuevoCodigo(plan), plan, meses, tarifa, nota }))
  const { error } = await admin.from('planes_codigos').insert(filas)
  if (error) throw new Error(error.message)
  console.log(`\n${cuantos} código(s) ${plan.toUpperCase()} · ${meses ? `${meses} mes(es)` : 'sin vencimiento'} · tarifa ${tarifa}${nota ? ` · ${nota}` : ''}\n`)
  for (const f of filas) console.log(`  ${f.codigo}`)
  console.log('\nSe canjean en rockie.plus/planes → «Activar un plan».\n')
}

async function lista() {
  const { data, error } = await admin
    .from('planes_codigos')
    .select('codigo, plan, meses, tarifa, usos, usos_max, nota, created_at')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  for (const c of data ?? []) {
    const uso = c.usos >= c.usos_max ? 'usado' : 'libre'
    console.log(`${c.codigo.padEnd(18)} ${c.plan.padEnd(5)} ${(c.meses ? `${c.meses}m` : '∞').padEnd(4)} ${c.tarifa.padEnd(10)} ${uso.padEnd(6)} ${c.nota}`)
  }
}

const [cmd, ...args] = process.argv.slice(2)
try {
  if (cmd === 'crear') await crear(args)
  else if (cmd === 'lista') await lista()
  else console.log('Uso: node scripts/codigos.mjs crear <plus|pro|club> [cantidad] [--meses N] [--tarifa normal|estudiante|fundador] [--nota "…"]  |  lista')
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}

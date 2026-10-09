// Respaldo lógico de una base de Supabase por su API, sin pg_dump ni Docker.
//   node supabase/respaldo.mjs <carpeta-destino> [--archivos]
// Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno (nunca los imprime).
// Guarda: cada tabla de public en JSON (lo cifrado del Cofre se queda cifrado), los usuarios de Auth,
// el inventario de Storage y, con --archivos, los archivos mismos. El esquema vive en supabase/migrations.
// Sirve para las dos bases (Rockie OS y Hábitos). Solo lee: no cambia nada en la base.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [destino, ...flags] = process.argv.slice(2)
const URL = process.env.SUPABASE_URL?.replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!destino || !URL || !KEY) {
  console.error('Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/respaldo.mjs <carpeta> [--archivos]')
  process.exit(1)
}
const conArchivos = flags.includes('--archivos')
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const guardar = (ruta, datos) => {
  mkdirSync(join(destino, ruta, '..'), { recursive: true })
  writeFileSync(join(destino, ruta), typeof datos === 'string' || datos instanceof Uint8Array ? datos : JSON.stringify(datos))
}
const pedir = async (ruta, extra = {}) => {
  const r = await fetch(`${URL}${ruta}`, { headers: { ...h, ...extra } })
  if (!r.ok) throw new Error(`${ruta} → ${r.status} ${(await r.text()).slice(0, 160)}`)
  return r
}
const resumen = { url: URL, fecha: new Date().toISOString(), tablas: {}, usuarios: 0, archivos: {} }

// 1. Tablas: PostgREST describe lo expuesto; las vistas se saltan (se rehacen con las migraciones).
const api = await (await pedir('/rest/v1/', { Accept: 'application/openapi+json' })).json()
const tablas = Object.keys(api.definitions ?? {}).sort()
for (const t of tablas) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { ...h, Range: `${desde}-${desde + 999}`, 'Range-Unit': 'items' } })
    if (!r.ok) { resumen.tablas[t] = `error ${r.status}`; break }
    const lote = await r.json()
    filas.push(...lote)
    if (lote.length < 1000) break
  }
  if (typeof resumen.tablas[t] === 'string') continue
  guardar(`tablas/${t}.json`, filas)
  resumen.tablas[t] = filas.length
}

// 2. Usuarios de Auth (correo, proveedor, metadatos; las contraseñas nunca salen de Supabase).
const usuarios = []
for (let page = 1; ; page++) {
  const { users } = await (await pedir(`/auth/v1/admin/users?page=${page}&per_page=1000`)).json()
  usuarios.push(...users)
  if (users.length < 1000) break
}
guardar('auth/users.json', usuarios)
resumen.usuarios = usuarios.length

// 3. Storage: inventario de cada bucket (y los archivos con --archivos).
const listar = async (bucket, prefijo) => {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset }),
    })
    if (!r.ok) throw new Error(`storage ${bucket}/${prefijo} → ${r.status}`)
    const items = await r.json()
    for (const it of items) {
      const ruta = prefijo ? `${prefijo}/${it.name}` : it.name
      if (it.id === null) out.push(...(await listar(bucket, ruta)))
      else out.push({ ruta, tamano: it.metadata?.size ?? 0, tipo: it.metadata?.mimetype, actualizado: it.updated_at })
    }
    if (items.length < 1000) break
  }
  return out
}
const buckets = await (await pedir('/storage/v1/bucket')).json()
guardar('storage/buckets.json', buckets)
for (const b of buckets) {
  const objetos = await listar(b.id, '')
  guardar(`storage/${b.id}.inventario.json`, objetos)
  resumen.archivos[b.id] = { cantidad: objetos.length, mb: +(objetos.reduce((s, o) => s + o.tamano, 0) / 1048576).toFixed(1) }
  if (conArchivos) {
    for (const o of objetos) {
      const r = await fetch(`${URL}/storage/v1/object/${b.id}/${o.ruta.split('/').map(encodeURIComponent).join('/')}`, { headers: h })
      if (r.ok) guardar(`storage/${b.id}/${o.ruta}`, new Uint8Array(await r.arrayBuffer()))
    }
  }
}

guardar('resumen.json', JSON.stringify(resumen, null, 2))
const errores = Object.entries(resumen.tablas).filter(([, v]) => typeof v === 'string')
console.log(`Listo: ${tablas.length - errores.length} tablas, ${resumen.usuarios} usuarios, buckets ${JSON.stringify(resumen.archivos)}`)
if (errores.length) console.log('Con error:', errores.map(([t, v]) => `${t} (${v})`).join(', '))

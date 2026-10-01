// Guardián de privacidad: corre antes de cada build (npm run build).
// Lee TODAS las migraciones y exige que cada columna de texto o JSON esté clasificada en
// src/lib/cofre/privacidad.json: o se cifra (cifrar), o se explica por qué no (publico / servidor).
// Así ninguna columna nueva con datos de personas llega a producción en claro sin que alguien lo decida.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dirMig = path.join(raiz, 'supabase', 'migrations')
const registro = JSON.parse(fs.readFileSync(path.join(raiz, 'src', 'lib', 'cofre', 'privacidad.json'), 'utf8'))

const TIPO = /^(text|jsonb|json|bytea|varchar|character varying|citext)(\[\])?\b/i
const tablas = new Map() // tabla -> Set(columnas de texto)

const quitarComentarios = (s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
const nombre = (s) => s.replace(/^public\./, '').replace(/"/g, '')

/** Parte el cuerpo de un create table en definiciones de nivel superior (las comas dentro de paréntesis no cuentan). */
function partes(cuerpo) {
  const out = []
  let nivel = 0
  let actual = ''
  for (const ch of cuerpo) {
    if (ch === '(') nivel++
    if (ch === ')') nivel--
    if (ch === ',' && nivel === 0) {
      out.push(actual)
      actual = ''
    } else actual += ch
  }
  if (actual.trim()) out.push(actual)
  return out.map((p) => p.trim())
}

for (const archivo of fs.readdirSync(dirMig).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = quitarComentarios(fs.readFileSync(path.join(dirMig, archivo), 'utf8'))
  // create table: se busca el paréntesis que cierra
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(/gi)) {
    const t = nombre(m[1])
    let i = m.index + m[0].length
    let nivel = 1
    const desde = i
    while (i < sql.length && nivel > 0) {
      if (sql[i] === '(') nivel++
      if (sql[i] === ')') nivel--
      i++
    }
    const cols = new Set()
    for (const def of partes(sql.slice(desde, i - 1))) {
      const c = /^([a-z_][\w]*)\s+(.+)$/i.exec(def)
      if (!c || /^(constraint|primary|unique|check|foreign|exclude|like)$/i.test(c[1])) continue
      if (TIPO.test(c[2])) cols.add(c[1])
    }
    tablas.set(t, cols)
  }
  for (const st of sql.split(';')) {
    const a = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)([\s\S]*)/i.exec(st)
    if (a) {
      const t = nombre(a[1])
      const cols = tablas.get(t) ?? new Set()
      for (const m of a[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]\w*)\s+([^,]+)/gi)) {
        if (TIPO.test(m[2].trim())) cols.add(m[1])
      }
      for (const m of a[2].matchAll(/drop\s+column\s+(?:if\s+exists\s+)?([a-z_]\w*)/gi)) cols.delete(m[1])
      for (const m of a[2].matchAll(/rename\s+column\s+([a-z_]\w*)\s+to\s+([a-z_]\w*)/gi)) {
        if (cols.delete(m[1])) cols.add(m[2])
      }
      tablas.set(t, cols)
    }
    const d = /drop\s+table\s+(?:if\s+exists\s+)?([\w."]+)/i.exec(st)
    if (d) tablas.delete(nombre(d[1]))
  }
}

const faltan = []
for (const [t, cols] of tablas) {
  if (!cols.size) continue
  const r = registro.tablas[t]
  if (!r) {
    faltan.push(`  · tabla «${t}» (${[...cols].join(', ')}) no está en el registro`)
    continue
  }
  const clasificadas = new Set([...(r.cifrar ?? []), ...Object.keys(r.publico ?? {}), ...Object.keys(r.servidor ?? {})])
  for (const c of cols) if (!clasificadas.has(c)) faltan.push(`  · ${t}.${c} no está clasificada`)
  for (const [c, motivo] of Object.entries({ ...(r.publico ?? {}), ...(r.servidor ?? {}) })) {
    if (!String(motivo).trim()) faltan.push(`  · ${t}.${c}: falta el motivo de por qué no se cifra`)
  }
}

if (faltan.length) {
  console.error(
    '\n🔒 Privacidad: hay columnas de texto sin decidir si se cifran.\n' +
      faltan.join('\n') +
      '\n\nAgrégalas en src/lib/cofre/privacidad.json:\n' +
      '  "cifrar": [...]           si es contenido de una persona o un equipo (lo normal)\n' +
      '  "publico": {"col": "por qué"}  solo si el servidor la necesita leer para funcionar\n' +
      'Ver docs/privacidad.md.\n',
  )
  process.exit(1)
}
console.log(`🔒 Privacidad: ${tablas.size} tablas revisadas, todas las columnas de texto clasificadas.`)

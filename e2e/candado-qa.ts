// Los usuarios qa.* son de todos: varias sesiones (de Claude o personas) corren e2e a la vez contra la misma base.
// Antes, cada corrida hacía «qa.mjs clean + seed» al empezar y «clean» al terminar, y borraba los qa.* en medio de las
// pruebas de las demás. Ahora cada corrida se anota aquí: solo limpia y siembra quien llega cuando no hay nadie, y solo
// limpia al final quien se va último. Una anotación vieja (proceso muerto o más de 45 min) no cuenta.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'node_modules', '.e2e-qa-en-uso')
const VIGENCIA = 45 * 60_000
const yo = join(DIR, `${process.pid}.json`)

function viva(pid: number, desde: number) {
  if (Date.now() - desde > VIGENCIA) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Las otras corridas activas (borra las anotaciones vencidas). */
export function otrasCorridas(): number {
  mkdirSync(DIR, { recursive: true })
  let n = 0
  for (const f of readdirSync(DIR)) {
    const ruta = join(DIR, f)
    try {
      const { pid, desde } = JSON.parse(readFileSync(ruta, 'utf8')) as { pid: number; desde: number }
      if (pid === process.pid) continue
      if (viva(pid, desde)) n++
      else rmSync(ruta, { force: true })
    } catch {
      rmSync(ruta, { force: true })
    }
  }
  return n
}

export function anotarme() {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(yo, JSON.stringify({ pid: process.pid, desde: Date.now(), sesion: process.env.E2E_SESION ?? '' }))
}

export function borrarme() {
  rmSync(yo, { force: true })
}

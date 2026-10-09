import { execFileSync } from 'node:child_process'
import { borrarme, otrasCorridas } from './candado-qa'

export default function globalTeardown() {
  borrarme()
  if (process.env.HQ_KEEP_QA) return
  // limpia solo quien se va último: si otra corrida sigue, sus qa.* se quedan (e2e/candado-qa.ts)
  if (otrasCorridas()) return
  execFileSync('node', ['scripts/qa.mjs', 'clean'], { stdio: 'inherit' })
}

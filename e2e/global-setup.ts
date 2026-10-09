import { execFileSync } from 'node:child_process'
import { anotarme, otrasCorridas } from './candado-qa'

export default function globalSetup() {
  // si otra corrida está usando los qa.*, no se borran ni se resiembran: se usan tal cual (e2e/candado-qa.ts)
  const otras = otrasCorridas()
  anotarme()
  if (otras) {
    console.log(`[e2e] hay ${otras} corrida(s) más usando los qa.*: no se limpian ni se siembran de nuevo`)
    return
  }
  execFileSync('node', ['scripts/qa.mjs', 'clean'], { stdio: 'inherit' })
  execFileSync('node', ['scripts/qa.mjs', 'seed'], { stdio: 'inherit' })
}

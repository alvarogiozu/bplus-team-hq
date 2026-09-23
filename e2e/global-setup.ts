import { execFileSync } from 'node:child_process'

export default function globalSetup() {
  execFileSync('node', ['scripts/qa.mjs', 'clean'], { stdio: 'inherit' })
  execFileSync('node', ['scripts/qa.mjs', 'seed'], { stdio: 'inherit' })
}

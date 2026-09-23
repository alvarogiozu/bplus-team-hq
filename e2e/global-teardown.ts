import { execFileSync } from 'node:child_process'

export default function globalTeardown() {
  if (process.env.HQ_KEEP_QA) return
  execFileSync('node', ['scripts/qa.mjs', 'clean'], { stdio: 'inherit' })
}

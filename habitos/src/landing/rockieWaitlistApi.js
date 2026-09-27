// API de waitlist + aportes Rockie 1 (landing publica).
import { supabase } from '../data/supabase.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(s) {
  return String(s || '').trim()
}

function mapError(err, duplicateMsg) {
  if (!err) return 'error'
  const msg = String(err.message || err.code || '')
  if (/duplicate|unique|23505/i.test(msg)) return duplicateMsg || 'duplicate'
  return 'error'
}

export function joinWaitlist({ name, email }) {
  const n = clean(name)
  const e = clean(email).toLowerCase()
  if (!n) return Promise.resolve({ ok: false, code: 'name' })
  if (!EMAIL_RE.test(e)) return Promise.resolve({ ok: false, code: 'email' })
  if (!supabase) return Promise.resolve({ ok: false, code: 'offline' })

  return supabase
    .from('rockie_waitlist')
    .insert({ name: n, email: e })
    .then(({ error }) => {
      if (error) return { ok: false, code: mapError(error, 'duplicate') }
      return { ok: true }
    })
    .catch(() => ({ ok: false, code: 'error' }))
}

export function sendRockieMessage({ name, email, message }) {
  const m = clean(message)
  const n = clean(name)
  const e = clean(email).toLowerCase()
  if (!m) return Promise.resolve({ ok: false, code: 'message' })
  if (m.length > 2000) return Promise.resolve({ ok: false, code: 'message' })
  if (e && !EMAIL_RE.test(e)) return Promise.resolve({ ok: false, code: 'email' })
  if (!supabase) return Promise.resolve({ ok: false, code: 'offline' })

  const row = { message: m }
  if (n) row.name = n
  if (e) row.email = e

  return supabase
    .from('rockie_feedback')
    .insert(row)
    .then(({ error }) => {
      if (error) return { ok: false, code: mapError(error) }
      return { ok: true }
    })
    .catch(() => ({ ok: false, code: 'error' }))
}

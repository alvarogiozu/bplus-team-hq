// «Huellas de significado» de las notas (embeddings), para que Rockie encuentre las parecidas.
// Con el Cofre ya no viven en claro en la base: el servidor solo convierte un texto en números (sin guardarlo),
// aquí se guardan cifradas (cuaderno_huellas, por el fetch del Cofre) y la comparación se hace en el dispositivo.
// Se guardan cuantizadas a 8 bits (768 bytes por nota): para comparar parecidos alcanza y pesa 10 veces menos.

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { b64u, deB64u } from '../lib/cofre/cripto'
import type { Note } from './data'

const db = supabase as unknown as SupabaseClient

type Guardada = { q: string; s: number; t: string } // vector cuantizado (base64url), escala y fecha de la nota
type Huella = { v: Int8Array; norma: number; t: string }

const huellas = new Map<string, Huella>()
let carga: Promise<void> | null = null

function desdeGuardada(g: Guardada): Huella | null {
  if (!g || typeof g.q !== 'string') return null
  const v = new Int8Array(deB64u(g.q).buffer)
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  return { v, norma: Math.sqrt(n) || 1, t: g.t }
}

function cuantizar(vec: number[], t: string): Guardada {
  let max = 0
  for (const x of vec) max = Math.max(max, Math.abs(x))
  const s = max / 127 || 1
  const q = new Int8Array(vec.length)
  for (let i = 0; i < vec.length; i++) q[i] = Math.round(vec[i] / s)
  return { q: b64u(new Uint8Array(q.buffer)), s, t }
}

function cargar(): Promise<void> {
  if (!carga) {
    carga = (async () => {
      const { data } = await db.from('cuaderno_huellas').select('note_id, huella')
      for (const r of (data ?? []) as { note_id: string; huella: Guardada | null }[]) {
        const h = r.huella && typeof r.huella === 'object' ? desdeGuardada(r.huella) : null
        if (h) huellas.set(r.note_id, h)
      }
    })().catch(() => {
      carga = null
    })
  }
  return carga ?? Promise.resolve()
}

/** Huellas de unos textos (el servidor no las guarda). */
export async function vectores(textos: string[]): Promise<number[][]> {
  if (!textos.length) return []
  const { data, error } = await supabase.functions.invoke('cuaderno-agent', { body: { action: 'vectores', textos } })
  if (error || !Array.isArray(data?.vectores)) return []
  return data.vectores as number[][]
}

/** Recalcula (en tandas de 20) las huellas de las notas que cambiaron desde la última vez. */
export async function actualizarHuellas(notas: Note[]): Promise<void> {
  await cargar()
  const viejas = notas.filter((n) => n.kind !== 'pizarra' && n.title && (huellas.get(n.id)?.t ?? '') < n.updated_at)
  for (let i = 0; i < viejas.length; i += 20) {
    const tanda = viejas.slice(i, i + 20)
    const vs = await vectores(tanda.map((n) => `${n.title}\n\n${n.body}`.slice(0, 8000)))
    if (vs.length !== tanda.length) return
    const filas = tanda.map((n, j) => ({ note_id: n.id, huella: cuantizar(vs[j], n.updated_at), actualizado: new Date().toISOString() }))
    const { error } = await db.from('cuaderno_huellas').upsert(filas, { onConflict: 'note_id' })
    if (error) return
    filas.forEach((f) => {
      const h = desdeGuardada(f.huella)
      if (h) huellas.set(f.note_id, h)
    })
  }
}

/** Las notas que más se parecen a un texto (por significado), en este dispositivo. */
export async function parecidas(texto: string, excluir: string[], k: number): Promise<{ id: string; score: number }[]> {
  const [[q]] = await Promise.all([vectores([texto.slice(0, 6000)]), cargar()])
  if (!q?.length || !huellas.size) return []
  let nq = 0
  for (const x of q) nq += x * x
  nq = Math.sqrt(nq) || 1
  const fuera = new Set(excluir)
  const out: { id: string; score: number }[] = []
  for (const [id, h] of huellas) {
    if (fuera.has(id) || h.v.length !== q.length) continue
    let dot = 0
    for (let i = 0; i < q.length; i++) dot += q[i] * h.v[i]
    const score = dot / (nq * h.norma)
    // por debajo de ~0,55 casi siempre es ruido de palabras
    if (score >= 0.55) out.push({ id, score })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k)
}

/** Al cerrar sesión: nada de esto queda en memoria. */
export function olvidarHuellas() {
  huellas.clear()
  carga = null
}

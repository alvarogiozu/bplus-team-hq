import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { asScene, edgePoint, sceneBounds, type BItem, type Box, type Scene } from './board'
import { CIcon } from './icons'
import { inkSvg } from './ink'

// Una pizarra infinita dentro de una página: se ve entera (encuadrada) y se abre con un toque
// para seguir dibujando. Vive fuera del árbol de React de la app (dentro del editor), así que
// no usa el router ni la caché: pide lo suyo y avisa con eventos.

const H_OF: Record<BItem['t'], number> = { note: 110, page: 120, text: 44 }
const heightOf = (it: BItem) => (it.t === 'text' ? H_OF.text * it.size * 0.75 : H_OF[it.t])
const PAPER: Record<string, [string, string]> = {
  amber: ['var(--amber-soft)', 'var(--amber-edge)'],
  green: ['var(--green-soft)', 'var(--green-edge)'],
  accent: ['var(--accent-soft)', 'var(--accent-edge)'],
  berry: ['var(--berry-soft)', 'var(--berry-edge)'],
  coral: ['var(--title-soft)', 'var(--coral-edge)'],
}
const INK: Record<string, string> = {
  ink: 'var(--ink)',
  coral: 'var(--cu-tx-coral)',
  amber: 'var(--cu-tx-amber)',
  green: 'var(--cu-tx-green)',
  accent: 'var(--cu-tx-accent)',
  berry: 'var(--cu-tx-berry)',
}

/** El texto en renglones de hasta `per` letras, cortando entre palabras (como se ve en la pizarra). */
const lines = (s: string, per: number, max: number) => {
  const out: string[] = []
  for (const raw of s.split(/\n/)) {
    let line = ''
    for (const word of raw.trim().split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (next.length <= per || !line) line = next.length > per ? next.slice(0, per) : next
      else {
        out.push(line)
        line = word.slice(0, per)
      }
      if (out.length >= max) return out
    }
    if (line) out.push(line)
    if (out.length >= max) return out.slice(0, max)
  }
  return out
}

export function BoardEmbed({ id, title, onOpen, onRemove }: { id: string; title: string; onOpen: (id: string) => void; onRemove: () => void }) {
  const [scene, setScene] = useState<Scene | null>(null)
  const [name, setName] = useState(title)
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')

  const load = useCallback(async () => {
    const [b, n] = await Promise.all([
      supabase.from('cuaderno_boards').select('scene').eq('note_id', id).maybeSingle(),
      supabase.from('cuaderno_notes').select('title').eq('id', id).maybeSingle(),
    ])
    if (!n.data) {
      setState(n.error ? 'ok' : 'missing')
      return
    }
    const sc = asScene(b.data?.scene ?? {})
    setName(n.data.title)
    setScene(sc)
    setState('ok')
    const pageIds = sc.items.flatMap((it) => (it.t === 'page' ? [it.noteId] : []))
    if (pageIds.length) {
      const { data } = await supabase.from('cuaderno_notes').select('id, title').in('id', pageIds.slice(0, 50))
      setTitles(new Map((data ?? []).map((x) => [x.id, x.title])))
    }
  }, [id])

  // al volver de dibujar (la pestaña recupera el foco o la pizarra avisa), se ve lo nuevo
  useEffect(() => {
    void load()
    const on = () => void load()
    addEventListener('focus', on)
    addEventListener('cu:board-saved', on)
    return () => {
      removeEventListener('focus', on)
      removeEventListener('cu:board-saved', on)
    }
  }, [load])

  const bounds = useMemo(() => (scene ? sceneBounds(scene, heightOf) : null), [scene])
  const box = (it: BItem): Box => ({ x: it.x, y: it.y, w: it.w, h: heightOf(it) })
  const pad = 40
  const vb = bounds ? `${bounds.x - pad} ${bounds.y - pad} ${Math.max(200, bounds.w + pad * 2)} ${Math.max(140, bounds.h + pad * 2)}` : ''
  const count = scene ? scene.items.length + scene.strokes.length : 0

  if (state === 'missing')
    return (
      <div className="cu-bembed missing" contentEditable={false}>
        <CIcon name="board" size={18} /> Esta pizarra ya no existe.
        <button type="button" className="cu-linkbtn" onClick={onRemove}>
          Quitarla de la página
        </button>
      </div>
    )

  return (
    <div className="cu-bembed" contentEditable={false}>
      <div className="cu-bembed-head">
        <CIcon name="board" size={17} />
        <b>{name}</b>
        <small>{state === 'loading' ? 'Abriendo…' : count ? `${count} ${count === 1 ? 'cosa' : 'cosas'}` : 'vacía'}</small>
        <span className="spacer" />
        <button type="button" className="cu-bembed-x" onClick={onRemove} aria-label="Quitar la pizarra de esta página (la pizarra no se borra)" title="Quitar de la página (la pizarra sigue en tu carpeta)">
          <CIcon name="close" size={15} />
        </button>
        <button type="button" className="btn sm" onClick={() => onOpen(id)}>
          <CIcon name="pen" size={15} /> {count ? 'Abrir y dibujar' : 'Dibujar'}
        </button>
      </div>
      <button type="button" className="cu-bembed-view" onClick={() => onOpen(id)} aria-label={`Abrir la pizarra ${name}`}>
        {scene && bounds ? (
          <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <marker id={`ar-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="var(--ink-soft)" />
              </marker>
            </defs>
            {scene.strokes.map((st) => (
              <path key={st.id} d={inkSvg(st, Boolean(st.m))} fill={INK[st.c] ?? INK.ink} opacity={st.m ? 0.35 : 1} />
            ))}
            {scene.links.map((l) => {
              const a = scene.items.find((i) => i.id === l.a)
              const b = scene.items.find((i) => i.id === l.b)
              if (!a || !b) return null
              const A = box(a)
              const B = box(b)
              const p = edgePoint(A, B.x + B.w / 2, B.y + B.h / 2)
              const q = edgePoint(B, A.x + A.w / 2, A.y + A.h / 2)
              return <line key={l.id} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--ink-soft)" strokeWidth={3} markerEnd={`url(#ar-${id})`} />
            })}
            {scene.items.map((it) => {
              const h = heightOf(it)
              if (it.t === 'note') {
                const [bg, edge] = PAPER[it.c] ?? PAPER.amber
                return (
                  <g key={it.id}>
                    <rect x={it.x} y={it.y + 4} width={it.w} height={h} rx={12} fill={edge} />
                    <rect x={it.x} y={it.y} width={it.w} height={h} rx={12} fill={bg} />
                    <text x={it.x + 14} y={it.y + 30} className="cu-bembed-t">
                      {lines(it.text, Math.floor(it.w / 9.5), 4).map((ln, i) => (
                        <tspan key={i} x={it.x + 14} dy={i ? 22 : 0}>
                          {ln}
                        </tspan>
                      ))}
                    </text>
                  </g>
                )
              }
              if (it.t === 'text')
                return (
                  <text key={it.id} x={it.x} y={it.y + 18 * it.size} className={`cu-bembed-tx s-${it.size}`}>
                    {lines(it.text, Math.floor(it.w / (8 * it.size)), 3).map((ln, i) => (
                      <tspan key={i} x={it.x} dy={i ? 24 * it.size : 0}>
                        {ln}
                      </tspan>
                    ))}
                  </text>
                )
              return (
                <g key={it.id}>
                  <rect x={it.x} y={it.y + 4} width={it.w} height={h} rx={12} fill="var(--card-edge)" />
                  <rect x={it.x} y={it.y} width={it.w} height={h} rx={12} fill="var(--card)" stroke="var(--card-line)" strokeWidth={2} />
                  <rect x={it.x + 10} y={it.y + 12} width={8} height={h - 24} rx={4} fill="var(--accent)" />
                  <text x={it.x + 30} y={it.y + 40} className="cu-bembed-t b">
                    {(titles.get(it.noteId) ?? 'Página').slice(0, Math.floor((it.w - 40) / 10))}
                  </text>
                </g>
              )
            })}
          </svg>
        ) : (
          <span className="cu-bembed-empty">
            <CIcon name="board" size={28} />
            {state === 'loading' ? 'Abriendo la pizarra…' : 'Pizarra en blanco: toca para dibujar, poner notas y unirlas con flechas'}
          </span>
        )}
      </button>
    </div>
  )
}

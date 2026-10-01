import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { supabase } from '../lib/supabase'
import { haptic } from '../lib/fx'
import { INKS, asScene, clamp, edgePoint, newId, sceneBounds, type BItem, type Box, type Scene } from './board'
import { imageName, imageSize, resolveSrc, shrinkImage, srcOf, upload } from './files'
import { CIcon } from './icons'
import { inkSvg } from './ink'

// Una pizarra infinita dentro de una página: se ve entera (encuadrada) y se abre con un toque
// para seguir dibujando. Vive fuera del árbol de React de la app (dentro del editor), así que
// no usa el router ni la caché: pide lo suyo y avisa con eventos.
// Se pinta en el mismo orden que la pizarra: flechas, luego notas e imágenes, y la tinta encima.
// Desde aquí también se le ponen imágenes (botón o soltar archivos) sin abrirla: quedan en fila a la derecha.

const H_OF: Record<Exclude<BItem['t'], 'image'>, number> = { note: 110, page: 120, text: 44 }
const heightOf = (it: BItem) => (it.t === 'image' ? it.w * it.ar : it.t === 'text' ? H_OF.text * it.size * 0.75 : H_OF[it.t])
const PAPER: Record<string, [string, string]> = {
  amber: ['var(--amber-soft)', 'var(--amber-edge)'],
  green: ['var(--green-soft)', 'var(--green-edge)'],
  accent: ['var(--accent-soft)', 'var(--accent-edge)'],
  berry: ['var(--berry-soft)', 'var(--berry-edge)'],
  coral: ['var(--title-soft)', 'var(--coral-edge)'],
}
const INK = Object.fromEntries(INKS.map((i) => [i.id, `var(${i.cssVar})`])) as Record<string, string>
/** Lo escrito sobre una imagen va con la tinta de papel claro (igual que en la pizarra). */
const PAPER_INK = Object.fromEntries(INKS.map((i) => [i.id, `var(${i.paperVar})`])) as Record<string, string>

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
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [adding, setAdding] = useState(0)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
    // las imágenes son privadas: cada una con su enlace firmado (se reusa mientras no vence)
    const srcs = [...new Set(sc.items.flatMap((it) => (it.t === 'image' ? [it.src] : [])))]
    if (srcs.length) void Promise.all(srcs.slice(0, 60).map(async (s) => [s, await resolveSrc(s)] as const)).then((pairs) => setUrls(new Map(pairs.filter((p) => p[1]))))
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

  /** Sube las imágenes y las pone en fila a la derecha de lo que ya hay (sin abrir la pizarra). */
  const addImages = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, 12)
    if (!imgs.length || adding) return
    const uid = (await supabase.auth.getSession()).data.session?.user.id
    if (!uid) return
    setAdding(imgs.length)
    const added: BItem[] = []
    for (const f of imgs) {
      const dim = await imageSize(f)
      const ar = dim ? clamp(dim.h / Math.max(1, dim.w), 0.05, 20) : 0.75
      const { blob, ext } = await shrinkImage(f)
      const path = await upload(uid, blob, ext)
      if (path) added.push({ id: newId(), t: 'image', x: 0, y: 0, w: 360, ar: Math.round(ar * 1e4) / 1e4, src: srcOf(path), name: imageName(f.name) })
      setAdding((n) => Math.max(0, n - 1))
    }
    if (added.length) {
      // lo más nuevo de la pizarra (pudo cambiar en otra pestaña) y la fila a su derecha
      const { data } = await supabase.from('cuaderno_boards').select('scene').eq('note_id', id).maybeSingle()
      const sc = asScene(data?.scene ?? {})
      const b = sceneBounds(sc, heightOf)
      let x = b ? b.x + b.w + 48 : 0
      const y = b ? b.y : 0
      for (const it of added) {
        it.x = Math.round(x)
        it.y = Math.round(y)
        x += it.w + 32
      }
      const { error } = await supabase.from('cuaderno_boards').upsert({ note_id: id, scene: { ...sc, items: [...sc.items, ...added] } }, { onConflict: 'note_id' })
      if (!error) haptic(8)
      await load()
    }
    setAdding(0)
  }
  const dragHasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files')

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
    <div
      className={`cu-bembed${over ? ' over' : ''}`}
      contentEditable={false}
      onDragOver={(e) => {
        if (!dragHasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        setOver(false)
        if (!dragHasFiles(e)) return
        e.preventDefault()
        void addImages([...e.dataTransfer.files])
      }}
    >
      <div className="cu-bembed-head">
        <CIcon name="board" size={17} />
        <b>{name}</b>
        <small>{adding ? `Subiendo ${adding} ${adding === 1 ? 'imagen' : 'imágenes'}…` : state === 'loading' ? 'Abriendo…' : count ? `${count} ${count === 1 ? 'cosa' : 'cosas'}` : 'vacía'}</small>
        <span className="spacer" />
        <button type="button" className="cu-bembed-x img" onClick={() => fileRef.current?.click()} disabled={Boolean(adding)} aria-label="Poner imágenes en la pizarra" title="Poner imágenes (también puedes soltarlas aquí)">
          <CIcon name="image" size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void addImages(files)
          }}
        />
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
              if (it.t === 'image') {
                const u = urls.get(it.src)
                return (
                  <g key={it.id}>
                    <rect x={it.x} y={it.y} width={it.w} height={h} rx={6} fill="var(--card)" stroke="var(--card-line)" strokeWidth={2} />
                    {u && <image href={u} x={it.x} y={it.y} width={it.w} height={h} preserveAspectRatio="xMidYMid slice" />}
                  </g>
                )
              }
              if (it.t === 'text')
                return (
                  <text key={it.id} x={it.x} y={it.y + 18 * it.size} className={`cu-bembed-tx s-${it.size}`} style={it.c || it.b ? { fill: (it.b ? PAPER_INK : INK)[it.c ?? 'ink'] } : undefined}>
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
            {scene.strokes.map((st) => (
              <path key={st.id} d={inkSvg(st, Boolean(st.m))} fill={(st.b ? PAPER_INK : INK)[st.c] ?? INK.ink} opacity={st.m ? 0.35 : 1} />
            ))}
          </svg>
        ) : (
          <span className="cu-bembed-empty">
            <CIcon name="board" size={28} />
            {state === 'loading' ? 'Abriendo la pizarra…' : 'Pizarra en blanco: toca para pegar imágenes, dibujar, escribir y unir con flechas'}
          </span>
        )}
      </button>
    </div>
  )
}

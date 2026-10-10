import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Empty } from '../../components/States'
import { toast } from '../../components/Toasts'
import type { Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useTaskActions, type TaskPatch } from '../tasks/actions'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { BloqueadaPill, useBloqueo, useDeps } from '../tasks/dependencias'
import { aHora, filasDe, PASO_MIN, planDeHoy, type Bloque } from '../tasks/horario'
import './hoy.css'

// «Hoy» en Tareas: el día del equipo de izquierda a derecha. Un carril por persona (tú primero), las horas arriba
// y la línea de ahora. Cada tarea es un bloque de su hora y su duración; lo que no tiene hora se acomoda solo, en
// orden de dependencias, desde ahora (punteado = sugerido). Las flechas van hacia la derecha, también de una
// persona a otra. Lo que pasa a la vez se ve a la par (en filas). Arrastra para fijar la hora, estira el borde
// derecho para la duración, toca para abrir. Con el teclado: ← → mueven 15 min, Mayús + ← → cambian la duración.

const PPM = 2 // pixeles por minuto (120 por hora)
const FILA = 46
const NOMBRE = 176

const ahoraEnMin = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function HoyView({ tasks }: { tasks: Task[] }) {
  const { userId } = useAuth()
  const { today, memberById, areaById, projectById } = useLookup()
  const deps = useDeps().data
  const bloqueo = useBloqueo()
  const { update } = useTaskActions()
  const [, setParams] = useSearchParams()
  const [ahora, setAhora] = useState(ahoraEnMin)
  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraEnMin()), 60_000)
    return () => clearInterval(t)
  }, [])

  const bloques = useMemo(() => planDeHoy(tasks, deps ?? [], today, ahora), [tasks, deps, today, ahora])
  // el rango: de 7 a 21 como mínimo, y lo que haga falta para que todo entre
  const desde = Math.min(7 * 60, ...bloques.map((b) => Math.floor(b.inicio / 60) * 60))
  const hasta = Math.max(21 * 60, ...bloques.map((b) => Math.ceil(b.fin / 60) * 60))
  const ancho = (hasta - desde) * PPM
  const x = (min: number) => (min - desde) * PPM

  // carriles: tú primero, luego por nombre; «Sin responsable» al final
  const carriles = useMemo(() => {
    const por = new Map<string, Bloque[]>()
    for (const b of bloques) por.set(b.carril, [...(por.get(b.carril) ?? []), b])
    const orden = [...por.keys()].sort((a, b) =>
      a === userId ? -1 : b === userId ? 1 : a === 'nadie' ? 1 : b === 'nadie' ? -1 : (memberById.get(a)?.profile.display_name ?? '').localeCompare(memberById.get(b)?.profile.display_name ?? ''),
    )
    let y = 0
    return orden.map((c) => {
      const { fila, filas } = filasDe(por.get(c)!)
      const lane = { id: c, bloques: por.get(c)!, fila, alto: filas * FILA + 12, y }
      y += lane.alto
      return lane
    })
  }, [bloques, userId, memberById])
  const altoTotal = carriles.reduce((s, c) => s + c.alto, 0)
  const pos = useMemo(() => {
    const m = new Map<string, { y: number; b: Bloque }>()
    // el centro del bloque (alto FILA - 8)
    for (const c of carriles) for (const b of c.bloques) m.set(b.task.id, { y: c.y + 6 + (c.fila.get(b.task.id) ?? 0) * FILA + (FILA - 8) / 2, b })
    return m
  }, [carriles])

  // al entrar: la línea de ahora a un cuarto del ancho
  const scroller = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, x(ahora) - (el.clientWidth - NOMBRE) * 0.25)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (id: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.set('tarea', id)
      return n
    })

  async function fijar(b: Bloque, inicio: number, minutos: number) {
    const antes = { start_time: (b.task as Task & { start_time?: string | null }).start_time ?? null, estimate_min: (b.task as Task & { estimate_min?: number | null }).estimate_min ?? null, due_date: b.task.due_date }
    const patch = { start_time: aHora(inicio), estimate_min: minutos, ...(b.task.due_date ? {} : { due_date: today }) } as unknown as TaskPatch
    const r = await update(b.task.id, patch)
    if (r) toast(<>«{b.task.title}»: {aHora(inicio)}–{aHora(inicio + minutos)}</>, { action: { label: 'Deshacer', onClick: () => void update(b.task.id, antes as unknown as TaskPatch) } })
  }

  if (!bloques.length) {
    return (
      <Empty title="Nada para hoy con estos filtros">
        <p className="hint">Las tareas que vencen hoy, las atrasadas y las que están en curso aparecen aquí, por persona y por hora.</p>
      </Empty>
    )
  }

  return (
    <div className="hoyv" style={{ ['--nw' as string]: `${NOMBRE}px` } as CSSProperties}>
      <div className="hoyv-scroll card" ref={scroller}>
        <div className="hoyv-inner" style={{ width: NOMBRE + ancho }}>
          <div className="hoyv-head">
            <div className="hoyv-corner">{bloques.filter((b) => b.task.status !== 'done').length} para hoy</div>
            <div className="hoyv-horas" style={{ width: ancho }}>
              {Array.from({ length: (hasta - desde) / 60 + 1 }, (_, i) => desde + i * 60).map((m) => (
                <span key={m} style={{ left: x(m) }}>
                  {aHora(m)}
                </span>
              ))}
              {/* la hora de ahora va arriba, con las horas (en el cuerpo tapaba el primer bloque) */}
              {ahora >= desde && ahora <= hasta && (
                <b className="hoyv-ahora-hora" style={{ left: x(ahora) }}>
                  {aHora(ahora)}
                </b>
              )}
            </div>
          </div>
          <div className="hoyv-body" style={{ height: altoTotal }}>
            <div className="hoyv-grid" style={{ left: NOMBRE, width: ancho, ['--h' as string]: `${60 * PPM}px` } as CSSProperties} aria-hidden="true" />
            {ahora >= desde && ahora <= hasta && (
              <div className="hoyv-ahora" style={{ left: NOMBRE + x(ahora) }} aria-hidden="true">
                <i />
              </div>
            )}
            <Flechas deps={deps ?? []} pos={pos} x={x} left={NOMBRE} ancho={ancho} alto={altoTotal} />
            {carriles.map((c) => {
              const m = c.id === 'nadie' ? undefined : memberById.get(c.id)
              return (
                <section key={c.id} className="hoyv-carril" style={{ top: c.y, height: c.alto }} aria-label={m?.profile.display_name ?? 'Sin responsable'}>
                  <div className="hoyv-nombre">
                    <MemberAvatar member={m} size={26} />
                    <b>{c.id === userId ? 'Tú' : (m?.profile.display_name ?? 'Sin responsable')}</b>
                    <small>{c.bloques.filter((b) => b.task.status !== 'done').length}</small>
                  </div>
                  {c.bloques.map((b) => (
                    <BloqueTarea
                      key={b.task.id}
                      b={b}
                      top={6 + (c.fila.get(b.task.id) ?? 0) * FILA}
                      x={x}
                      color={areaById.get(b.task.area_id ?? '')?.color ?? projectById.get(b.task.project_id ?? '')?.color ?? 'var(--accent)'}
                      bloqueada={bloqueo.bloqueada(b.task)}
                      atrasada={b.task.status !== 'done' && b.fin < ahora}
                      abrir={() => abrir(b.task.id)}
                      fijar={(i, mins) => void fijar(b, i, mins)}
                    />
                  ))}
                </section>
              )
            })}
          </div>
        </div>
      </div>
      <p className="hint hoyv-ayuda hide-mobile">
        Punteado = hora sugerida (en orden de lo que se espera). Arrastra un bloque para fijar su hora, estira su borde derecho para la duración, tócalo para abrirlo.
      </p>
    </div>
  )
}

type Arrastre = { modo: 'mover' | 'fin'; x0: number; delta: number; movido: boolean }

function BloqueTarea(p: {
  b: Bloque
  top: number
  x: (min: number) => number
  color: string
  bloqueada: boolean
  atrasada: boolean
  abrir: () => void
  fijar: (inicio: number, minutos: number) => void
}) {
  const { b } = p
  const [a, setA] = useState<Arrastre | null>(null)
  const minutos = b.fin - b.inicio
  const pasos = a ? Math.round(a.delta / (PASO_MIN * PPM)) * PASO_MIN : 0
  const inicio = a?.modo === 'mover' ? b.inicio + pasos : b.inicio
  const dur = a?.modo === 'fin' ? Math.max(PASO_MIN, minutos + pasos) : minutos
  const hecha = b.task.status === 'done'

  const down = (modo: Arrastre['modo']) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setA({ modo, x0: e.clientX, delta: 0, movido: false })
  }
  const move = (e: PointerEvent<HTMLElement>) => {
    if (!a) return
    const d = e.clientX - a.x0
    setA({ ...a, delta: d, movido: a.movido || Math.abs(d) > 4 })
  }
  const up = () => {
    if (!a) return
    const fue = a
    setA(null)
    if (!fue.movido) return fue.modo === 'mover' && p.abrir()
    if (inicio !== b.inicio || dur !== minutos || !b.fija) p.fijar(Math.max(0, Math.min(24 * 60 - dur, inicio)), dur)
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter') return p.abrir()
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const d = e.key === 'ArrowLeft' ? -PASO_MIN : PASO_MIN
    if (e.shiftKey) p.fijar(b.inicio, Math.max(PASO_MIN, minutos + d))
    else p.fijar(Math.max(0, b.inicio + d), minutos)
  }
  const etiqueta = `${b.task.title}: ${aHora(inicio)} a ${aHora(inicio + dur)}${b.fija ? '' : ' (sugerida)'}`
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={etiqueta}
      title={etiqueta}
      className={`hoyv-b${b.fija ? '' : ' sugerida'}${hecha ? ' hecha' : ''}${p.bloqueada ? ' bloq' : ''}${p.atrasada ? ' tarde' : ''}${a?.movido ? ' arrastrando' : ''}`}
      style={{ left: NOMBRE + p.x(inicio), width: Math.max(30, dur * PPM - 4), top: p.top, ['--bc' as string]: p.color } as CSSProperties}
      onPointerDown={down('mover')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setA(null)}
      onKeyDown={key}
    >
      <span className="hoyv-bt">
        <b>{b.task.title}</b>
        <small>
          {aHora(inicio)}–{aHora(inicio + dur)}
        </small>
      </span>
      <BloqueadaPill task={b.task} corta />
      {!hecha && <span className="hoyv-fin" onPointerDown={down('fin')} aria-hidden="true" />}
      {a?.movido && <span className="hoyv-tip">{aHora(inicio)}–{aHora(inicio + dur)}</span>}
    </div>
  )
}

/** Las flechas de «espera a»: del final de un bloque al inicio del que sigue, también de un carril a otro. */
function Flechas({ deps, pos, x, left, ancho, alto }: { deps: { task_id: string; depende_de: string }[]; pos: Map<string, { y: number; b: Bloque }>; x: (m: number) => number; left: number; ancho: number; alto: number }) {
  const paths = deps
    .map((d) => {
      const a = pos.get(d.depende_de)
      const s = pos.get(d.task_id)
      if (!a || !s || s.b.task.status === 'done') return null
      const x1 = x(a.b.fin) - 4
      const x2 = x(s.b.inicio)
      const G = 8
      const choca = x2 < x1
      const dd =
        x2 - x1 >= G * 2
          ? `M${x1} ${a.y} H${x1 + G} V${s.y} H${x2 - 2}`
          : `M${x1} ${a.y} H${x1 + G} V${s.y + (s.y > a.y ? -FILA / 2 : FILA / 2)} H${x2 - G} V${s.y} H${x2 - 2}`
      return { k: `${d.task_id}-${d.depende_de}`, dd, choca }
    })
    .filter((p): p is { k: string; dd: string; choca: boolean } => Boolean(p))
  if (!paths.length) return null
  return (
    <svg className="hoyv-flechas" style={{ left, width: ancho, height: alto }} aria-hidden="true">
      <defs>
        {(['', 'choca'] as const).map((c) => (
          <marker key={c} id={`hv-punta${c && '-choca'}`} className={c} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <path key={p.k} d={p.dd} className={p.choca ? 'choca' : ''} markerEnd={`url(#hv-punta${p.choca ? '-choca' : ''})`} />
      ))}
    </svg>
  )
}


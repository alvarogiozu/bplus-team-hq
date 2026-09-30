import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { useMe } from '../features/auth/AuthProvider'
import { lsGet, lsSet } from '../lib/storage'
import { useNotes } from './data'
import { ItemIcon } from './icons'
import { DivisionCtx, LateralCtx, TIPO_NOTA, useDivision, type Division, type Lado } from './ui'
import './dividido.css'

// Pantalla dividida del Cuaderno, como Obsidian y como el escritorio de Rockie OS: arrastras una
// pestaña a la mitad derecha (o Ctrl + clic, o el botón de la pestaña) y la nota se abre al lado.
// La barra del medio se arrastra para repartir el ancho (doble clic = mitad y mitad). Se recuerda.
const NotaLateral = lazy(() => import('./Nota').then((m) => ({ default: m.NotaDe })))

export function useDivisionEstado(mobile: boolean): Division {
  const { userId } = useMe()
  const kLado = `cu.lado.${userId}`
  const kRatio = `cu.ratio.${userId}`
  const notes = useNotes().data
  const [lado, setLado] = useState<string | null>(() => lsGet(kLado) || null)
  const [ratio, setRatioS] = useState(() => {
    const v = Number(lsGet(kRatio))
    return v >= 0.25 && v <= 0.75 ? v : 0.5
  })
  const [foco, setFoco] = useState<Lado>('izq')

  useEffect(() => lsSet(kLado, lado ?? ''), [lado, kLado])
  // una nota borrada se lleva su lado
  useEffect(() => {
    if (lado && notes && !notes.some((n) => n.id === lado)) setLado(null)
  }, [notes, lado])

  const setRatio = useCallback(
    (r: number) => {
      const v = Math.round(Math.min(0.75, Math.max(0.25, r)) * 1000) / 1000
      setRatioS(v)
      lsSet(kRatio, String(v))
    },
    [kRatio],
  )
  return useMemo(
    () => ({
      lado: mobile ? null : lado,
      foco,
      ratio,
      setFoco,
      setRatio,
      abrirAlLado: (id: string) => {
        setLado(id)
        setFoco('der')
      },
      cerrarLado: () => {
        setLado(null)
        setFoco('izq')
      },
    }),
    [mobile, lado, foco, ratio, setRatio],
  )
}

export function DivisionProvider({ value, children }: { value: Division; children: ReactNode }) {
  return <DivisionCtx.Provider value={value}>{children}</DivisionCtx.Provider>
}

/** El área de contenido: la ruta a la izquierda y, si hay, la nota abierta al lado. */
export function AreaDividida({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { lado, foco, ratio, setFoco, setRatio, abrirAlLado, cerrarLado } = useDivision()
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const loc = useLocation()
  const [soltar, setSoltar] = useState<Lado | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const actual = /^\/cuaderno\/nota\/([^/?#]+)/.exec(loc.pathname)?.[1] ?? null

  // arrastrar una pestaña: la mitad donde la sueltas decide dónde se abre
  const sobre = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(TIPO_NOTA)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = box.current!.getBoundingClientRect()
    setSoltar(e.clientX > r.left + r.width / 2 ? 'der' : 'izq')
  }
  const suelta = (e: DragEvent) => {
    const id = e.dataTransfer.getData(TIPO_NOTA)
    const donde = soltar
    setSoltar(null)
    if (!id || !donde) return
    e.preventDefault()
    if (donde === 'der') abrirAlLado(id)
    else {
      setFoco('izq')
      nav(`/cuaderno/nota/${id}`)
    }
  }

  // la barra del medio reparte el ancho
  const divide = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setMoviendo(true)
    const r = box.current!.getBoundingClientRect()
    const mover = (ev: globalThis.PointerEvent) => setRatio((ev.clientX - r.left) / r.width)
    const fin = () => {
      setMoviendo(false)
      el.removeEventListener('pointermove', mover)
      el.removeEventListener('pointerup', fin)
      el.removeEventListener('pointercancel', fin)
    }
    el.addEventListener('pointermove', mover)
    el.addEventListener('pointerup', fin)
    el.addEventListener('pointercancel', fin)
  }

  return (
    <div
      ref={box}
      className={`cu-dv${lado ? ' on' : ''}${moviendo ? ' moviendo' : ''}`}
      style={{ ['--cu-izq' as string]: `${ratio * 100}%` } as CSSProperties}
      onDragOver={sobre}
      onDragLeave={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setSoltar(null)
      }}
      onDrop={suelta}
    >
      <div className={`cu-pane izq${lado && foco === 'izq' ? ' foco' : ''}`} onPointerDownCapture={() => lado && setFoco('izq')}>
        {children}
      </div>
      {lado && (
        <>
          <div
            className="cu-divisor"
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(ratio * 100)}
            aria-label="Repartir el ancho entre las dos notas"
            title="Arrastra para repartir · doble clic: mitad y mitad"
            onPointerDown={divide}
            onDoubleClick={() => setRatio(0.5)}
          />
          <div className={`cu-pane der${foco === 'der' ? ' foco' : ''}`} onPointerDownCapture={() => setFoco('der')}>
            <BarraLateral id={lado} actual={actual} onCerrar={cerrarLado} />
            {lado === actual ? (
              <div className="cu-lado-igual">
                <p>Esta nota ya está abierta a la izquierda.</p>
                <button className="btn ghost sm" onClick={cerrarLado}>
                  Cerrar este lado
                </button>
              </div>
            ) : (
              <LateralCtx.Provider value={true}>
                <Suspense fallback={fallback}>
                  <NotaLateral key={lado} id={lado} />
                </Suspense>
              </LateralCtx.Provider>
            )}
          </div>
        </>
      )}
      {soltar && (
        <div className={`cu-soltar ${soltar}${lado ? ' hay' : ''}`} aria-hidden="true">
          <span>{soltar === 'der' ? 'Abrir al lado' : 'Abrir aquí'}</span>
        </div>
      )}
    </div>
  )
}

/** La cabecera fina de la nota de la derecha: su nombre, intercambiar lados y cerrar. */
function BarraLateral({ id, actual, onCerrar }: { id: string; actual: string | null; onCerrar: () => void }) {
  const note = useNotes().data?.find((n) => n.id === id)
  const { abrirAlLado } = useDivision()
  const nav = useNavigate()
  const titulo = note?.title?.trim() || 'Sin título'
  const intercambiar = () => {
    // la de la izquierda pasa a la derecha y viceversa (si a la izquierda no hay nota, esta pasa a ser la principal)
    nav(`/cuaderno/nota/${id}`)
    if (actual && actual !== id) abrirAlLado(actual)
    else onCerrar()
  }
  return (
    <div className="cu-lado-barra">
      <ItemIcon value={note?.icon} fallback={note?.kind === 'pizarra' ? 'board' : 'note'} size={15} />
      <b title={titulo}>{titulo}</b>
      <button type="button" className="iconbtn flat" onClick={intercambiar} aria-label="Intercambiar lados" title={actual ? 'Intercambiar lados' : 'Abrir en grande'}>
        <IconoDividir cambio />
      </button>
      <button type="button" className="iconbtn flat" onClick={onCerrar} aria-label={`Cerrar ${titulo} de este lado`} title="Cerrar este lado">
        <Icon name="close" className="sm" />
      </button>
    </div>
  )
}

/** Un rectángulo partido en dos (y con flechas si es "intercambiar"). */
export function IconoDividir({ cambio = false, size = 16 }: { cambio?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {cambio ? (
        <>
          <path d="M7 7h11l-3-3" />
          <path d="M17 17H6l3 3" />
        </>
      ) : (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
          <path d="M12 4.5v15" />
        </>
      )}
    </svg>
  )
}

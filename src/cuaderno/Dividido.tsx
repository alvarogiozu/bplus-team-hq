import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { MosaicoPrevia } from '../components/MosaicoPrevia'
import { useMe } from '../features/auth/AuthProvider'
import { lsGet, lsSet } from '../lib/storage'
import { cuenta, destinoEn, idsDe, MAX_COLS, moverHorizontal, moverVertical, poner, quitar, rects, reemplazar, sano, separadores, uno, type Destino, type Mosaico, type Rect } from '../lib/mosaico'
import { useNotes } from './data'
import { ItemIcon } from './icons'
import { DivisionCtx, PanelIdCtx, RUTA, TIPO_NOTA, useDivision, type Division } from './ui'
import './dividido.css'

// Pantalla dividida del Cuaderno como el escritorio de Rockie OS: hasta 6 paneles (3 columnas, cada
// una entera o partida arriba/abajo). Arrastras una pestaña (o la barra de un panel) y la vista previa
// muestra dónde cae: a la izquierda, al medio, a la derecha, arriba o abajo. Si arrastras la nota que
// ya ves, se MUEVE (la principal pasa a otra pestaña) con animación. Los separadores reparten el
// ancho y el alto (doble clic = iguales). Todo se recuerda.
const NotaLateral = lazy(() => import('./Nota').then((m) => ({ default: m.NotaDe })))
const GAP = 8
const MAX_PESTANAS = 24
const GLIDE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
const notaDe = (path: string) => /^\/cuaderno\/nota\/([^/?#]+)/.exec(path)?.[1] ?? null

function leerLista(clave: string): string[] {
  try {
    const v = JSON.parse(lsGet(clave) || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function leerMosaico(userId: string): Mosaico {
  try {
    const m = sano(JSON.parse(lsGet(`cu.mosaico.${userId}`) || 'null'))
    if (idsDe(m).includes(RUTA)) return m
  } catch {
    /* nada guardado */
  }
  // lo de antes: una nota a la derecha y su proporción
  const lado = lsGet(`cu.lado.${userId}`)
  if (lado) {
    const r = Number(lsGet(`cu.ratio.${userId}`))
    const w = r >= 0.25 && r <= 0.75 ? r : 0.5
    return { cols: [{ ids: [RUTA], h: 0.5 }, { ids: [lado], h: 0.5 }], ws: [w, 1 - w] }
  }
  return uno(RUTA)
}

/** Dónde va una nota que abres "al lado" sin elegir: una columna nueva; si ya hay 3, abajo de una. */
function porDefecto(m: Mosaico): Destino {
  if (m.cols.length < MAX_COLS) return { t: 'columna', en: m.cols.length }
  for (let i = m.cols.length - 1; i >= 0; i--) if (m.cols[i].ids.length === 1) return { t: 'partir', col: i, lado: 'abajo' }
  for (let i = m.cols.length - 1; i >= 0; i--) {
    const j = m.cols[i].ids.lastIndexOf(m.cols[i].ids.find((x) => x !== RUTA) ?? '')
    if (j >= 0) return { t: 'cambiar', col: i, fila: j }
  }
  return { t: 'cambiar', col: 0, fila: 0 }
}

export function useDivisionEstado(mobile: boolean): Division {
  const { userId } = useMe()
  const nav = useNavigate()
  const loc = useLocation()
  const actual = notaDe(loc.pathname)
  const notes = useNotes().data
  const [mos, setMosS] = useState<Mosaico>(() => leerMosaico(userId))
  const [foco, setFoco] = useState<string>(RUTA)
  const [pestanas, setPestanas] = useState<string[]>(() => leerLista(`cu.pestanas.${userId}`))
  const [arrastre, setArrastre] = useState<string | null>(null)
  const est = useRef({ mos, foco, pestanas, actual })
  est.current = { mos, foco, pestanas, actual }

  const setMos = useCallback((m: Mosaico) => setMosS(idsDe(m).includes(RUTA) ? m : uno(RUTA)), [])
  useEffect(() => lsSet(`cu.mosaico.${userId}`, JSON.stringify(mos)), [mos, userId])
  useEffect(() => lsSet(`cu.pestanas.${userId}`, JSON.stringify(pestanas)), [pestanas, userId])

  // abrir una nota (en cualquier panel) = su pestaña
  const lados = idsDe(mos).filter((x) => x !== RUTA)
  const ladosClave = lados.join('|')
  useEffect(() => {
    const nuevas = [actual, ...ladosClave.split('|')].filter((x): x is string => Boolean(x))
    setPestanas((l) => {
      const faltan = nuevas.filter((x) => !l.includes(x))
      return faltan.length ? [...l, ...faltan].slice(-MAX_PESTANAS) : l
    })
  }, [actual, ladosClave])
  // la principal abrió una nota que estaba al lado: se "mueve" a la principal (nunca dos veces)
  useEffect(() => {
    if (!actual) return
    setMosS((m) => (idsDe(m).includes(actual) ? quitar(m, actual) : m))
    setFoco((f) => (f === actual ? RUTA : f))
  }, [actual])
  // notas borradas: fuera de los paneles y de las pestañas
  useEffect(() => {
    if (!notes) return
    const hay = new Set(notes.map((n) => n.id))
    setMosS((m) => (idsDe(m).every((x) => x === RUTA || hay.has(x)) ? m : sano(m, (x) => x === RUTA || hay.has(x))))
    setPestanas((l) => (l.every((x) => hay.has(x)) ? l : l.filter((x) => hay.has(x))))
  }, [notes])
  // un foco que ya no está vuelve a la principal
  useEffect(() => {
    if (foco !== RUTA && !idsDe(mos).includes(foco)) setFoco(RUTA)
  }, [mos, foco])

  return useMemo<Division>(() => {
    /** a qué pasa la principal cuando su nota se va a otro panel: otra pestaña que no se vea (o Hoy) */
    const otraParaRuta = (sin: string[]) => {
      const libre = [...est.current.pestanas].reverse().find((x) => !sin.includes(x))
      return libre ? `/cuaderno/nota/${libre}` : '/cuaderno'
    }
    const abrirAlLado = (id: string, d?: Destino) => {
      const { mos: base, actual: a } = est.current
      const sinId = quitar(base, id)
      const dest = d ?? porDefecto(sinId)
      if (dest.t === 'cambiar' && sinId.cols[dest.col]?.ids[dest.fila] === RUTA) {
        // soltarla sobre la principal = abrirla ahí
        if (id === RUTA) return
        setMosS(sinId)
        setFoco(RUTA)
        if (id !== a) nav(`/cuaderno/nota/${id}`)
        return
      }
      const next = poner(base, id, dest)
      if (!idsDe(next).includes(RUTA)) return
      setMosS(next)
      setFoco(id)
      // la nota que ves en la principal se MUEVE: la principal pasa a otra pestaña (o a Hoy)
      if (id === a) nav(otraParaRuta([id, ...idsDe(next)]))
    }
    const abrir = (id: string, nueva = false) => {
      const { mos: base, foco: f, actual: a } = est.current
      if (idsDe(base).includes(id)) return setFoco(id)
      if (id === a) return setFoco(RUTA)
      if (f !== RUTA && idsDe(base).includes(f)) {
        setMosS(reemplazar(base, f, id))
        return setFoco(id)
      }
      setFoco(RUTA)
      // una página recién creada abre con su título listo para escribir
      nav(`/cuaderno/nota/${id}${nueva ? "?nueva=1" : ""}`)
    }
    const cambiarEn = (panel: string, id: string) => {
      const { mos: base, actual: a } = est.current
      if (panel === RUTA) {
        setFoco(RUTA)
        return nav(`/cuaderno/nota/${id}`)
      }
      if (id === a) return setFoco(RUTA)
      if (idsDe(base).includes(id)) return setFoco(id)
      setMosS(reemplazar(base, panel, id))
      setFoco(id)
    }
    const alFrente = (id: string) => {
      const { mos: base, actual: a } = est.current
      setMosS(a ? reemplazar(base, id, a) : quitar(base, id))
      setFoco(RUTA)
      nav(`/cuaderno/nota/${id}`)
    }
    const cerrarPanel = (panel: string) => {
      const { mos: base, foco: f } = est.current
      if (panel === RUTA) {
        // cerrar la principal: la primera de al lado pasa a ser la principal (en su lugar)
        const primera = idsDe(base).find((x) => x !== RUTA)
        if (!primera) return
        setMosS(reemplazar(quitar(base, RUTA), primera, RUTA))
        setFoco(RUTA)
        return nav(`/cuaderno/nota/${primera}`)
      }
      setMosS(quitar(base, panel))
      if (f === panel) setFoco(RUTA)
    }
    const cerrarPestana = (id: string) => {
      const { pestanas: ps, mos: base, actual: a } = est.current
      const i = ps.indexOf(id)
      const resto = ps.filter((x) => x !== id)
      setPestanas(resto)
      if (idsDe(base).includes(id)) return cerrarPanel(id)
      if (id === a) {
        const libres = resto.filter((x) => !idsDe(base).includes(x))
        nav(libres.length ? `/cuaderno/nota/${libres[Math.min(Math.max(0, i - 1), libres.length - 1)]}` : '/cuaderno')
      }
    }
    const ordenar = (id: string, antesDe: string | null) =>
      setPestanas((l) => {
        const sin = l.filter((x) => x !== id)
        const j = antesDe ? sin.indexOf(antesDe) : -1
        sin.splice(j < 0 ? sin.length : j, 0, id)
        return sin.join('|') === l.join('|') ? l : sin
      })
    const cerrarOtras = () => {
      const { mos: base, actual: a } = est.current
      const vis = new Set([a, ...idsDe(base)])
      setPestanas((l) => l.filter((x) => vis.has(x)))
    }
    const m = mobile ? uno(RUTA) : mos
    return {
      mos: m,
      partida: cuenta(m) > 1,
      foco: mobile ? RUTA : foco,
      actual,
      pestanas,
      arrastre,
      setFoco,
      setMos,
      setArrastre,
      abrir,
      abrirAlLado,
      cambiarEn,
      alFrente,
      cerrarPanel,
      cerrarPestana,
      ordenar,
      cerrarOtras,
    }
  }, [mobile, mos, foco, actual, pestanas, arrastre, nav, setMos])
}

export function DivisionProvider({ value, children }: { value: Division; children: ReactNode }) {
  return <DivisionCtx.Provider value={value}>{children}</DivisionCtx.Provider>
}

/** El nombre de lo que muestra la principal (para su barra y para "en lugar de…"). */
function nombreRuta(path: string, titulo: (id: string) => string) {
  const n = notaDe(path)
  if (n) return titulo(n)
  if (path.startsWith('/cuaderno/carpetas') || path.startsWith('/cuaderno/c/')) return 'Carpetas'
  if (path.startsWith('/cuaderno/mapa')) return 'Mapa'
  if (path.startsWith('/cuaderno/repaso')) return 'Repaso'
  if (path.startsWith('/cuaderno/ajustes')) return 'Ajustes'
  return 'Hoy'
}

/** El área de contenido: la principal (la ruta) y las notas abiertas al lado, en mosaico. */
export function AreaDividida({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const div = useDivision()
  const loc = useLocation()
  const notes = useNotes().data
  const box = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState({ w: 0, h: 0 })
  const [zona, setZona] = useState<{ d: Destino; texto: string; mos: Mosaico } | null>(null)
  const [moviendo, setMoviendo] = useState<false | 'x' | 'y'>(false)
  const titulo = useCallback((id: string) => notes?.find((n) => n.id === id)?.title?.trim() || 'Sin título', [notes])
  const nombre = (id: string) => (id === RUTA ? nombreRuta(loc.pathname, titulo) : titulo(id))

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const partida = div.partida && tam.w > 0
  const r = useMemo(() => rects(div.mos, tam.w, tam.h, GAP), [div.mos, tam])

  // ---------- animación: cada panel se desliza a su nuevo lugar; la nota que se mueve viaja desde donde estaba ----------
  const els = useRef(new Map<string, HTMLDivElement>())
  const antes = useRef<{ r: Map<string, Rect>; actual: string | null }>({ r: new Map(), actual: null })
  useLayoutEffect(() => {
    const prev = antes.current
    const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (partida && !moviendo && !reducir && prev.r.size) {
      for (const [pid, rc] of r) {
        const el = els.current.get(pid)
        if (!el) continue
        const p = prev.r.get(pid) ?? (pid === prev.actual ? prev.r.get(RUTA) : undefined)
        if (p) {
          if (p.x !== rc.x || p.y !== rc.y || p.w !== rc.w || p.h !== rc.h)
            el.animate([{ transform: `translate(${p.x - rc.x}px, ${p.y - rc.y}px) scale(${p.w / rc.w}, ${p.h / rc.h})` }, { transform: 'none' }], { duration: 340, easing: GLIDE })
        } else el.animate([{ transform: 'scale(0.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: SPRING })
      }
    }
    antes.current = { r: partida ? r : new Map(), actual: div.actual }
  }, [r, partida, moviendo, div.actual])

  // ---------- arrastrar una pestaña o la barra de un panel ----------
  const zonaDe = (e: DragEvent, id: string) => {
    const caja = box.current!.getBoundingClientRect()
    const base = div.mos
    const sinId = quitar(base, id)
    const z = destinoEn(sinId, e.clientX - caja.left, e.clientY - caja.top, caja.width, caja.height, GAP, nombre)
    const enRuta = z.d.t === 'cambiar' && sinId.cols[z.d.col]?.ids[z.d.fila] === RUTA
    return { d: z.d, texto: enRuta ? 'Abrir aquí' : z.texto, mos: enRuta ? reemplazar(sinId, RUTA, id) : poner(base, id, z.d) }
  }
  const sobre = (e: DragEvent) => {
    const id = div.arrastre
    if (!id || !e.dataTransfer.types.includes(TIPO_NOTA)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const z = zonaDe(e, id)
    setZona((p) => (p && p.texto === z.texto && JSON.stringify(p.d) === JSON.stringify(z.d) ? p : z))
  }
  const suelta = (e: DragEvent) => {
    const id = e.dataTransfer.getData(TIPO_NOTA) || div.arrastre
    setZona(null)
    div.setArrastre(null)
    if (!id) return
    e.preventDefault()
    div.abrirAlLado(id, zonaDe(e, id).d)
  }

  // ---------- separadores ----------
  const seps = partida ? separadores(div.mos, tam.w, tam.h, GAP) : null
  const redim = (e: PointerEvent<HTMLDivElement>, eje: 'x' | 'y', i: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setMoviendo(eje)
    const caja = box.current!.getBoundingClientRect()
    let m = div.mos
    const mover = (ev: globalThis.PointerEvent) => {
      m = eje === 'x' ? moverVertical(m, i, (ev.clientX - caja.left) / caja.width) : moverHorizontal(m, i, (ev.clientY - caja.top) / caja.height)
      div.setMos(m)
    }
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

  const paneles: [string, Rect | null][] = partida ? [...r] : [[RUTA, null]]
  return (
    <div
      ref={box}
      className={`cu-dv${div.partida ? ' on' : ''}${moviendo ? ` moviendo ${moviendo}` : ''}${div.arrastre ? ' arrastrando' : ''}`}
      onDragOver={sobre}
      onDragLeave={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setZona(null)
      }}
      onDrop={suelta}
    >
      {paneles.map(([pid, rc]) => (
        <div
          key={pid}
          ref={(el) => {
            if (el) els.current.set(pid, el)
            else els.current.delete(pid)
          }}
          className={`cu-pane${pid === RUTA ? ' ruta' : ' lado'}${partida && div.foco === pid ? ' foco' : ''}`}
          style={rc ? { left: rc.x, top: rc.y, width: rc.w, height: rc.h } : undefined}
          onPointerDownCapture={() => partida && div.foco !== pid && div.setFoco(pid)}
        >
          <PanelIdCtx.Provider value={pid}>
            {partida && <BarraPanel id={pid} nombre={nombre(pid)} />}
            {pid === RUTA ? (
              children
            ) : (
              <Suspense fallback={fallback}>
                <NotaLateral key={pid} id={pid} />
              </Suspense>
            )}
          </PanelIdCtx.Provider>
        </div>
      ))}
      {seps?.verticales.map((v) => (
        <div
          key={`v${v.i}`}
          className="cu-divisor"
          style={{ left: v.x - 6 }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Repartir el ancho"
          title="Arrastra para repartir el ancho · doble clic: iguales"
          onPointerDown={(e) => redim(e, 'x', v.i)}
          onDoubleClick={() => div.setMos({ ...div.mos, ws: div.mos.ws.map(() => 1 / div.mos.ws.length) })}
        />
      ))}
      {seps?.horizontales.map((h) => (
        <div
          key={`h${h.i}`}
          className="cu-divisor-h"
          style={{ left: h.x, width: h.w, top: h.y - 6 }}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Repartir el alto"
          title="Arrastra para repartir el alto · doble clic: mitad y mitad"
          onPointerDown={(e) => redim(e, 'y', h.i)}
          onDoubleClick={() => div.setMos(moverHorizontal(div.mos, h.i, 0.5))}
        />
      ))}
      {zona && div.arrastre && tam.w > 0 && <MosaicoPrevia mos={zona.mos} id={div.arrastre} texto={zona.texto} nombre={div.arrastre === RUTA ? nombre(RUTA) : titulo(div.arrastre)} W={tam.w} H={tam.h} gap={GAP} color="var(--berry)" />}
    </div>
  )
}

/** La barra fina de cada panel (con la pantalla dividida): se arrastra para moverlo; llevar a la principal y cerrar. */
function BarraPanel({ id, nombre }: { id: string; nombre: string }) {
  const div = useDivision()
  const note = useNotes().data?.find((n) => n.id === (id === RUTA ? div.actual : id))
  const principal = id === RUTA
  return (
    <div
      className={`cu-panel-barra${principal ? ' principal' : ''}`}
      draggable
      title="Arrastra para llevarlo a otro lugar"
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_NOTA, id)
        e.dataTransfer.effectAllowed = 'move'
        div.setArrastre(id)
      }}
      onDragEnd={() => div.setArrastre(null)}
    >
      <span className="cu-panel-asa" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {note ? <ItemIcon value={note.icon} fallback={note.kind === 'pizarra' ? 'board' : 'note'} size={15} /> : <Icon name="notebook" className="sm" />}
      <b title={nombre}>{nombre}</b>
      {principal && <small>principal</small>}
      {!principal && (
        <button type="button" className="iconbtn flat" onClick={() => div.alFrente(id)} aria-label={`Llevar ${nombre} a la principal`} title="Llevar a la principal">
          <IconoDividir cambio />
        </button>
      )}
      <button type="button" className="iconbtn flat" onClick={() => div.cerrarPanel(id)} aria-label={`Cerrar el panel de ${nombre}`} title={principal ? 'Cerrar este panel (la de al lado pasa a ser la principal)' : 'Cerrar este panel'}>
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

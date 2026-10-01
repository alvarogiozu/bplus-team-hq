import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ZonasSoltar } from '../components/ZonasSoltar'
import { useMe } from '../features/auth/AuthProvider'
import { lsGet, lsSet } from '../lib/storage'
import { cuenta, destinoEn, frenoArriba, idsDe, MAX_COLS, moverHorizontal, moverVertical, poner, quitar, rects, reemplazar, sano, separadores, uno, zonasDe, type Destino, type Mosaico, type Rect } from '../lib/mosaico'
import { useNotes } from './data'
import { DivisionCtx, PanelIdCtx, RUTA, TIPO_NOTA, useDivision, type Division } from './ui'
import './dividido.css'

// Pantalla dividida del Cuaderno igual que las apps del escritorio de Rockie OS: hasta 6 paneles (3
// columnas, cada una entera o partida arriba/abajo). Arrastras una pestaña y se ilumina dónde cae: a la
// izquierda, al medio, a la derecha, arriba o abajo. Si arrastras la nota que ya ves, se MUEVE (la
// principal pasa a otra pestaña) con animación. Sin barras extra: las pestañas de arriba son las
// asas; una nota se quita de la pantalla dividida con la × de su pestaña o desde su ⋯. Los separadores
// reparten el ancho y el alto (doble clic = iguales). Todo se recuerda.
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
        // soltarla sobre la principal = abrirla ahí (la que ya se ve ahí, se queda)
        if (id === RUTA) return
        setFoco(RUTA)
        if (id === a) return
        setMosS(sinId)
        nav(`/cuaderno/nota/${id}`)
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

/** El nombre de lo que muestra la principal (para decir "En lugar de …" y nombrar su panel). */
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
  const [moviendo, setMoviendo] = useState<false | 'x' | 'y'>(false)
  /** la franja de arriba con freno (entra desde las pestañas: que no se ilumine "Arriba" solo por pasar) */
  const freno = useRef(frenoArriba())
  const titulo = useCallback((id: string) => notes?.find((n) => n.id === id)?.title?.trim() || 'Sin título', [notes])
  const nombre = useCallback((id: string) => (id === RUTA ? nombreRuta(loc.pathname, titulo) : titulo(id)), [loc.pathname, titulo])

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
  const tamAntes = useRef(tam)
  useLayoutEffect(() => {
    const prev = antes.current
    // si cambió el tamaño del área (ventana, separadores del escritorio) se acomoda al instante
    const otroTam = tamAntes.current.w !== tam.w || tamAntes.current.h !== tam.h
    tamAntes.current = tam
    const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (partida && !moviendo && !reducir && !otroTam && prev.r.size) {
      for (const [pid, rc] of r) {
        const el = els.current.get(pid)
        if (!el) continue
        const p = prev.r.get(pid) ?? (pid === prev.actual ? prev.r.get(RUTA) : undefined)
        if (p) {
          if (p.x !== rc.x || p.y !== rc.y || p.w !== rc.w || p.h !== rc.h)
            el.animate([{ transform: `translate(${p.x - rc.x}px, ${p.y - rc.y}px) scale(${p.w / rc.w}, ${p.h / rc.h})` }, { transform: 'none' }], { duration: 320, easing: GLIDE })
        } else el.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: SPRING })
      }
    }
    // sin dividir, la principal ocupa todo: al partir la pantalla se encoge a su lugar (y la nota que se va, sale de ahí)
    antes.current = { r: partida ? r : new Map([[RUTA, { x: 0, y: 0, w: tam.w, h: tam.h }]]), actual: div.actual }
  }, [r, partida, moviendo, div.actual, tam])

  // ---------- arrastrar una pestaña: las mismas zonas que las apps del escritorio ----------
  // se calculan una sola vez al empezar; al mover solo se ilumina la que toca
  const zonas = useMemo(() => {
    const id = div.arrastre
    if (!id || !tam.w) return []
    // la nota que ya ves en la principal: soltarla ahí mismo es "Aquí" (se queda). Una que ya se ve al
    // lado: el centro de otra es "En lugar de …". Una que no se ve, con la principal sola: "Aquí".
    const aqui = id === div.actual ? RUTA : idsDe(div.mos).includes(id) ? null : undefined
    return zonasDe(quitar(div.mos, id), tam.w, tam.h, GAP, nombre, { aqui })
  }, [div.arrastre, div.actual, div.mos, tam, nombre])
  // cada arrastre empieza de cero
  useEffect(() => {
    freno.current = frenoArriba()
  }, [div.arrastre])
  const destino = (e: DragEvent, id: string) => {
    const caja = box.current!.getBoundingClientRect()
    const arriba = freno.current((e.clientY - caja.top) / caja.height, performance.now())
    return destinoEn(quitar(div.mos, id), e.clientX - caja.left, e.clientY - caja.top, caja.width, caja.height, GAP, nombre, { arriba }).d
  }
  const arrastrada = div.arrastre

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
    >
      {paneles.map(([pid, rc]) => (
        <div
          key={pid}
          ref={(el) => {
            if (el) els.current.set(pid, el)
            else els.current.delete(pid)
          }}
          role={partida ? 'group' : undefined}
          aria-label={partida ? nombre(pid) : undefined}
          className={`cu-pane${pid === RUTA ? ' ruta' : ' lado'}${partida && div.foco === pid ? ' foco' : ''}`}
          style={rc ? { left: rc.x, top: rc.y, width: rc.w, height: rc.h } : undefined}
          onPointerDownCapture={() => partida && div.foco !== pid && div.setFoco(pid)}
        >
          <PanelIdCtx.Provider value={pid}>
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
      {arrastrada && (
        <ZonasSoltar
          zonas={zonas}
          color="var(--berry)"
          destino={(e) => destino(e, arrastrada)}
          alSoltar={(d, e) => {
            const id = e.dataTransfer.getData(TIPO_NOTA) || arrastrada
            div.setArrastre(null)
            div.abrirAlLado(id, d)
          }}
          alCancelar={() => div.setArrastre(null)}
        />
      )}
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

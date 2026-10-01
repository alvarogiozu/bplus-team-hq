import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ZonasSoltar } from '../components/ZonasSoltar'
import { useMe } from '../features/auth/AuthProvider'
import { lsGet, lsSet } from '../lib/storage'
import { cuenta, destinoEn, frenoArriba, idsDe, MAX_COLS, moverHorizontal, moverVertical, poner, quitar, rects, reemplazar, sano, separadores, uno, zonasDe, type Destino, type Mosaico, type Rect } from '../lib/mosaico'
import { useNotes } from './data'
import { DivisionCtx, PanelIdCtx, RUTA, TIPO_NOTA, useDivision, type Division } from './ui'
import { mudarGrupo, panelDeEn, vecina } from './grupos'
import './dividido.css'

// Pantalla dividida del Cuaderno igual que las apps del escritorio de Rockie OS: hasta 6 paneles (3
// columnas, cada una entera o partida arriba/abajo). Como en Obsidian, cada panel tiene SUS pestañas
// arriba (un grupo): arrastras una pestaña y se ilumina dónde cae (izquierda, al medio, derecha, arriba,
// abajo o en el centro de otro panel) y la pestaña se MUDA con su etiqueta a ese panel; su panel de antes
// muestra la vecina o se cierra si quedó vacío. Soltarla en las pestañas de otro panel la suma a ese
// grupo. La × cierra la pestaña (la última cierra el panel). Los separadores reparten el ancho y el alto
// (doble clic = iguales). Todo se recuerda.
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

type Est = { mos: Mosaico; foco: string; pestanas: string[]; actual: string | null; grupo: Record<string, string> }

function leerGrupos(clave: string): Record<string, string> {
  try {
    const v = JSON.parse(lsGet(clave) || '{}') as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch {
    return {}
  }
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
  const [grupo, setGrupo] = useState<Record<string, string>>(() => leerGrupos(`cu.grupos.${userId}`))
  const [arrastre, setArrastre] = useState<string | null>(null)
  // la pestaña recién cerrada: mientras la dirección no cambie, no se vuelve a abrir sola
  const cerrada = useRef<string | null>(null)
  const est = useRef<Est>({ mos, foco, pestanas, actual, grupo })
  est.current = { mos, foco, pestanas, actual, grupo }

  const setMos = useCallback((m: Mosaico) => setMosS(idsDe(m).includes(RUTA) ? m : uno(RUTA)), [])
  useEffect(() => lsSet(`cu.mosaico.${userId}`, JSON.stringify(mos)), [mos, userId])
  useEffect(() => lsSet(`cu.pestanas.${userId}`, JSON.stringify(pestanas)), [pestanas, userId])
  useEffect(() => lsSet(`cu.grupos.${userId}`, JSON.stringify(grupo)), [grupo, userId])

  // abrir una nota (en cualquier panel) = su pestaña
  const lados = idsDe(mos).filter((x) => x !== RUTA)
  const ladosClave = lados.join('|')
  useEffect(() => {
    const nuevas = [actual, ...ladosClave.split('|')].filter((x): x is string => Boolean(x) && x !== cerrada.current)
    setPestanas((l) => {
      const faltan = nuevas.filter((x) => !l.includes(x))
      return faltan.length ? [...l, ...faltan].slice(-MAX_PESTANAS) : l
    })
  }, [actual, ladosClave])
  // la principal abrió una nota: es de su grupo. Si se veía en otro panel, se MUEVE (nunca dos veces):
  // ese panel pasa a su pestaña vecina, o se cierra si era la única
  useEffect(() => {
    if (actual !== cerrada.current) cerrada.current = null
    if (!actual) return
    const s = est.current
    if (idsDe(s.mos).includes(actual)) {
      const sig = vecina(s.pestanas.filter((x) => panelDeEn(x, s) === actual), actual, s.pestanas)
      setMosS((m) => (idsDe(m).includes(actual) ? (sig ? reemplazar(m, actual, sig) : quitar(m, actual)) : m))
      setGrupo((g) => ({ ...(sig ? mudarGrupo(g, actual, sig) : g), [actual]: RUTA }))
    } else setGrupo((g) => (g[actual] === RUTA ? g : { ...g, [actual]: RUTA }))
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
    const tabsEn = (panel: string, s: Est = est.current) => s.pestanas.filter((x) => panelDeEn(x, s) === panel)
    const vistaEn = (panel: string, s: Est = est.current) => (panel === RUTA ? s.actual : panel)
    /** lo que queda cuando la pestaña `id` sale de su panel (sin quitarla de las pestañas) */
    const salir = (id: string, s: Est = est.current) => {
      const p = panelDeEn(id, s)
      let m = s.mos
      let g: Record<string, string> = { ...s.grupo }
      let ir: string | null = null
      let sig: string | null = null
      let rutaVacia = false
      if (vistaEn(p, s) === id) {
        sig = vecina(tabsEn(p, s), id, s.pestanas)
        if (p === RUTA) {
          if (sig) ir = `/cuaderno/nota/${sig}`
          else rutaVacia = true
        } else if (sig) {
          m = reemplazar(m, id, sig)
          g = mudarGrupo(g, id, sig)
        } else m = quitar(m, id)
      }
      delete g[id]
      return { panel: p, mos: m, grupo: g, ir, sig, rutaVacia }
    }
    /** la principal se quedó sin pestañas: el primer panel de al lado toma su lugar (o queda Hoy) */
    const cerrarRuta = (m: Mosaico, g: Record<string, string>) => {
      const primera = idsDe(m).find((x) => x !== RUTA)
      if (!primera) {
        setGrupo(g)
        return nav('/cuaderno')
      }
      setMosS(reemplazar(quitar(m, RUTA), primera, RUTA))
      setGrupo(mudarGrupo(g, primera, RUTA))
      setFoco(RUTA)
      nav(`/cuaderno/nota/${primera}`)
    }
    /** muestra `id` (que no se ve en ningún panel) en ese panel: entra a su grupo */
    const mostrarEn = (panel: string, id: string, nueva = false) => {
      const s = est.current
      if (panel === RUTA || !idsDe(s.mos).includes(panel)) {
        setGrupo((g) => ({ ...g, [id]: RUTA }))
        setFoco(RUTA)
        // una página recién creada abre con su título listo para escribir
        return nav(`/cuaderno/nota/${id}${nueva ? '?nueva=1' : ''}`)
      }
      setMosS(reemplazar(s.mos, panel, id))
      setGrupo((g) => mudarGrupo(g, panel, id))
      setFoco(id)
    }

    const abrirAlLado = (id: string, d?: Destino) => {
      const s = est.current
      const out = salir(id, s)
      const base = out.mos
      const dest = d ?? porDefecto(base)
      const enDestino = dest.t === 'cambiar' ? base.cols[dest.col]?.ids[dest.fila] : undefined
      if (enDestino === RUTA) {
        // soltarla sobre la principal = abrirla ahí (entra a su grupo)
        if (id === s.actual) return setFoco(RUTA)
        setMosS(base)
        setGrupo({ ...out.grupo, [id]: RUTA })
        setFoco(RUTA)
        return nav(`/cuaderno/nota/${id}`)
      }
      let next = poner(base, id, dest)
      if (!idsDe(next).includes(RUTA)) return
      // soltarla en el centro de otro panel la suma a ese grupo: la que se veía ahí queda como pestaña
      let g = enDestino ? mudarGrupo(out.grupo, enDestino, id) : { ...out.grupo, [id]: id }
      if (out.rutaVacia) {
        // movió la única pestaña de la principal: la principal va con ella (como en Obsidian)
        next = reemplazar(quitar(next, RUTA), id, RUTA)
        g = mudarGrupo(g, id, RUTA)
        setMosS(next)
        setGrupo(g)
        return setFoco(RUTA)
      }
      setMosS(next)
      setGrupo(g)
      setFoco(id)
      if (out.ir) nav(out.ir)
    }
    const abrir = (id: string, nueva = false) => {
      const s = est.current
      if (idsDe(s.mos).includes(id)) return setFoco(id)
      if (id === s.actual) return setFoco(RUTA)
      mostrarEn(s.foco, id, nueva)
    }
    const cambiarEn = (panel: string, id: string) => {
      const s = est.current
      if (vistaEn(panel, s) === id) return setFoco(panel)
      if (id === s.actual) return setFoco(RUTA)
      if (idsDe(s.mos).includes(id)) return setFoco(id)
      mostrarEn(panel, id)
    }
    const cerrarPanel = (panel: string) => {
      const s = est.current
      if (panel === RUTA) return cerrarRuta(s.mos, s.grupo)
      // quitarlo de la pantalla dividida: sus pestañas pasan a la principal
      setMosS(quitar(s.mos, panel))
      setGrupo((g) => mudarGrupo(g, panel, RUTA))
      if (s.foco === panel) setFoco(RUTA)
    }
    const cerrarPestana = (id: string) => {
      const s = est.current
      cerrada.current = id
      setPestanas(s.pestanas.filter((x) => x !== id))
      const out = salir(id, s)
      // era la última de su panel: el panel se cierra (la principal, si se queda vacía, cede su lugar)
      if (out.rutaVacia) return cerrarRuta(s.mos, out.grupo)
      setMosS(out.mos)
      setGrupo(out.grupo)
      if (out.panel !== RUTA && s.foco === id) setFoco(out.sig ?? RUTA)
      if (out.ir) nav(out.ir)
    }
    const ordenar = (id: string, antesDe: string | null) =>
      setPestanas((l) => {
        const sin = l.filter((x) => x !== id)
        const j = antesDe ? sin.indexOf(antesDe) : -1
        sin.splice(j < 0 ? sin.length : j, 0, id)
        return sin.join('|') === l.join('|') ? l : sin
      })
    const moverAGrupo = (id: string, panel: string, antesDe: string | null) => {
      const s = est.current
      if (panelDeEn(id, s) === panel) return ordenar(id, antesDe)
      const out = salir(id, s)
      let m = out.mos
      let g = out.grupo
      let destino = panel
      if (out.rutaVacia) {
        // la principal se quedó sin pestañas: el panel que la recibe pasa a ser la principal
        m = reemplazar(quitar(m, RUTA), panel, RUTA)
        g = mudarGrupo(g, panel, RUTA)
        destino = RUTA
      }
      ordenar(id, antesDe)
      if (destino === RUTA) {
        setMosS(m)
        setGrupo({ ...g, [id]: RUTA })
        setFoco(RUTA)
        return nav(`/cuaderno/nota/${id}`)
      }
      setMosS(reemplazar(m, destino, id))
      setGrupo(mudarGrupo(g, destino, id))
      setFoco(id)
      if (out.ir) nav(out.ir)
    }
    const cerrarOtras = (panel?: string) => {
      const s = est.current
      const p = panel ?? (idsDe(s.mos).includes(s.foco) ? s.foco : RUTA)
      const vis = vistaEn(p, s)
      const fuera = new Set(tabsEn(p, s).filter((x) => x !== vis))
      setPestanas((l) => l.filter((x) => !fuera.has(x)))
    }
    const m = mobile ? uno(RUTA) : mos
    const vista: Est = { mos: m, foco, pestanas, actual, grupo }
    return {
      mos: m,
      partida: cuenta(m) > 1,
      foco: mobile ? RUTA : foco,
      actual,
      pestanas,
      panelDe: (id) => panelDeEn(id, vista),
      tabsDe: (panel) => tabsEn(panel, vista),
      baseSin: (id) => salir(id, vista).mos,
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
      moverAGrupo,
      cerrarOtras,
    }
  }, [mobile, mos, foco, actual, pestanas, grupo, arrastre, nav, setMos])
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
export function AreaDividida({ children, fallback, barra }: { children: ReactNode; fallback: ReactNode; barra?: (panel: string) => ReactNode }) {
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
  const baseSin = div.baseSin
  const zonas = useMemo(() => {
    const id = div.arrastre
    if (!id || !tam.w) return []
    // la nota que ya ves en la principal: soltarla ahí mismo es "Aquí" (se queda). Una que ya se ve al
    // lado: el centro de otra es "En lugar de …". Una que no se ve, con la principal sola: "Aquí".
    const aqui = id === div.actual ? RUTA : idsDe(div.mos).includes(id) ? null : undefined
    return zonasDe(baseSin(id), tam.w, tam.h, GAP, nombre, { aqui })
  }, [div.arrastre, div.actual, div.mos, baseSin, tam, nombre])
  // cada arrastre empieza de cero
  useEffect(() => {
    freno.current = frenoArriba()
  }, [div.arrastre])
  const destino = (e: DragEvent, id: string) => {
    const caja = box.current!.getBoundingClientRect()
    const arriba = freno.current((e.clientY - caja.top) / caja.height, performance.now())
    return destinoEn(div.baseSin(id), e.clientX - caja.left, e.clientY - caja.top, caja.width, caja.height, GAP, nombre, { arriba }).d
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
            {/* las pestañas de este panel (su grupo), como en Obsidian */}
            {barra?.(pid)}
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

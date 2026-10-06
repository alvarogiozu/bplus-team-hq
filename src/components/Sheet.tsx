import { useEffect, useId, useLayoutEffect, useRef, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** drawer = panel derecho (en el celular, una página propia que entra desde la derecha);
   *  dialog = centrado (en el celular, una hoja que sube desde abajo) */
  variant?: 'drawer' | 'dialog'
  children: ReactNode
  footer?: ReactNode
  headExtra?: ReactNode
}

// Hojas y paneles de Rockie OS, con el movimiento de un iPhone:
// - en el celular, el diálogo es una hoja que SUBE desde abajo (curva de iOS, sin rebote) y se cierra arrastrando su
//   cabecera hacia abajo; el panel (drawer) es una PÁGINA que entra desde la derecha, con «‹» y deslizando desde el
//   borde izquierdo para volver;
// - al cerrarse SIEMPRE sale animada, aunque quien la abrió la quite de golpe (`{x && <Sheet …/>}`): justo antes de
//   desmontarse se deja una copia inerte en su lugar que hace la salida y se borra sola (lo escrito y el scroll se
//   conservan en la copia);
// - mientras hay una hoja abierta, la página de atrás no se desplaza.

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const celular = () => matchMedia('(max-width: 767px)').matches
let abiertas = 0

export function Sheet(props: Props) {
  if (!props.open) return null
  return <HojaAbierta {...props} />
}

function HojaAbierta({ onClose, title, variant = 'dialog', children, footer, headExtra }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const capa = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  /** ya salió arrastrada (fuera de la pantalla): al desmontarse no hace falta otra salida */
  const yaSalio = useRef(false)
  /** cuándo se abrió: si la abrió un toque, el clic que el navegador manda después cae en su fondo y la cerraba */
  const nacio = useRef(performance.now())

  // foco dentro de la hoja, Tab que no se escapa y Escape para cerrar
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null)
        if (!f.length) return
        const first = f[0]
        const lastEl = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          lastEl.focus()
          e.preventDefault()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          first.focus()
          e.preventDefault()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      const target = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current
      target?.focus({ preventScroll: true })
    }, 50)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      last?.focus?.({ preventScroll: true })
    }
  }, [])

  // la página de atrás queda quieta mientras haya alguna hoja abierta
  useEffect(() => {
    abiertas++
    document.documentElement.classList.add('hoja-abierta')
    return () => {
      abiertas = Math.max(0, abiertas - 1)
      if (!abiertas) document.documentElement.classList.remove('hoja-abierta')
    }
  }, [])

  // al desmontarse: la copia que sale animada (ver arriba)
  useLayoutEffect(() => {
    const panel = ref.current
    const fondo = capa.current
    const salio = yaSalio // se lee al desmontarse, a propósito: el arrastre pudo sacarla ya
    return () => {
      if (!salio.current) salidaAnimada(panel, fondo)
    }
  }, [])

  const gesto = useArrastreCerrar(ref, capa, variant, yaSalio, () => closeRef.current())

  return createPortal(
    <>
      <div ref={capa} className="overlay" onClick={() => performance.now() - nacio.current > 350 && onClose()} />
      <div ref={ref} tabIndex={-1} className={variant} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="grab" aria-hidden="true" {...gesto.hoja} />
        <div className="dhead" {...gesto.hoja}>
          <button className="iconbtn flat datras" onClick={onClose} aria-label="Atrás">
            <Icon name="chevron" />
          </button>
          <h2 id={titleId}>{title}</h2>
          {headExtra}
          <button className="iconbtn flat dcerrar" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        <div className="dbody">{children}</div>
        {footer && <div className="dfoot">{footer}</div>}
        {variant === 'drawer' && <div className="dborde" aria-hidden="true" {...gesto.borde} />}
      </div>
    </>,
    document.body,
  )
}

/** Deja una copia inerte de la hoja (y de su fondo) en su lugar para que haga la salida. La copia se agrega solo si
 *  la original de verdad se fue del documento (en desarrollo, StrictMode simula desmontajes que no quitan nada). */
function salidaAnimada(panel: HTMLElement | null, fondo: HTMLElement | null) {
  if (!panel || !fondo) return
  const copias = [fondo, panel].map((el) => {
    const c = el.cloneNode(true) as HTMLElement
    c.setAttribute('aria-hidden', 'true')
    c.setAttribute('inert', '')
    c.removeAttribute('id')
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
    return c
  })
  // lo escrito en los campos no viaja con cloneNode: se copia a mano
  const a = panel.querySelectorAll<HTMLInputElement>('input, textarea, select')
  const b = copias[1].querySelectorAll<HTMLInputElement>('input, textarea, select')
  a.forEach((el, i) => {
    if (!b[i]) return
    b[i].value = el.value
    if ('checked' in el) b[i].checked = el.checked
  })
  const scroll = panel.querySelector('.dbody')?.scrollTop ?? 0
  const mover = panel.style.transform
  queueMicrotask(() => {
    if (panel.isConnected) return
    for (const c of copias) {
      c.classList.add('saliendo')
      document.body.appendChild(c)
    }
    if (mover) copias[1].style.setProperty('--desde', mover)
    const cuerpo = copias[1].querySelector('.dbody')
    if (cuerpo) cuerpo.scrollTop = scroll
    let hecho = false
    const quitar = () => {
      if (hecho) return
      hecho = true
      copias.forEach((c) => c.remove())
    }
    copias[1].addEventListener('animationend', quitar, { once: true })
    setTimeout(quitar, 500)
  })
}

/** Cerrar con el dedo en el celular: la hoja se arrastra hacia abajo desde su cabecera; la página, hacia la derecha
 *  desde el borde izquierdo. Si sueltas lejos (o con impulso) sale y se cierra; si no, vuelve a su lugar. */
function useArrastreCerrar(
  ref: RefObject<HTMLDivElement | null>,
  capa: RefObject<HTMLDivElement | null>,
  variant: 'drawer' | 'dialog',
  yaSalio: { current: boolean },
  cerrar: () => void,
) {
  const g = useRef<{ eje: 'y' | 'x'; inicio: number; ultimo: number; t: number; v: number; d: number; pid: number; activo: boolean } | null>(null)
  /** el último gesto movió la hoja: el clic que llega al soltar no debe tocar los botones de la cabecera */
  const movio = useRef(false)

  const aplicar = (d: number) => {
    const panel = ref.current
    const fondo = capa.current
    if (!panel || !fondo) return
    const eje = g.current?.eje ?? 'y'
    const tam = eje === 'y' ? panel.offsetHeight : panel.offsetWidth
    panel.style.transform = eje === 'y' ? `translateY(${d}px)` : `translateX(${d}px)`
    fondo.style.opacity = String(Math.max(0, 1 - (d / Math.max(1, tam)) * 1.1))
  }

  const soltar = (cancel: boolean) => {
    const s = g.current
    g.current = null
    const panel = ref.current
    const fondo = capa.current
    if (!s || !panel || !fondo || !s.activo) return
    movio.current = true
    setTimeout(() => (movio.current = false), 0)
    const tam = s.eje === 'y' ? panel.offsetHeight : panel.offsetWidth
    const sale = !cancel && (s.d > tam * 0.3 || (s.v > 0.5 && s.d > 24))
    const curva = 'cubic-bezier(0.32, 0.72, 0, 1)'
    if (sale) {
      // sigue con la velocidad del dedo hasta salir; ya fuera, se cierra (sin otra salida al desmontarse)
      const dur = Math.round(Math.min(300, Math.max(160, (tam - s.d) / Math.max(s.v, 1.2))))
      panel.style.transition = `transform ${dur}ms ${curva}`
      fondo.style.transition = `opacity ${dur}ms linear`
      panel.style.transform = s.eje === 'y' ? 'translateY(100%)' : 'translateX(100%)'
      fondo.style.opacity = '0'
      yaSalio.current = true
      setTimeout(() => {
        cerrar()
        // si quien la abrió no la cerró (p. ej. está pagando), vuelve a su lugar
        setTimeout(() => {
          if (!panel.isConnected) return
          yaSalio.current = false
          panel.style.transition = `transform 0.35s ${curva}`
          fondo.style.transition = 'opacity 0.35s ease'
          panel.style.transform = ''
          fondo.style.opacity = ''
        }, 60)
      }, dur)
    } else {
      panel.style.transition = `transform 0.35s ${curva}`
      fondo.style.transition = 'opacity 0.35s ease'
      panel.style.transform = ''
      fondo.style.opacity = ''
    }
  }

  const empezar = (eje: 'y' | 'x') => (e: RPointerEvent) => {
    if (e.pointerType === 'mouse' || !celular()) return
    // la hoja se arrastra en el diálogo; el borde, en la página (drawer)
    if ((eje === 'y') !== (variant === 'dialog')) return
    if ((e.target as HTMLElement).closest('input, textarea, select')) return
    const p = eje === 'y' ? e.clientY : e.clientX
    g.current = { eje, inicio: p, ultimo: p, t: e.timeStamp, v: 0, d: 0, pid: e.pointerId, activo: false }
    const mover = (ev: PointerEvent) => {
      const s = g.current
      if (!s || ev.pointerId !== s.pid) return
      const q = s.eje === 'y' ? ev.clientY : ev.clientX
      const crudo = q - s.inicio
      if (!s.activo) {
        if (Math.abs(crudo) < 6) return
        s.activo = true
        const panel = ref.current
        const fondo = capa.current
        if (panel) panel.style.transition = 'none'
        if (fondo) fondo.style.transition = 'none'
      }
      // hacia afuera sigue al dedo; hacia adentro, con resistencia (como el elástico de iOS)
      s.d = crudo > 0 ? crudo : crudo / 5
      const dt = ev.timeStamp - s.t
      if (dt > 0) s.v = s.v * 0.5 + ((q - s.ultimo) / dt) * 0.5
      s.ultimo = q
      s.t = ev.timeStamp
      aplicar(s.d)
    }
    const fin = (ev: PointerEvent) => {
      if (g.current && ev.pointerId !== g.current.pid) return
      removeEventListener('pointermove', mover)
      removeEventListener('pointerup', fin)
      removeEventListener('pointercancel', fin)
      soltar(ev.type === 'pointercancel')
    }
    addEventListener('pointermove', mover)
    addEventListener('pointerup', fin)
    addEventListener('pointercancel', fin)
  }

  const tragarClic = (e: RMouseEvent) => {
    if (movio.current) e.stopPropagation()
  }

  return {
    hoja: { onPointerDown: empezar('y'), onClickCapture: tragarClic },
    borde: { onPointerDown: empezar('x') },
  }
}

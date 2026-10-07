import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Icon, type IconName } from '../../components/Icon'
import { useVoice } from '../../agenda/voice'
import { APPS, type AppId, type OsApp } from '../apps'
// @ts-expect-error el parser de la voz de Rockie vive en Hábitos (JS sin tipos): el mismo que usa su micrófono
import { entender } from '../../../habitos/src/lib/rockieVoz.js'

// La barra de Rockie del escritorio («Rockie primero»): escribes o hablas y te lleva a la app o le
// pasa el pedido a la app que corresponde. Es la tecla Windows de Rockie OS: Ctrl/⌘ K desde cualquier
// lado. El micrófono está al lado del texto y solo escucha cuando lo tocas.

const APP = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, OsApp>
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

type Tarjeta = { tipo: string; app?: 'agenda' | 'equipo' | 'cuaderno'; pedido?: string }

/** A qué app va un pedido: las mismas reglas que la voz de Hábitos (sin IA, predecibles). */
export function destinoDe(texto: string): { app: AppId; path: string } {
  const { tarjetas } = entender(texto) as { tarjetas: Tarjeta[] }
  const t = tarjetas.find((x) => x.tipo === 'app')
  const pedido = encodeURIComponent(t?.pedido || texto)
  if (t?.app === 'agenda') return { app: 'agenda', path: `/agenda?rockie=${pedido}` }
  if (t?.app === 'equipo') return { app: 'equipo', path: `/tareas?vista=lista&rockie=${pedido}` }
  if (t?.app === 'cuaderno') return { app: 'cuaderno', path: `/cuaderno?rockie=${pedido}` }
  // hábitos, metas, «ya medité», validar, animar… y lo que no se entienda: lo conversa el Rockie de Hábitos
  return { app: 'habitos', path: `/habitos/hoy?rockie=${encodeURIComponent(texto)}` }
}

type Item = { key: string; icon: IconName; label: string; sub?: string; color?: string; run: () => void }

const EJEMPLOS = ['Reunión con Dante mañana a las 10', 'Tarea: revisar el PR del firmware', 'Anota: idea para la landing', 'Ya medité']

type Props = {
  /** Ctrl/⌘ K encima de todo (en el Inicio, la conversación es escritorio/Inicio.tsx) */
  variante: 'flotante'
  abierto?: boolean
  onCerrar?: () => void
  /** abrir la barra escuchando (el micrófono del dock) */
  escuchar?: boolean
  abiertas: AppId[]
  foco: AppId | null
  abrirPath: (path: string) => void
  abrirApp: (id: AppId, donde?: 'aqui' | 'izq' | 'der') => void
  irInicio: () => void
}

export function Comando(p: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const visible = Boolean(p.abierto)

  const cerrar = () => {
    setQ('')
    setSel(0)
    input.current?.blur()
    p.onCerrar?.()
  }
  const pedir = (texto: string) => {
    const t = texto.trim()
    if (!t) return
    p.abrirPath(destinoDe(t).path)
    cerrar()
  }
  const voz = useVoice({ onFinal: (t) => pedir(t) })

  // al abrir: foco en el texto; con el micrófono del dock, ya escuchando (lo pidió la persona)
  useEffect(() => {
    if (!p.abierto) return
    const t = setTimeout(() => input.current?.focus(), 30)
    if (p.escuchar && voz.supported) voz.start({ mode: 'tap' })
    return () => clearTimeout(t)
  }, [p.abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visible && voz.listening) voz.cancel()
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo<Item[]>(() => {
    const f = fold(q)
    const out: Item[] = []
    const pedido: Item | null = f
      ? (() => {
          const d = destinoDe(q)
          return { key: 'pedir', icon: 'sparkle', label: `Pídele a Rockie: «${q.trim()}»`, sub: `Lo lleva a ${APP[d.app].name}`, color: APP[d.app].color, run: () => pedir(q) }
        })()
      : null
    const apps: Item[] = [
      { key: 'inicio', icon: 'home', label: 'Inicio', sub: 'Tu día en todas las apps', color: 'var(--title)', run: () => {
          p.irInicio()
          cerrar()
        },
      },
      ...APPS.map<Item>((a) => ({
        key: a.id,
        icon: a.icon,
        label: a.name,
        sub: p.abiertas.includes(a.id) ? 'Abierta · ir' : a.blurb,
        color: a.color,
        run: () => {
          p.abrirApp(a.id)
          cerrar()
        },
      })),
    ]
    const lado: Item[] = p.foco
      ? APPS.filter((a) => a.id !== p.foco).map<Item>((a) => ({
          key: `lado-${a.id}`,
          icon: 'panel',
          label: `${a.name} al lado de ${APP[p.foco!].name}`,
          sub: 'Divide la pantalla (Alt →)',
          color: a.color,
          run: () => {
            p.abrirApp(a.id, 'der')
            cerrar()
          },
        }))
      : []
    for (const it of [...apps, ...lado]) if (!f || fold(`${it.label} ${it.sub ?? ''}`).includes(f)) out.push(it)
    // si lo escrito es una app o una acción, eso va primero; si no, es un pedido para Rockie
    if (pedido) {
      if (out.length) out.push(pedido)
      else out.unshift(pedido)
    }
    return out
  }, [q, p.abiertas, p.foco]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel(0), [q])

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (voz.listening) voz.cancel()
      else cerrar()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(items.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[sel]?.run()
    }
  }

  const barra = (
    <div className={`esc-cmd-bar${voz.listening ? ' oyendo' : ''}`}>
      <Icon name="search" />
      <input
        ref={input}
        autoFocus
        value={voz.listening ? voz.text : q}
        readOnly={voz.listening}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={teclas}
        placeholder={voz.listening ? 'Te escucho… toca el micrófono para terminar' : 'Escribe o dile a Rockie… «reunión mañana a las 10»'}
        aria-label="Busca una app o pídele algo a Rockie"
        aria-controls="esc-cmd-lista"
        aria-activedescendant={items[sel] ? `esc-cmd-${items[sel].key}` : undefined}
      />
      {!voz.listening && <kbd>Esc</kbd>}
      <button
        type="button"
        className={`esc-cmd-mic${voz.listening ? ' on' : ''}`}
        onClick={() => (voz.listening ? voz.stop() : voz.start({ mode: 'tap' }))}
        disabled={!voz.supported}
        aria-label={voz.listening ? 'Terminar de hablar' : 'Hablarle a Rockie'}
        title={voz.supported ? (voz.listening ? 'Terminar' : 'Hablar') : 'Este navegador no dicta'}
      >
        <Icon name="mic" />
      </button>
    </div>
  )

  const lista = (
    <ul className="esc-cmd-lista" id="esc-cmd-lista" role="listbox" aria-label="Resultados">
      {items.map((it, i) => (
        <li key={it.key} id={`esc-cmd-${it.key}`} role="option" aria-selected={i === sel}>
          <button type="button" onMouseEnter={() => setSel(i)} onMouseDown={(e) => e.preventDefault()} onClick={it.run}>
            <span className="esc-cmd-ic" style={{ ['--c' as string]: it.color ?? 'var(--brand)' } as CSSProperties}>
              <Icon name={it.icon} className="sm" />
            </span>
            <span className="esc-cmd-t">
              <b>{it.label}</b>
              {it.sub && <small>{it.sub}</small>}
            </span>
            {i === sel && <kbd>Enter</kbd>}
          </button>
        </li>
      ))}
      {!q && (
        <li className="esc-cmd-ej" role="presentation">
          <small>Prueba con</small>
          <span>
            {EJEMPLOS.map((x) => (
              <button key={x} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                  setQ(x)
                  input.current?.focus()
                }}>
                «{x}»
              </button>
            ))}
          </span>
        </li>
      )}
    </ul>
  )

  return (
    <AnimatePresence>
      {p.abierto && (
        <motion.div className="esc-cmd-capa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onMouseDown={cerrar}>
          <motion.div
            className="esc-cmd"
            role="dialog"
            aria-modal="true"
            aria-label="Rockie"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {barra}
            {voz.error && <p className="esc-cmd-err">{voz.error}</p>}
            {lista}
            <footer className="esc-cmd-pie">
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> moverte
              </span>
              <span>
                <kbd>Enter</kbd> abrir
              </span>
              <span>
                <kbd>Alt</kbd> <kbd>1–5</kbd> apps
              </span>
              <span>
                <kbd>Alt</kbd> <kbd>← →</kbd> dividir
              </span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

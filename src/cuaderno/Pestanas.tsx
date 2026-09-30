import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../components/Icon'
import { useMe } from '../features/auth/AuthProvider'
import { lsGet, lsSet } from '../lib/storage'
import { useNotes } from './data'
import { ItemIcon } from './icons'
import { IconoDividir } from './Dividido'
import { TIPO_NOTA, useDivision } from './ui'

// Las notas abiertas como pestañas, como en Obsidian: cada página o pizarra que abres queda arriba
// para volver de un toque; se cierra con la × (o con la rueda del mouse). Se recuerdan entre visitas.
// Con la pantalla dividida, tocar una pestaña la abre en el lado que tiene el foco; arrastrarla a la
// mitad derecha (o Ctrl + clic, o su botón ◫) la abre al lado.
const MAX = 24

export function Pestanas() {
  const { userId } = useMe()
  const clave = `cu.pestanas.${userId}`
  const loc = useLocation()
  const nav = useNavigate()
  const notes = useNotes().data
  const [abiertas, setAbiertas] = useState<string[]>(() => {
    try {
      const v = JSON.parse(lsGet(clave) || '[]')
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  })
  const actual = /^\/cuaderno\/nota\/([^/?#]+)/.exec(loc.pathname)?.[1] ?? null
  const { lado, foco, abrirAlLado, cerrarLado, setFoco } = useDivision()
  // la que se está editando: la del lado con foco
  const enFoco = lado && foco === 'der' ? lado : actual

  // abrir una nota = su pestaña (si ya estaba abierta, solo se activa)
  useEffect(() => {
    if (actual) setAbiertas((l) => (l.includes(actual) ? l : [...l, actual].slice(-MAX)))
  }, [actual])
  useEffect(() => {
    if (lado) setAbiertas((l) => (l.includes(lado) ? l : [...l, lado].slice(-MAX)))
  }, [lado])
  useEffect(() => lsSet(clave, JSON.stringify(abiertas)), [abiertas, clave])
  // una nota borrada se lleva su pestaña
  useEffect(() => {
    if (!notes) return
    const hay = new Set(notes.map((n) => n.id))
    setAbiertas((l) => (l.every((id) => hay.has(id)) ? l : l.filter((id) => hay.has(id))))
  }, [notes])

  const porId = useMemo(() => new Map((notes ?? []).map((n) => [n.id, n])), [notes])

  const cerrar = (id: string) => {
    const i = abiertas.indexOf(id)
    const resto = abiertas.filter((x) => x !== id)
    setAbiertas(resto)
    if (id === lado) return cerrarLado()
    // cerrar la que estás viendo te deja en la de al lado (o en tu día si no queda ninguna)
    const libres = resto.filter((x) => x !== lado)
    if (id === actual) nav(libres.length ? `/cuaderno/nota/${libres[Math.min(i, libres.length - 1)]}` : '/cuaderno')
  }
  const cerrarOtras = () => setAbiertas([actual, lado].filter((x): x is string => Boolean(x)))
  const abrir = (id: string, alLado = false) => {
    if (alLado) return id !== actual && abrirAlLado(id)
    if (lado && foco === 'der') return id !== actual && abrirAlLado(id)
    setFoco('izq')
    if (id !== actual) nav(`/cuaderno/nota/${id}`)
  }

  if (!abiertas.length) return null
  return (
    <nav className="cu-pestanas" aria-label="Notas abiertas">
      <div className="cu-pestanas-fila" role="tablist">
        <AnimatePresence initial={false}>
          {abiertas.map((id) => {
            const n = porId.get(id)
            const titulo = n?.title?.trim() || 'Sin título'
            return (
              <motion.div
                key={id}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                role="tab"
                tabIndex={0}
                aria-selected={id === enFoco}
                className={`cu-pestana${id === enFoco ? ' on' : ''}${lado && (id === actual || id === lado) && id !== enFoco ? ' visible' : ''}`}
                title={`${titulo}${id !== actual && id !== lado ? ' · Ctrl + clic o arrástrala a la derecha para abrirla al lado' : ''}`}
                onClick={(e) => abrir(id, e.ctrlKey || e.metaKey)}
                onKeyDown={(e) => e.key === 'Enter' && abrir(id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    cerrar(id)
                  }
                }}
              >
                <span
                  className="cu-pestana-arr"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TIPO_NOTA, id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <ItemIcon value={n?.icon} fallback={n?.kind === 'pizarra' ? 'board' : 'note'} size={15} />
                  <span className="cu-pestana-t">{titulo}</span>
                  {lado && id === lado && <i className="cu-pestana-lado" title="Abierta a la derecha" />}
                </span>
                {id !== actual && id !== lado && (
                  <button
                    type="button"
                    className="cu-pestana-div"
                    aria-label={`Abrir ${titulo} al lado`}
                    title="Abrir al lado"
                    onClick={(e) => {
                      e.stopPropagation()
                      abrir(id, true)
                    }}
                  >
                    <IconoDividir size={14} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Cerrar ${titulo}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    cerrar(id)
                  }}
                >
                  <Icon name="close" className="sm" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      {abiertas.length > 2 && actual && (
        <button type="button" className="cu-pestanas-otras" onClick={cerrarOtras} title="Deja solo la nota que estás viendo">
          Cerrar las demás
        </button>
      )}
    </nav>
  )
}

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { dayOfTs } from '../../lib/dates'
import { pointOf } from '../../lib/fx'
import type { Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useTasks } from '../data/queries'
import { useTaskActions } from './actions'
import { openValidate } from './dialogs'
import { useLookup } from './bits'
import { useLoQueSigue, type Paso } from './loQueSigue'
import { marcarPaso, pasosDeNota } from './pasosNota'
import './camino.css'

// «Tu camino de hoy»: lo que sigue como un camino de pasos acostado (el de Duolingo, de lado), no como una lista.
// A la izquierda lo que ya hiciste hoy; al centro, en grande, el paso de ahora con los pasos de su nota como
// casillas y «Empezar» / «Listo» (validar trae el festejo de Rockie); a la derecha lo que sigue, con candado y a qué
// espera si está bloqueado. Se desliza. El orden es el de «Lo que sigue» (loQueSigue.ts): igual en PC y celular.

type ConHora = Task & { estimate_min?: number | null; start_time?: string | null }
/** minutos estimados (cuando la base tenga tasks.estimate_min) */
const minutosDe = (t: Task) => (t as ConHora).estimate_min ?? null
/** «15:30» si la tarea tiene hora (tasks.start_time, «HH:MM[:SS]») */
const horaDe = (t: Task) => (t as ConHora).start_time?.slice(0, 5) ?? null
const duracion = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`)

export function CaminoDeHoy({ tasks: entre }: { tasks?: Task[] }) {
  const { userId, profile } = useMe()
  const { memberById, today } = useLookup()
  const todas = useTasks().data ?? []
  const { siguiente, pasos, cargando } = useLoQueSigue(entre)
  const { move, validate, update } = useTaskActions()
  const [params, setParams] = useSearchParams()
  const pista = useRef<HTMLDivElement>(null)
  const centro = useRef<HTMLDivElement>(null)
  const listo = useRef<HTMLButtonElement>(null)

  // las casillas responden al toque (la caché de tareas avisa un instante después y la casilla volvía atrás);
  // al guardar, manda lo que diga la nota (si falla, update ya la devuelve y avisa)
  const [marcas, setMarcas] = useState<Record<string, boolean>>({})
  async function marcar(t: Task, linea: number, hecho: boolean) {
    const k = `${t.id}:${linea}`
    setMarcas((m) => ({ ...m, [k]: hecho }))
    await update(t.id, { notes: marcarPaso(t.notes ?? '', linea, hecho) })
    setMarcas(({ [k]: _fuera, ...m }) => m)
  }

  const abrir = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tarea', id)
    setParams(next)
  }
  const quien = (t: Task) => (t.assignee_id ? memberById.get(t.assignee_id)?.profile.display_name?.split(' ')[0] : undefined)
  const nombrar = (ts: Task[]) => ts.map((t) => `«${t.title}»${quien(t) ? ` de ${quien(t)}` : ''}`).join(', ')

  // lo que ya hiciste hoy (izquierda), lo de ahora (centro) y lo que sigue (derecha)
  const hechas = useMemo(
    () =>
      todas
        .filter((t) => t.assignee_id === userId && t.status === 'done' && t.validated_at && dayOfTs(t.validated_at, profile.timezone) === today)
        .sort((a, b) => (a.validated_at ?? '').localeCompare(b.validated_at ?? '')),
    [todas, userId, profile.timezone, today],
  )
  const actual: Paso | undefined = siguiente ?? pasos[0]
  const despues = pasos.filter((p) => p !== actual)
  const VISIBLES = 8

  // al abrir y al avanzar, el paso de ahora queda al centro
  useLayoutEffect(() => {
    const p = pista.current
    const c = centro.current
    if (!p || !c) return
    p.scrollTo({ left: c.offsetLeft - (p.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' })
  }, [actual?.task.id, hechas.length])

  /** centra en la pista el paso número i (en el mismo orden que el mapa) */
  const irA = (i: number) => {
    const p = pista.current
    const el = p?.children[i] as HTMLElement | undefined
    if (p && el) p.scrollTo({ left: el.offsetLeft - (p.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
  }

  if (cargando) return <div className="camino camino-cargando" aria-busy="true" />
  if (!actual && !hechas.length) return null
  const total = hechas.length + pasos.length

  const t = actual?.task
  const pasosNota = t ? pasosDeNota(t.notes ?? '') : []
  const minutos = t ? minutosDe(t) : null
  const hora = t ? horaDe(t) : null

  return (
    <section className="camino" aria-label="Tu camino de hoy">
      <header className="camino-cab">
        <b>Tu camino de hoy</b>
        <small>
          {hechas.length} de {total} {total === 1 ? 'paso' : 'pasos'}
        </small>
      </header>

      {/* el camino entero de un vistazo (en el celular la pista muestra un paso a la vez): un punto por paso; tocar uno
          lleva a ese paso */}
      <ol className="camino-mapa" aria-hidden="true">
        {[...hechas.map(() => 'hecho'), ...(actual ? ['ahora'] : []), ...despues.slice(0, VISIBLES).map((p) => (p.bloqueada ? 'bloq' : 'sig'))].map((k, i) => (
          <li key={i} className={k} onClick={() => irA(i)}>
            {k === 'hecho' ? <Icon name="check" className="sm" /> : k === 'bloq' ? <Icon name="lock" className="sm" /> : null}
          </li>
        ))}
      </ol>

      <div className="camino-pista" ref={pista}>
        {hechas.map((h) => (
          <button key={h.id} type="button" className="camino-nodo hecho" onClick={() => abrir(h.id)} title={h.title}>
            <span className="camino-piedra">
              <Icon name="check" />
            </span>
            <span className="camino-t">{h.title}</span>
          </button>
        ))}

        <AnimatePresence mode="popLayout" initial={false}>
          {actual && t ? (
            <motion.article
              key={t.id}
              ref={centro}
              className={`camino-actual${actual.bloqueada ? ' espera' : ''}${t.priority === 'urgent' ? ' urgente' : ''}`}
              initial={{ opacity: 0, scale: 0.92, x: 40 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: -40 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <span className="camino-eyebrow">
                {actual.bloqueada ? (
                  <>
                    <Icon name="lock" className="sm" /> Todo lo tuyo espera
                  </>
                ) : t.status === 'doing' ? (
                  'Sigues con'
                ) : (
                  'Ahora'
                )}
              </span>
              <button type="button" className="camino-titulo" onClick={() => abrir(t.id)}>
                {t.title}
              </button>
              {(minutos || hora || t.status === 'doing') && (
                <span className="camino-meta">
                  {hora && (
                    <span>
                      <Icon name="clock" className="sm" /> {hora}
                    </span>
                  )}
                  {minutos ? <span>~{duracion(minutos)}</span> : null}
                  {t.status === 'doing' && <span className="camino-doing">En curso</span>}
                </span>
              )}

              {pasosNota.length > 0 && (
                <ul className="camino-pasos" aria-label="Pasos de esta tarea">
                  {pasosNota.map((p) => (
                    <li key={p.linea}>
                      <label className={p.hecho ? 'hecho' : ''}>
                        <input
                          type="checkbox"
                          checked={marcas[`${t.id}:${p.linea}`] ?? p.hecho}
                          disabled={actual.bloqueada}
                          onChange={() => void marcar(t, p.linea, !(marcas[`${t.id}:${p.linea}`] ?? p.hecho))}
                        />
                        <span>{p.texto}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {actual.bloqueada ? (
                <p className="camino-destraba">
                  <Icon name="lock" className="sm" /> Espera a {nombrar(actual.esperaA)}
                </p>
              ) : (
                actual.desbloquea.length > 0 && (
                  <p className="camino-destraba">
                    <Icon name="lock" className="sm" /> Al terminarla destrabas {nombrar(actual.desbloquea)}
                  </p>
                )
              )}

              {!actual.bloqueada && (
                <div className="camino-acciones">
                  {t.status === 'todo' ? (
                    <button type="button" className="btn" onClick={() => void move(t, 'doing', t.position)}>
                      <Icon name="arrow" /> Empezar
                    </button>
                  ) : (
                    <>
                      <button ref={listo} type="button" className="btn camino-listo" onClick={() => void validate(t, 'plain', {}, pointOf(listo.current))}>
                        <Icon name="check" /> Listo
                      </button>
                      <button type="button" className="btn ghost" onClick={(e) => openValidate(t.id, pointOf(e.currentTarget))} title="Con foto o link vale más XP">
                        <Icon name="image" /> Con prueba
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.article>
          ) : (
            <motion.div key="fin" ref={centro} className="camino-actual fin" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <span className="camino-eyebrow">Camino completo</span>
              <b className="camino-titulo">¡Hiciste todo lo tuyo de hoy!</b>
            </motion.div>
          )}
        </AnimatePresence>

        {despues.slice(0, VISIBLES).map((p, i) => (
          <button
            key={p.task.id}
            type="button"
            className={`camino-nodo${p.bloqueada ? ' bloq' : ''}`}
            onClick={() => abrir(p.task.id)}
            title={p.bloqueada ? `Espera a ${nombrar(p.esperaA)}` : p.task.title}
            style={{ ['--i' as string]: i } as CSSProperties}
          >
            <span className="camino-piedra">{p.bloqueada ? <Icon name="lock" className="sm" /> : <b>{hechas.length + 2 + i}</b>}</span>
            <span className="camino-t">{p.task.title}</span>
            {p.bloqueada ? (
              <small className="camino-espera">espera a {nombrar(p.esperaA)}</small>
            ) : minutosDe(p.task) ? (
              <small>~{duracion(minutosDe(p.task)!)}</small>
            ) : null}
          </button>
        ))}
        {despues.length > VISIBLES && (
          <span className="camino-nodo mas">
            <span className="camino-piedra">+{despues.length - VISIBLES}</span>
            <span className="camino-t">más</span>
          </span>
        )}
      </div>
    </section>
  )
}

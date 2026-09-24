import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { burst, celebrateRockie, centerPoint, haptic } from '../lib/fx'
import { embedNotes, learn, type Plan } from './agent'
import { closeDialog, openDialog, type LearnDraft } from './bus'
import { BOOK_COLORS, COLOR_ORDER, nextColor, spine, type BookColor } from './books'
import { useBooks, useCuadernoActions, type Book, type Undo } from './data'
import { upload } from './files'
import { CIcon } from './icons'

// "Aprender un tema": Rockie arma un cuaderno de estudio (como NotebookLM, pero queda tuyo y editable).
// 1) pides el tema (y fuentes)  2) Rockie PROPONE el cuaderno  3) tú lo revisas  4) lo ves nacer, nodo por nodo.

type Nivel = 'cero' | 'algo' | 'avanzado'
type Stage = 'form' | 'thinking' | 'preview' | 'building' | 'done'
const NIVELES: { id: Nivel; label: string }[] = [
  { id: 'cero', label: 'Desde cero' },
  { id: 'algo', label: 'Algo sé' },
  { id: 'avanzado', label: 'Avanzado' },
]
const TIPS = [
  'Leyendo lo que me diste…',
  'Separando el tema en ideas atómicas…',
  'Ordenando de lo básico a lo avanzado…',
  'Escribiendo ejemplos que se entiendan…',
  'Preparando tus tarjetas de repaso…',
  'Buscando con qué se conecta de lo que ya sabes…',
]
const YT = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{6,}/

export function AprenderDialog(p: { tema?: string; bookId?: string | null; restore?: LearnDraft }) {
  const { userId } = useAuth()
  const actions = useCuadernoActions()
  const books = useBooks().data ?? []
  const nav = useNavigate()
  const tops = books.filter((b) => !b.parent_id)
  const r0 = p.restore
  const [stage, setStage] = useState<Stage>(r0 ? 'preview' : 'form')
  const [tema, setTema] = useState(r0?.tema ?? p.tema ?? '')
  const [nivel, setNivel] = useState<Nivel>('cero')
  const [target, setTarget] = useState<string>(r0?.target ?? p.bookId ?? 'nuevo')
  const [showSources, setShowSources] = useState(false)
  const [apuntes, setApuntes] = useState('')
  const [youtube, setYoutube] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [plan, setPlan] = useState<Plan | null>(r0?.plan ?? null)
  const [keep, setKeep] = useState<Set<string>>(() => new Set(r0?.keep ?? []))
  const [name, setName] = useState(r0?.name ?? '')
  const [color, setColor] = useState<BookColor>(r0?.color ?? 'accent')
  const [tip, setTip] = useState(0)
  const [built, setBuilt] = useState(0)
  const [result, setResult] = useState<{ bookId: string; pages: number; cards: number } | null>(null)
  const [slow, setSlow] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const run = useRef(0) // cada pedido tiene su número: cancelar = ignorar la respuesta que llegue tarde
  const alive = useRef(true)
  // (StrictMode monta dos veces: hay que volver a encenderla al montar)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (stage !== 'thinking') return
    setSlow(false)
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2600)
    const late = setTimeout(() => setSlow(true), 30_000)
    return () => {
      clearInterval(id)
      clearTimeout(late)
    }
  }, [stage])

  const ytOk = !youtube || YT.test(youtube.trim())
  const canAsk = (tema.trim() || apuntes.trim() || youtube.trim() || pdf) && ytOk

  async function ask() {
    if (!canAsk || !userId) return
    const mine = ++run.current
    setFailed(null)
    setStage('thinking')
    setTip(0)
    haptic(10)
    let pdfPath: string | undefined
    if (pdf) {
      if (pdf.size > 12 * 1024 * 1024) {
        toastError('El PDF pesa demasiado (máx. 12 MB).')
        setStage('form')
        return
      }
      pdfPath = (await upload(userId, pdf, 'pdf', `fuente-${crypto.randomUUID()}`)) ?? undefined
      if (!pdfPath) return setStage('form')
    }
    const r = await learn({
      tema: tema.trim(),
      nivel,
      apuntes: apuntes.trim(),
      youtube: youtube.trim(),
      pdfPath,
      bookId: target === 'nuevo' ? null : target,
    })
    if (!alive.current || mine !== run.current) return
    if (!r.plan) {
      // tras una espera larga el toast se pierde: el porqué queda también en el formulario
      const msg = r.error ?? 'Rockie no pudo armar el cuaderno.'
      toastError(msg)
      setFailed(msg)
      setStage('form')
      return
    }
    setPlan(r.plan)
    setKeep(new Set(r.plan.paginas.map((x) => x.key)))
    setName(r.plan.nombre)
    setColor(target === 'nuevo' ? (r.plan.color ?? nextColor(tops.map((b) => b.color))) : (books.find((b) => b.id === target)?.color ?? r.plan.color))
    setStage('preview')
    haptic([8, 20, 8])
  }

  const pages = useMemo(() => (plan ? plan.paginas.filter((x) => keep.has(x.key)) : []), [plan, keep])
  const nCards = pages.reduce((n, x) => n + x.tarjetas.length, 0)

  async function build() {
    if (!plan || !pages.length) return
    setStage('building')
    setBuilt(0)
    const undos: Undo[] = []
    const ids: string[] = []
    // 1) el cuaderno (o el existente) y sus secciones
    let root: Book | undefined = target === 'nuevo' ? undefined : books.find((b) => b.id === target)
    if (!root) {
      const res = await actions.createBook({ name: name.trim() || plan.nombre, color })
      if (!res) return setStage('preview')
      root = res.book
      undos.push(res.undo)
    }
    const sectionOf = new Map<string, string>()
    for (const sec of [...new Set(pages.map((x) => x.seccion).filter(Boolean) as string[])]) {
      const existing = books.find((b) => b.parent_id === root!.id && b.name.toLowerCase() === sec.toLowerCase())
      if (existing) sectionOf.set(sec, existing.id)
      else {
        const res = await actions.createBook({ name: sec, color: root.color, parent_id: root.id })
        if (res) {
          sectionOf.set(sec, res.book.id)
          undos.push(res.undo)
        }
      }
    }
    // 2) la página índice (el centro del tema en el mapa)
    const base = Date.now() / 1000
    const hub = await actions.createNote({
      title: target === 'nuevo' ? `Índice · ${root.name}` : `Índice · ${tema.trim() || plan.nombre}`,
      body: plan.resumen || `Tu cuaderno de ${root.name}.`,
      area: 'mente',
      book_id: root.id,
      position: base,
    })
    if (!hub) return setStage('preview')
    undos.push(hub.undo)
    ids.push(hub.note.id)
    // 3) las páginas, una por una (el mapa las ve nacer)
    const idOf = new Map<string, string>()
    let cards = 0
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i]
      const res = await actions.createNote({
        title: pg.titulo,
        body: pg.cuerpo,
        area: 'mente',
        book_id: (pg.seccion && sectionOf.get(pg.seccion)) || root.id,
        position: base + i + 1,
      })
      if (!res) continue
      undos.push(res.undo)
      ids.push(res.note.id)
      idOf.set(pg.key, res.note.id)
      const u = await actions.createCards(res.note.id, pg.tarjetas)
      if (u) {
        undos.push(u)
        cards += pg.tarjetas.length
      }
      const l = await actions.createLink({ a_id: hub.note.id, b_id: res.note.id, project_id: null, reason: `Es parte de «${root.name}»` })
      if (l) undos.push(l.undo)
      if (alive.current) setBuilt(i + 1)
      haptic(4)
    }
    // 4) las conexiones entre páginas y con lo que ya sabías
    for (const c of plan.conexiones) {
      const a = idOf.get(c.from)
      const b = idOf.get(c.to)
      if (!a || !b) continue
      const l = await actions.createLink({ a_id: a, b_id: b, project_id: null, reason: c.reason })
      if (l) undos.push(l.undo)
    }
    for (const c of plan.externas) {
      const a = idOf.get(c.from)
      if (!a) continue
      const l = await actions.createLink({ a_id: a, b_id: c.note_id, project_id: null, reason: c.reason })
      if (l) undos.push(l.undo)
    }
    for (let i = 0; i < ids.length; i += 20) embedNotes(ids.slice(i, i + 20))
    if (!alive.current) return
    setResult({ bookId: root.id, pages: idOf.size, cards })
    setStage('done')
    const pt = centerPoint()
    burst(pt.x, pt.y, 36)
    celebrateRockie()
    haptic([10, 40, 10, 40, 20])
    const rootName = root.name
    toast(`Creaste «${rootName}» · ${idOf.size} páginas`, {
      kind: 'ok',
      icon: 'check',
      action: {
        label: 'Deshacer',
        onClick: async () => {
          for (const u of undos.reverse()) await u()
          nav('/cuaderno/cuadernos')
        },
      },
    })
  }

  const close = () => {
    closeDialog()
    // la propuesta costó esperar: cerrarla no la pierde (deshacer en vez de confirmar)
    if (stage === 'preview' && plan) {
      const draft: LearnDraft = { plan, tema, target, name, color, keep: [...keep] }
      toast('Cerraste la propuesta de Rockie', {
        action: { label: 'Recuperar', onClick: () => openDialog({ kind: 'aprender', restore: draft }) },
      })
    }
  }
  return createPortal(
    <motion.div className="cu-modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && stage !== 'building' && close()}>
      <motion.section
        className="cu-modal cu-learn"
        role="dialog"
        aria-modal="true"
        aria-label="Aprender un tema"
        initial={{ y: 24, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <header className="cu-modal-head">
          <span className="cu-modal-ico">
            <CIcon name="sparkle" size={18} />
          </span>
          <h2>{stage === 'preview' ? 'Tu cuaderno, antes de crearlo' : stage === 'building' ? 'Armando tu cuaderno' : stage === 'done' ? '¡Listo!' : 'Aprender un tema'}</h2>
          <span className="spacer" />
          {stage !== 'building' && (
            <button className="cu-x" onClick={close} aria-label="Cerrar">
              <CIcon name="close" size={16} />
            </button>
          )}
        </header>

        <AnimatePresence mode="popLayout" initial={false}>
          {stage === 'form' && (
            <motion.div key="form" className="cu-modal-body" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <label className="cu-lbl" htmlFor="cu-tema">
                ¿Qué quieres aprender?
              </label>
              <textarea
                id="cu-tema"
                className="cu-input"
                rows={2}
                autoFocus
                value={tema}
                maxLength={300}
                onChange={(e) => setTema(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void ask()
                  }
                }}
                placeholder="Ej.: alemán A1 desde cero · la historia del Imperio inca · derivadas para mi examen"
              />
              <div className="cu-row2">
                <div className="segmented" role="radiogroup" aria-label="Tu nivel">
                  {NIVELES.map((n) => (
                    <button key={n.id} role="radio" aria-checked={nivel === n.id} aria-pressed={nivel === n.id} onClick={() => setNivel(n.id)}>
                      {n.label}
                    </button>
                  ))}
                </div>
                <select className="cu-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Dónde se crea">
                  <option value="nuevo">En un cuaderno nuevo</option>
                  {tops.map((b) => (
                    <option key={b.id} value={b.id}>
                      Sumar a «{b.name}»
                    </option>
                  ))}
                </select>
              </div>

              <button className="cu-linkbtn" onClick={() => setShowSources(!showSources)} aria-expanded={showSources}>
                <CIcon name={showSources ? 'down' : 'right'} size={15} /> Agregar fuentes (opcional): apuntes, un video o un PDF
              </button>
              <AnimatePresence initial={false}>
                {showSources && (
                  <motion.div key="src" className="cu-sources" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <textarea className="cu-input" rows={4} value={apuntes} maxLength={40000} onChange={(e) => setApuntes(e.target.value)} placeholder="Pega tus apuntes o un texto" aria-label="Apuntes" />
                    <div className="cu-src-row">
                      <CIcon name="youtube" size={18} />
                      <input className="cu-input" value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="Enlace de un video de YouTube (público)" aria-label="Video de YouTube" aria-invalid={!ytOk} />
                    </div>
                    {!ytOk && <p className="cu-warn">Ese enlace no parece de YouTube.</p>}
                    <label className="cu-src-row cu-file">
                      <CIcon name="upload" size={18} />
                      <span>{pdf ? pdf.name : 'Subir un PDF (máx. 12 MB)'}</span>
                      <input type="file" accept="application/pdf" hidden onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
                      {pdf && (
                        <button
                          className="cu-x"
                          onClick={(e) => {
                            e.preventDefault()
                            setPdf(null)
                          }}
                          aria-label="Quitar PDF"
                        >
                          <CIcon name="close" size={14} />
                        </button>
                      )}
                    </label>
                    <p className="cu-muted">Rockie lee las fuentes una vez para armar tu cuaderno y no las guarda.</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {failed && (
                <p className="rk-err" role="alert">
                  {failed}
                </p>
              )}
              <div className="cu-modal-foot">
                <span className="cu-muted">Rockie te propone el cuaderno; tú lo revisas antes de crearlo.</span>
                <button className="btn" onClick={() => void ask()} disabled={!canAsk}>
                  <CIcon name="sparkle" size={16} /> Armar mi cuaderno
                </button>
              </div>
            </motion.div>
          )}

          {stage === 'thinking' && (
            <motion.div key="thinking" className="cu-modal-body cu-think" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Rockie color="#2a82ad" size={88} />
              <AnimatePresence mode="popLayout">
                <motion.p key={tip} className="cu-think-tip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  {TIPS[tip]}
                </motion.p>
              </AnimatePresence>
              <span className="rk-dots">
                <i />
                <i />
                <i />
              </span>
              <p className="cu-muted">
                {slow
                  ? 'Google está muy ocupado ahora (plan gratuito). Puedes esperar un poco más o intentarlo en un rato.'
                  : 'Con videos o PDFs puede tardar hasta un minuto.'}
              </p>
              <button
                className="btn sm ghost"
                onClick={() => {
                  run.current++
                  setStage('form')
                }}
              >
                Cancelar
              </button>
            </motion.div>
          )}

          {stage === 'preview' && plan && (
            <motion.div key="preview" className="cu-modal-body" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
              {target === 'nuevo' ? (
                <div className="cu-plan-book" style={spine(color)}>
                  <span className="cu-plan-spine" aria-hidden="true" />
                  <input className="cu-plan-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nombre del cuaderno" />
                  <div className="cu-swatches" role="radiogroup" aria-label="Color del cuaderno">
                    {COLOR_ORDER.map((c) => (
                      <button key={c} role="radio" aria-checked={color === c} className={`cu-swatch${color === c ? ' on' : ''}`} style={{ ['--sw' as string]: BOOK_COLORS[c].fill }} onClick={() => setColor(c)} aria-label={BOOK_COLORS[c].label} title={BOOK_COLORS[c].label} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="cu-muted">Se suma a «{books.find((b) => b.id === target)?.name}».</p>
              )}
              {plan.resumen && <p className="cu-plan-sum">{plan.resumen.replace(/[#*_>`]/g, '').slice(0, 280)}</p>}
              <ul className="cu-plan-pages">
                {plan.paginas.map((pg, i) => (
                  <motion.li key={pg.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <label className={keep.has(pg.key) ? 'on' : ''}>
                      <input
                        type="checkbox"
                        checked={keep.has(pg.key)}
                        onChange={() =>
                          setKeep((k) => {
                            const n = new Set(k)
                            if (n.has(pg.key)) n.delete(pg.key)
                            else n.add(pg.key)
                            return n
                          })
                        }
                      />
                      <span>
                        <b>{pg.titulo}</b>
                        <small>
                          {pg.seccion ? `${pg.seccion} · ` : ''}
                          {pg.cuerpo.replace(/[#*_>`|-]/g, '').replace(/\s+/g, ' ').slice(0, 110)}…
                        </small>
                      </span>
                      {pg.tarjetas.length > 0 && (
                        <em>
                          <CIcon name="cards" size={13} /> {pg.tarjetas.length}
                        </em>
                      )}
                    </label>
                  </motion.li>
                ))}
              </ul>
              {(plan.conexiones.length > 0 || plan.externas.length > 0) && (
                <p className="cu-plan-links">
                  <CIcon name="link" size={15} /> {plan.conexiones.length} conexiones entre páginas
                  {plan.externas.length > 0 && ` · ${plan.externas.length} con lo que ya tienes (${plan.notas_externas.map((n) => `«${n.title}»`).join(', ')})`}
                </p>
              )}
              <div className="cu-modal-foot">
                <button className="btn ghost" onClick={() => setStage('form')}>
                  Volver
                </button>
                <button className="btn gphoto" onClick={() => void build()} disabled={!pages.length}>
                  Crear cuaderno · {pages.length} {pages.length === 1 ? 'página' : 'páginas'} · {nCards} tarjetas
                </button>
              </div>
            </motion.div>
          )}

          {(stage === 'building' || stage === 'done') && plan && (
            <motion.div key="build" className="cu-modal-body cu-build" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <BuildGraph name={name || plan.nombre} color={color} titles={pages.map((x) => x.titulo)} built={stage === 'done' ? pages.length : built} links={stage === 'done' ? plan.conexiones.filter((c) => keep.has(c.from) && keep.has(c.to)).map((c) => [pages.findIndex((x) => x.key === c.from), pages.findIndex((x) => x.key === c.to)] as [number, number]) : []} />
              {stage === 'building' ? (
                <p className="cu-build-count" aria-live="polite">
                  {built} de {pages.length} páginas
                </p>
              ) : (
                result && (
                  <>
                    <p className="cu-build-done">
                      Tu cuaderno tiene <b>{result.pages}</b> páginas y <b>{result.cards}</b> tarjetas para repasar.
                    </p>
                    <div className="cu-modal-foot center">
                      <button
                        className="btn ghost"
                        onClick={() => {
                          close()
                          nav(`/cuaderno/mapa?cuaderno=${result.bookId}`)
                        }}
                      >
                        <CIcon name="map" size={16} /> Ver en el mapa
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          close()
                          nav(`/cuaderno/c/${result.bookId}`)
                        }}
                      >
                        Abrir cuaderno
                      </button>
                    </div>
                  </>
                )
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>,
    document.body,
  )
}

/** El tema en el centro y sus páginas brotando alrededor, una por una, con su línea. */
function BuildGraph(p: { name: string; color: BookColor; titles: string[]; built: number; links: [number, number][] }) {
  const W = 560
  const H = 380
  const n = p.titles.length
  const pos = p.titles.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1)
    const ring = n > 8 && i % 2 === 1 ? 0.78 : 1
    return { x: W / 2 + Math.cos(ang) * 210 * ring, y: H / 2 + Math.sin(ang) * 138 * ring }
  })
  const clip = (s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s)
  return (
    <svg className="cu-build-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.name}: ${p.built} páginas creadas`} style={spine(p.color)}>
      {p.links.map(([a, b], i) =>
        a >= 0 && b >= 0 ? (
          <motion.line key={`x${i}`} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} className="cu-build-cross" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: i * 0.05 }} />
        ) : null,
      )}
      {pos.map((q, i) =>
        i < p.built ? (
          <motion.line key={`l${i}`} x1={W / 2} y1={H / 2} x2={q.x} y2={q.y} className="cu-build-edge" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.28 }} />
        ) : null,
      )}
      <g>
        <circle cx={W / 2} cy={H / 2 + 5} r={34} className="cu-build-hub-edge" />
        <motion.circle cx={W / 2} cy={H / 2} r={34} className="cu-build-hub" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} />
        <text x={W / 2} y={H / 2 + 56} textAnchor="middle" className="cu-build-name">
          {clip(p.name)}
        </text>
      </g>
      {pos.map((q, i) =>
        i < p.built ? (
          <motion.g key={`n${i}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 20 }} style={{ transformOrigin: `${q.x}px ${q.y}px` }}>
            <circle cx={q.x} cy={q.y + 3.5} r={13} className="cu-build-node-edge" />
            <circle cx={q.x} cy={q.y} r={13} className="cu-build-node" />
            <text x={q.x} y={q.y + 30} textAnchor="middle" className="cu-build-label">
              {clip(p.titles[i])}
            </text>
          </motion.g>
        ) : null,
      )}
    </svg>
  )
}

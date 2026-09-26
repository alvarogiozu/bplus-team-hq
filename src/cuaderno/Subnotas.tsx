import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import type { Editor } from '@tiptap/react'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toasts'
import { burst, haptic, pointOf } from '../lib/fx'
import { dividirNota, embedNotes, type Division } from './agent'
import { noteColorOf, pathOf, spine } from './books'
import { NONE, subnotesOf, useBooks, useCuadernoActions, useNotes, type Note, type Undo } from './data'
import { fold } from './graph'
import { CIcon, ItemIcon } from './icons'
import { NOTE_HREF, plain, splitByHeadings } from './text'

// Subnotas: una página que trata un tema grande (Termodinámica) se divide en sus puntos
// (Primera ley, Entropía…), que a su vez pueden dividirse. Viven en el mismo cuaderno que su tema,
// se ven debajo de él en el árbol y en el mapa, y Rockie las tiene en cuenta al conectar.

const byPos = (a: Note, b: Note) => a.position - b.position

export function SubnotesSection({ note, editor }: { note: Note; editor: Editor | null }) {
  const notes = useNotes().data ?? NONE
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const subs = useMemo(() => notes.filter((n) => n.parent_note_id === note.id).sort(byPos), [notes, note.id])
  const parent = note.parent_note_id ? notes.find((n) => n.id === note.parent_note_id) : undefined
  const [picking, setPicking] = useState(false)
  const [plan, setPlan] = useState<(Division & { how: 'titulos' | 'rockie' }) | null>(null)
  const [asking, setAsking] = useState(false)
  const byHeadings = useMemo(() => (note.kind === 'pagina' ? splitByHeadings(note.body) : { indice: '', partes: [] }), [note.body, note.kind])

  const add = async () => {
    const res = await actions.createNote({ title: 'Subnota sin título', area: note.area, book_id: note.book_id, parent_note_id: note.id })
    if (!res) return
    haptic(8)
    nav(`/cuaderno/nota/${res.note.id}?nueva=1`)
  }

  const askRockie = async () => {
    setAsking(true)
    haptic(8)
    const r = await dividirNota(note.id)
    setAsking(false)
    if (r.division) setPlan({ ...r.division, how: 'rockie' })
    else toast(r.error ?? 'Rockie no pudo dividirla.', { kind: 'err' })
  }

  return (
    <section className="cu-psec">
      <h2>
        <CIcon name="section" size={16} /> Subnotas <small>{subs.length || ''}</small>
        <button className="cu-linkbtn cu-psec-act" onClick={() => void add()}>
          <CIcon name="plus" size={14} /> Subnota
        </button>
      </h2>
      {parent && (
        <p className="cu-sub-parent">
          Es un punto de{' '}
          <Link to={`/cuaderno/nota/${parent.id}`}>
            <CIcon name="section" size={13} /> {parent.title}
          </Link>
          <button className="cu-linkbtn" onClick={() => void actions.setParent(note, null)}>
            Sacarla de ahí
          </button>
        </p>
      )}
      {subs.length > 0 ? (
        <ul className="cu-linklist cu-sublist">
          <AnimatePresence initial={false}>
            {subs.map((s) => {
              const inner = subnotesOf(notes, s.id).size
              return (
                <motion.li key={s.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <button onClick={() => nav(`/cuaderno/nota/${s.id}`)}>
                    <b>
                      <ItemIcon value={s.icon} fallback={s.kind === 'pizarra' ? 'board' : 'note'} size={14} /> {s.title}
                    </b>
                    <span>{inner ? `${inner} ${inner === 1 ? 'subnota' : 'subnotas'} adentro` : plain(s.body).slice(0, 80) || 'Vacía'}</span>
                  </button>
                  <button className="cu-x" aria-label={`Sacar ${s.title} de este tema`} title="Sacar de este tema (queda como página)" onClick={() => void actions.setParent(s, null)}>
                    <CIcon name="close" size={14} />
                  </button>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="cu-muted">¿Este tema tiene muchos puntos? Divídelo en subnotas: cada una se conecta a su manera y Rockie las tiene en cuenta.</p>
      )}
      <div className="cu-sub-acts">
        {byHeadings.partes.length >= 2 && (
          <button className="btn sm ghost" onClick={() => setPlan({ ...byHeadings, how: 'titulos' })}>
            <CIcon name="columns" size={15} /> Dividir por sus títulos ({byHeadings.partes.length})
          </button>
        )}
        {note.kind === 'pagina' && plain(note.body).length >= 300 && (
          <button className="btn sm ghost" onClick={() => void askRockie()} disabled={asking}>
            <CIcon name="sparkle" size={15} /> {asking ? 'Rockie está leyendo…' : 'Dividir con Rockie'}
          </button>
        )}
        <button className="btn sm ghost" onClick={() => setPicking(!picking)} aria-expanded={picking}>
          <CIcon name="section" size={15} /> {parent ? 'Cambiar de tema' : 'Hacerla subnota de…'}
        </button>
      </div>
      {picking && <ParentPicker note={note} onDone={() => setPicking(false)} />}
      <Sheet open={Boolean(plan)} onClose={() => setPlan(null)} title={plan?.how === 'rockie' ? 'Rockie propone estas subnotas' : 'Dividir por títulos'}>
        {plan && <SplitPreview note={note} plan={plan} editor={editor} onDone={() => setPlan(null)} />}
      </Sheet>
    </section>
  )
}

/** Elegir el tema del que esta página es un punto (no ella misma ni sus subnotas). */
function ParentPicker({ note, onDone }: { note: Note; onDone: () => void }) {
  const notes = useNotes().data ?? NONE
  const books = useBooks().data ?? NONE
  const actions = useCuadernoActions()
  const [find, setFind] = useState('')
  const f = fold(find.trim())
  const list = useMemo(() => {
    const inner = subnotesOf(notes, note.id)
    return notes
      .filter((n) => n.id !== note.id && n.id !== note.parent_note_id && !inner.has(n.id) && (!f || fold(n.title).includes(f)))
      .slice(0, 8)
  }, [notes, note.id, note.parent_note_id, f])
  return (
    <div className="cu-connect-pick">
      <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="¿De qué tema es un punto?" aria-label="Buscar el tema" onKeyDown={(e) => e.key === 'Escape' && onDone()} />
      {list.map((n) => {
        const c = noteColorOf(books, n)
        return (
          <button
            key={n.id}
            style={c ? spine(c) : undefined}
            onClick={async () => {
              if (await actions.setParent(note, n.id)) onDone()
            }}
          >
            <ItemIcon value={n.icon} fallback={n.kind === 'pizarra' ? 'board' : 'note'} size={14} className="cu-connect-ico" />
            <span>
              <b>{n.title}</b>
              <small>{pathOf(books, n.book_id)}</small>
            </span>
          </button>
        )
      })}
      {!list.length && <p className="cu-muted">Nada con ese nombre.</p>}
    </div>
  )
}

/** La división antes de hacerla: qué subnotas nacen; lo que desmarcas se queda en la página como sección. */
function SplitPreview({ note, plan, editor, onDone }: { note: Note; plan: Division & { how: string }; editor: Editor | null; onDone: () => void }) {
  const actions = useCuadernoActions()
  const [keep, setKeep] = useState<boolean[]>(() => plan.partes.map(() => true))
  const [titles, setTitles] = useState(() => plan.partes.map((p) => p.titulo))
  const [busy, setBusy] = useState(false)
  const n = keep.filter(Boolean).length

  const setBody = (md: string) => {
    // por el editor, para que el guardado automático de la página no lo pise
    if (editor && !editor.isDestroyed) editor.commands.setContent(md, { contentType: 'markdown', emitUpdate: true })
    else void actions.updateNote(note.id, { body: md })
  }

  const apply = async (el: HTMLElement) => {
    if (!n || busy) return
    setBusy(true)
    const before = note.body
    const undos: Undo[] = []
    const made: { id: string; title: string }[] = []
    const stay: string[] = []
    const base = Date.now() / 1000
    for (let i = 0; i < plan.partes.length; i++) {
      const p = plan.partes[i]
      const title = titles[i].trim() || p.titulo
      if (!keep[i]) {
        stay.push(`## ${title}\n\n${p.cuerpo}`)
        continue
      }
      const res = await actions.createNote({ title, body: p.cuerpo, area: note.area, book_id: note.book_id, parent_note_id: note.id, position: base + i / 1000 })
      if (!res) continue
      undos.push(res.undo)
      made.push({ id: res.note.id, title: res.note.title })
    }
    setBusy(false)
    if (!made.length) return
    // la página madre queda como índice del tema: su introducción, los enlaces a sus puntos y lo que no se dividió
    const index = [plan.indice.trim(), made.map((m) => `- [${m.title}](${NOTE_HREF}${m.id})`).join('\n'), ...stay].filter(Boolean).join('\n\n')
    setBody(index)
    embedNotes([note.id, ...made.map((m) => m.id)])
    const pt = pointOf(el)
    burst(pt.x, pt.y, 16)
    haptic([8, 24, 8])
    onDone()
    toast(`Dividiste «${note.title}» en ${made.length} subnotas`, {
      kind: 'ok',
      icon: 'check',
      action: {
        label: 'Deshacer',
        onClick: async () => {
          for (const u of undos.reverse()) await u()
          setBody(before)
        },
      },
    })
  }

  return (
    <div className="cu-split">
      {plan.indice && (
        <div className="cu-split-intro">
          <small>Queda en «{note.title}» como introducción</small>
          <p>{plain(plan.indice).slice(0, 280)}</p>
        </div>
      )}
      <ol className="cu-split-list">
        {plan.partes.map((p, i) => (
          <motion.li key={i} className={keep[i] ? '' : 'off'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
            <label className="cu-split-check">
              <input type="checkbox" checked={keep[i]} onChange={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))} aria-label={`Crear la subnota ${titles[i]}`} />
            </label>
            <div>
              <input className="cu-split-title" value={titles[i]} maxLength={160} onChange={(e) => setTitles((t) => t.map((v, j) => (j === i ? e.target.value : v)))} aria-label="Título de la subnota" />
              <p>{plain(p.cuerpo).slice(0, 200) || 'Sin contenido'}</p>
            </div>
          </motion.li>
        ))}
      </ol>
      <p className="cu-muted">Lo que desmarques se queda en la página como una sección. Todo se puede deshacer.</p>
      <div className="cu-set-btns">
        <button className="btn" onClick={(e) => void apply(e.currentTarget)} disabled={!n || busy}>
          <CIcon name="section" size={16} /> {busy ? 'Creando…' : `Crear ${n} ${n === 1 ? 'subnota' : 'subnotas'}`}
        </button>
        <button className="btn ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

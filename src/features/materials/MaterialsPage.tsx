import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { SelectorEquipo } from '../spaces/SelectorEquipo'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { ColorPick, Select, type Opt } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { ListSkeleton, LoadError } from '../../components/States'
import { PALETTE } from '../../lib/colors'
import { fmtDay, timeAgo } from '../../lib/dates'
import { useSpaceRow } from '../data/queries'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { NotePick } from './NotePick'
import { HeadBtn, MHead } from '../movil/bits'
import { useIsMobile } from '../../lib/useMedia'
import {
  fileKind,
  fmtBytes,
  folderSubtree,
  KIND_COLOR,
  KIND_LABEL,
  openMaterial,
  serviceOf,
  useFolders,
  useMaterialActions,
  useMaterials,
  useSignedUrl,
  type Folder,
  type Material,
} from './data'

// Materiales: los archivos y enlaces del equipo, por carpetas de colores. Se sube arrastrando
// desde la computadora (a la carpeta abierta o soltando sobre otra), se mueve arrastrando una
// tarjeta a una carpeta o a la ruta de arriba, y todo lo de Drive/Docs/Figma entra como enlace.

const DRAG_TYPE = 'application/x-material'

// la Red y el Mapa del proyecto (con las vistas del Cuaderno): se cargan solo si los abres
const RedProyecto = lazy(() => import('./VistasProyecto').then((m) => ({ default: m.RedProyecto })))
const MapaProyecto = lazy(() => import('./VistasProyecto').then((m) => ({ default: m.MapaProyecto })))
type Vista = 'lista' | 'red' | 'mapa'
const VISTAS: { key: Vista; label: string; icon: 'tasks' | 'tree' | 'gantt' }[] = [
  { key: 'lista', label: 'Lista', icon: 'tasks' },
  { key: 'red', label: 'Red', icon: 'tree' },
  { key: 'mapa', label: 'Mapa', icon: 'gantt' },
]

export default function MaterialsPage() {
  const fq = useFolders()
  const mq = useMaterials()
  const space = useSpaceRow().data
  const [params, setParams] = useSearchParams()
  const folderId = params.get('carpeta')
  const folders = useMemo(() => fq.data ?? [], [fq.data])
  const materials = useMemo(() => mq.data ?? [], [mq.data])
  const current = folderId ? folders.find((f) => f.id === folderId) : undefined
  const { uploadFiles, updateMaterial } = useMaterialActions()
  const [q, setQ] = useState('')
  const [pending, setPending] = useState<{ id: string; name: string }[]>([])
  const [dropping, setDropping] = useState(false)
  const [folderDialog, setFolderDialog] = useState<{ edit?: Folder } | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  // una nota del Cuaderno compartida se abre encima (la URL manda: ?nota=<id>)
  const notaId = params.get('nota')
  const openNote = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('nota', id)
    next.delete('material')
    setParams(next)
  }
  const closeNote = () => {
    const next = new URLSearchParams(params)
    next.delete('nota')
    setParams(next)
  }
  const [addOpen, setAddOpen] = useState(false)
  const mobile = useIsMobile()
  // Lista · Red · Mapa (la URL manda: ?vista=); en el celular se entra al Mapa
  const pedida = params.get('vista') as Vista | null
  const vista: Vista = pedida && VISTAS.some((v) => v.key === pedida) ? pedida : mobile ? 'mapa' : 'lista'
  const setVista = (v: Vista) => {
    const next = new URLSearchParams(params)
    next.set('vista', v)
    setParams(next)
  }
  const abrirEnVista = {
    material: (m: Material) => (m.kind === 'note' && m.note_id ? openNote(m.note_id) : openDetails(m.id)),
    // una carpeta se abre en la Lista
    carpeta: (id: string | null) => {
      const next = new URLSearchParams(params)
      next.set('vista', 'lista')
      if (id) next.set('carpeta', id)
      else next.delete('carpeta')
      setParams(next)
    },
  }
  const fileInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const go = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('carpeta', id)
    else next.delete('carpeta')
    next.delete('material')
    setParams(next)
    setQ('')
  }
  const openDetails = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('material', id)
    setParams(next)
  }

  const crumbs = useMemo(() => {
    const out: Folder[] = []
    for (let f = current; f; f = f.parent_id ? folders.find((x) => x.id === f!.parent_id) : undefined) out.unshift(f)
    return out
  }, [current, folders])

  const needle = q.trim().toLowerCase()
  const shownFolders = needle ? folders.filter((f) => f.name.toLowerCase().includes(needle)) : folders.filter((f) => (f.parent_id ?? null) === (folderId ?? null))
  const shownItems = needle
    ? materials.filter((m) => `${m.name} ${m.note} ${m.url ?? ''}`.toLowerCase().includes(needle))
    : materials.filter((m) => (m.folder_id ?? null) === (folderId ?? null))

  const used = materials.reduce((s, m) => s + (m.kind === 'file' ? Number(m.size_bytes) : 0), 0)
  const limit = Number(space?.storage_limit_bytes ?? 1073741824)

  const countIn = (f: Folder) => {
    const ids = folderSubtree(folders, f.id)
    return materials.filter((m) => m.folder_id && ids.has(m.folder_id)).length
  }

  async function upload(files: File[], target: string | null) {
    if (!files.length) return
    const batch = files.map((f) => ({ id: crypto.randomUUID(), name: f.name }))
    setPending((p) => [...p, ...batch])
    let i = 0
    await uploadFiles(files, target, () => {
      const done = batch[i++]
      setPending((p) => p.filter((x) => x.id !== done?.id))
    })
  }

  // soltar archivos de la computadora en cualquier parte de la página
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return
    dragDepth.current++
    setDropping(true)
  }
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (!dragDepth.current) setDropping(false)
  }
  const onDrop = (e: DragEvent, target: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDropping(false)
    const moving = e.dataTransfer.getData(DRAG_TYPE)
    if (moving) {
      const m = materials.find((x) => x.id === moving)
      if (m && (m.folder_id ?? null) !== target) {
        const name = target ? folders.find((f) => f.id === target)?.name ?? 'la carpeta' : 'Materiales'
        void updateMaterial(m.id, { folder_id: target }, `«${m.name}» se movió a ${name}`)
      }
      return
    }
    void upload(Array.from(e.dataTransfer.files), target)
  }
  const allowDrop = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_TYPE) ? 'move' : 'copy'
  }

  const loading = fq.isLoading || mq.isLoading
  const error = fq.error ?? mq.error

  return (
    <div className="content mpage" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={allowDrop} onDrop={(e) => onDrop(e, folderId)}>
      {mobile && (
        <>
          <MHead kicker={<Link to="/equipo" className="em-back"><Icon name="collapse" className="sm" /> Equipo</Link>} title="Materiales">
            <HeadBtn icon="plus" label="Agregar material" solid onClick={() => setAddOpen(true)} />
          </MHead>
          <Meter used={used} limit={limit} />
          <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Agregar">
            <div className="em-addlist">
              <button onClick={() => { setAddOpen(false); fileInput.current?.click() }} style={{ ['--tc' as string]: 'var(--accent)' } as CSSProperties}>
                <span className="em-tile-ic"><Icon name="upload" /></span>
                <span><b>Subir archivos</b><small>Fotos, PDF, videos… hasta 50 MB cada uno</small></span>
              </button>
              <button onClick={() => { setAddOpen(false); setLinkOpen(true) }} style={{ ['--tc' as string]: 'var(--berry)' } as CSSProperties}>
                <span className="em-tile-ic"><Icon name="link" /></span>
                <span><b>Enlace</b><small>Drive, Docs, Figma, YouTube…</small></span>
              </button>
              <button onClick={() => { setAddOpen(false); setNoteOpen(true) }} style={{ ['--tc' as string]: 'var(--accent)' } as CSSProperties}>
                <span className="em-tile-ic"><Icon name="notebook" /></span>
                <span><b>Nota del cuaderno</b><small>La editan todos a la vez, como Google Docs</small></span>
              </button>
              <button onClick={() => { setAddOpen(false); setFolderDialog({}) }} style={{ ['--tc' as string]: 'var(--amber)' } as CSSProperties}>
                <span className="em-tile-ic"><Icon name="folder" /></span>
                <span><b>Carpeta</b><small>{current ? `Dentro de «${current.name}»` : 'Para ordenar por tema'}</small></span>
              </button>
            </div>
          </Sheet>
        </>
      )}
      <header className="pagehead" hidden={mobile}>
        <div>
          <h1>Materiales</h1>
          <div className="sub">Archivos y enlaces del equipo, por carpetas. Arrastra archivos aquí para subirlos.</div>
          <SelectorEquipo />
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Meter used={used} limit={limit} />
          <button className="btn ghost sm" onClick={() => setFolderDialog({})}>
            <Icon name="folder" className="sm" /> Carpeta
          </button>
          <button className="btn ghost sm" onClick={() => setNoteOpen(true)}>
            <Icon name="notebook" className="sm" /> Nota
          </button>
          <button className="btn ghost sm" onClick={() => setLinkOpen(true)}>
            <Icon name="link" className="sm" /> Enlace
          </button>
          <button className="btn sm" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" className="sm" /> Subir archivos
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            aria-label="Elegir archivos para subir"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []), folderId)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="mbar">
        <nav className="mcrumbs" aria-label="Carpeta actual">
          <button className={!current ? 'on' : ''} onClick={() => go(null)} onDragOver={allowDrop} onDrop={(e) => onDrop(e, null)}>
            <Icon name="folder" className="sm" /> Materiales
          </button>
          {crumbs.map((f) => (
            <span key={f.id} className="mcrumb">
              <Icon name="expand" className="sm" />
              <button className={f.id === folderId ? 'on' : ''} onClick={() => go(f.id)} onDragOver={allowDrop} onDrop={(e) => onDrop(e, f.id)} style={{ ['--fc' as string]: f.color } as CSSProperties}>
                <i />
                {f.name}
              </button>
            </span>
          ))}
          {current && (
            <button className="iconbtn flat" aria-label={`Editar la carpeta ${current.name}`} onClick={() => setFolderDialog({ edit: current })}>
              <Icon name="edit" className="sm" />
            </button>
          )}
        </nav>
        <label className="msearch">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en todos los materiales" aria-label="Buscar en todos los materiales" />
        </label>
        <div className="segmented slide mvistas" role="tablist" aria-label="Vista de los materiales">
          {VISTAS.map((v) => (
            <button key={v.key} role="tab" aria-selected={vista === v.key} onClick={() => setVista(v.key)}>
              {vista === v.key && <motion.span layoutId="mvista-ind" className="seg-ind" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
              <span className="seg-lbl">
                <Icon name={v.icon} className="sm" /> <span className="seg-txt">{v.label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>


      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <LoadError error={error} onRetry={() => void (fq.refetch(), mq.refetch())} />
      ) : vista !== 'lista' && !needle ? (
        <Suspense fallback={<ListSkeleton rows={3} />}>
          {vista === 'red' ? (
            <RedProyecto titulo={space?.name ?? 'Proyecto'} folders={folders} materials={materials} abrir={abrirEnVista} />
          ) : (
            <MapaProyecto titulo={space?.name ?? 'Proyecto'} folders={folders} materials={materials} abrir={abrirEnVista} clave={`m.map.open.${space?.id ?? ''}`} />
          )}
        </Suspense>
      ) : (
        <>
          {shownFolders.length > 0 && (
            <section className="mfolders" aria-label="Carpetas">
              {shownFolders.map((f, i) => (
                <motion.button
                  key={f.id}
                  className="mfolder"
                  style={{ ['--fc' as string]: f.color } as CSSProperties}
                  onClick={() => go(f.id)}
                  onDragOver={allowDrop}
                  onDrop={(e) => onDrop(e, f.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.25) }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="mfolder-tab" aria-hidden="true" />
                  <Icon name="folder" />
                  <b>{f.name}</b>
                  <small>
                    {countIn(f)} {countIn(f) === 1 ? 'material' : 'materiales'}
                  </small>
                </motion.button>
              ))}
            </section>
          )}

          {(shownItems.length > 0 || pending.length > 0) && (
            <section className="mgrid" aria-label="Archivos y enlaces">
              {/* lo que se está subiendo: sin animación de salida (se va apenas llega la tarjeta real) */}
              {pending.map((p) => (
                <div key={p.id} className="mcard pending" aria-busy="true">
                  <div className="mthumb">
                    <span className="mspin" aria-hidden="true" />
                  </div>
                  <div className="mmeta">
                    <b>{p.name}</b>
                    <small>Subiendo…</small>
                  </div>
                </div>
              ))}
              <AnimatePresence initial={false}>
                {shownItems.map((m) => (
                  <Card
                    key={m.id}
                    m={m}
                    folder={needle && m.folder_id ? folders.find((f) => f.id === m.folder_id) : undefined}
                    onOpen={() => (m.kind === 'note' && m.note_id ? openNote(m.note_id) : openDetails(m.id))}
                  />
                ))}
              </AnimatePresence>
            </section>
          )}

          {shownFolders.length === 0 && shownItems.length === 0 && pending.length === 0 && (
            <div className="mempty">
              <Icon name="folder" />
              <h3>{needle ? `Nada con «${q}»` : current ? 'Esta carpeta está vacía' : 'Todavía no hay materiales'}</h3>
              {!needle && (
                <p className="hint">
                  Arrastra archivos aquí (hasta 50 MB cada uno) o agrega enlaces de Drive, Docs, Figma o YouTube.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {dropping && (
          <motion.div className="mdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div>
              <Icon name="upload" />
              <b>Suelta para subir a {current ? `«${current.name}»` : 'Materiales'}</b>
              <small>O suéltalo sobre otra carpeta</small>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MaterialSheet folders={folders} materials={materials} />
      {folderDialog && <FolderDialog edit={folderDialog.edit} parentId={folderId} folders={folders} onClose={() => setFolderDialog(null)} onDeleted={() => go(folderDialog.edit?.parent_id ?? null)} />}
      {linkOpen && <LinkDialog folderId={folderId} onClose={() => setLinkOpen(false)} />}
      {noteOpen && <NotePick folderId={folderId} onClose={() => setNoteOpen(false)} onOpen={openNote} />}
      <AnimatePresence>
        {notaId && (
          <Suspense key={notaId} fallback={null}>
            <SharedNoteView noteId={notaId} onClose={closeNote} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  )
}

function Meter({ used, limit }: { used: number; limit: number }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 100
  return (
    <div className={`mmeter${pct > 85 ? ' full' : ''}`} title={`${fmtBytes(used)} de ${fmtBytes(limit)} usados`}>
      <span>
        {fmtBytes(used)} <small>de {fmtBytes(limit)}</small>
      </span>
      <i>
        <motion.b initial={{ width: 0 }} animate={{ width: `${Math.max(pct, used ? 2 : 0)}%` }} transition={{ type: 'spring', stiffness: 140, damping: 24 }} />
      </i>
      {pct > 85 && <small className="mmeter-pro">Más espacio con B+ Pro (pronto)</small>}
    </div>
  )
}

// el editor compartido (TipTap + Yjs) solo se descarga si abres una nota
const SharedNoteView = lazy(() => import('./SharedNote').then((x) => ({ default: x.SharedNoteView })))

function Thumb({ m }: { m: Material }) {
  const kind = m.kind === 'file' ? fileKind(m) : null
  const url = useSignedUrl(kind === 'image' ? m.storage_path : null)
  if (m.kind === 'note') {
    return (
      <div className="mthumb note">
        <span className="mnote-page" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="mbadge note">
          <Icon name="notebook" />
        </span>
      </div>
    )
  }
  if (m.kind === 'link') {
    const s = serviceOf(m.url ?? '')
    return (
      <div className="mthumb link" style={{ ['--kc' as string]: s.color } as CSSProperties}>
        <span className="mbadge">{s.letter}</span>
        <small>{s.name}</small>
      </div>
    )
  }
  if (kind === 'image' && url.data) {
    return (
      <div className="mthumb img">
        <img src={url.data} alt="" loading="lazy" />
      </div>
    )
  }
  const ext = (m.name.split('.').pop() ?? '').slice(0, 4).toUpperCase()
  return (
    <div className="mthumb" style={{ ['--kc' as string]: KIND_COLOR[kind ?? 'other'] } as CSSProperties}>
      <span className="mbadge file">
        <Icon name="file" />
        <em>{ext || '•'}</em>
      </span>
    </div>
  )
}

function Card({ m, folder, onOpen }: { m: Material; folder?: Folder; onOpen: () => void }) {
  const { memberById } = useLookup()
  const kind = m.kind === 'file' ? fileKind(m) : null
  return (
    <motion.div
      layout="position"
      className="mcard"
      role="button"
      tabIndex={0}
      aria-label={m.kind === 'note' ? `${m.name}: abrir la nota` : `${m.name}: ver detalles`}
      draggable
      // arrastre nativo (motion usa onDragStart para sus gestos): se engancha en captura
      onDragStartCapture={(e: DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData(DRAG_TYPE, m.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onOpen}
      onDoubleClick={() => (m.kind === 'note' ? onOpen() : void openMaterial(m))}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -3 }}
    >
      <Thumb m={m} />
      <div className="mmeta">
        <b title={m.name}>{m.name}</b>
        <small>
          {m.kind === 'note' ? 'Nota del cuaderno · editan todos' : m.kind === 'link' ? serviceOf(m.url ?? '').name : `${KIND_LABEL[kind ?? 'other']} · ${fmtBytes(Number(m.size_bytes))}`}
          {folder ? ` · en ${folder.name}` : ''}
        </small>
      </div>
      <div className="mfoot">
        <MemberAvatar member={memberById.get(m.created_by ?? '')} size={20} />
        <small>{timeAgo(m.created_at)}</small>
        <button
          className="iconbtn flat"
          aria-label={`Abrir ${m.name}`}
          title="Abrir"
          onClick={(e) => {
            e.stopPropagation()
            if (m.kind === 'note') onOpen()
            else void openMaterial(m)
          }}
        >
          <Icon name="arrow" className="sm" />
        </button>
      </div>
    </motion.div>
  )
}

/** Detalle de un material (la URL manda: ?material=<id>). */
function MaterialSheet({ folders, materials }: { folders: Folder[]; materials: Material[] }) {
  const [params, setParams] = useSearchParams()
  const id = params.get('material')
  const m = materials.find((x) => x.id === id)
  const close = () => {
    const next = new URLSearchParams(params)
    next.delete('material')
    setParams(next, { replace: true })
  }
  if (!id) return null
  return (
    <Sheet open onClose={close} variant="drawer" title={m ? (m.kind === 'link' ? 'Enlace' : 'Archivo') : 'Material no encontrado'}>
      {m ? <MaterialBody key={m.id} m={m} folders={folders} onGone={close} /> : <p className="hint">Puede que alguien lo haya borrado.</p>}
    </Sheet>
  )
}

function MaterialBody({ m, folders, onGone }: { m: Material; folders: Folder[]; onGone: () => void }) {
  const { memberById } = useLookup()
  const { updateMaterial, removeMaterial } = useMaterialActions()
  const [name, setName] = useState(m.name)
  const [note, setNote] = useState(m.note)
  const [sure, setSure] = useState(false)
  const kind = m.kind === 'file' ? fileKind(m) : null
  const img = useSignedUrl(kind === 'image' ? m.storage_path : null)
  useEffect(() => setName(m.name), [m.name])
  useEffect(() => setNote(m.note), [m.note])
  const folderOpts: Opt<string>[] = [{ value: '', label: 'Materiales (sin carpeta)', visual: <Icon name="folder" className="sm" /> }, ...folders.map((f) => ({ value: f.id, label: f.name, color: f.color }))]
  const author = memberById.get(m.created_by ?? '')

  return (
    <>
      {img.data ? (
        <a className="mpreview" href={img.data} target="_blank" rel="noopener noreferrer">
          <img src={img.data} alt={m.name} />
        </a>
      ) : (
        <div className="mpreview small">
          <Thumb m={m} />
        </div>
      )}
      <textarea
        className="titleedit"
        rows={2}
        value={name}
        aria-label="Nombre"
        maxLength={200}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const t = name.trim()
          if (t && t !== m.name) void updateMaterial(m.id, { name: t })
          else setName(m.name)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLTextAreaElement).blur()
          }
        }}
      />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => void openMaterial(m)}>
          <Icon name="arrow" className="sm" /> Abrir
        </button>
        {m.kind === 'file' ? (
          <button className="btn ghost sm" onClick={() => void openMaterial(m, true)}>
            <Icon name="download" className="sm" /> Descargar
          </button>
        ) : (
          <button className="btn ghost sm" onClick={() => void navigator.clipboard?.writeText(m.url ?? '')}>
            <Icon name="copy" className="sm" /> Copiar enlace
          </button>
        )}
      </div>
      <div className="props">
        <span>Carpeta</span>
        <Select
          label="Carpeta"
          variant="field"
          searchable
          value={m.folder_id ?? ''}
          onChange={(v) => void updateMaterial(m.id, { folder_id: v || null }, `«${m.name}» se movió a ${v ? folders.find((f) => f.id === v)?.name : 'Materiales'}`)}
          options={folderOpts}
        />
        <span>{m.kind === 'link' ? 'Enlace' : 'Tipo'}</span>
        <span className="mprop">{m.kind === 'link' ? <a href={m.url ?? '#'} target="_blank" rel="noopener noreferrer">{(m.url ?? '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a> : `${KIND_LABEL[kind ?? 'other']} · ${fmtBytes(Number(m.size_bytes))}`}</span>
        <span>Subido</span>
        <span className="mprop row">
          <MemberAvatar member={author} size={20} /> {author?.profile.display_name ?? 'Alguien'} · {fmtDay(m.created_at.slice(0, 10))}
        </span>
      </div>
      <label className="lbl" htmlFor="mt-n">Nota</label>
      <textarea id="mt-n" value={note} maxLength={500} placeholder="Para qué sirve, qué versión es…" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== m.note && void updateMaterial(m.id, { note })} />
      <div className="row" style={{ marginTop: 20 }}>
        <span className="spacer" />
        {sure ? (
          <>
            <span className="hint">¿Borrar para todo el equipo?</span>
            <button className="btn ghost sm" onClick={() => setSure(false)}>No</button>
            <button
              className="btn danger sm"
              onClick={async () => {
                await removeMaterial(m)
                onGone()
              }}
            >
              Sí, borrar
            </button>
          </>
        ) : (
          <button className="btn danger sm" onClick={() => setSure(true)}>
            <Icon name="trash" className="sm" /> Borrar
          </button>
        )}
      </div>
    </>
  )
}

function FolderDialog({ edit, parentId, folders, onClose, onDeleted }: { edit?: Folder; parentId: string | null; folders: Folder[]; onClose: () => void; onDeleted: () => void }) {
  const { createFolder, updateFolder, removeFolder } = useMaterialActions()
  const [name, setName] = useState(edit?.name ?? '')
  const [color, setColor] = useState(edit?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)])
  const [parent, setParent] = useState(edit ? edit.parent_id ?? '' : parentId ?? '')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const banned = edit ? folderSubtree(folders, edit.id) : new Set<string>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const row = { name: name.trim(), color, parent_id: parent || null }
    const ok = edit ? await updateFolder(edit.id, row) : await createFolder(row)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={edit ? 'Carpeta' : 'Nueva carpeta'}
      footer={
        <>
          <button className="btn" form="mfolder" disabled={busy || !name.trim()}>{edit ? 'Guardar' : 'Crear carpeta'}</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancelar</button>
          {edit && (
            <>
              <span className="spacer" />
              {sure ? (
                <button
                  className="btn danger sm"
                  type="button"
                  onClick={async () => {
                    await removeFolder(edit)
                    onClose()
                    onDeleted()
                  }}
                >
                  Sí, borrar todo
                </button>
              ) : (
                <button className="btn danger sm" type="button" onClick={() => setSure(true)} aria-label="Borrar carpeta">
                  <Icon name="trash" className="sm" />
                </button>
              )}
            </>
          )}
        </>
      }
    >
      <form id="mfolder" onSubmit={submit}>
        <label className="lbl" htmlFor="mf-n">Nombre</label>
        <div className="row" style={{ gap: 10 }}>
          <ColorPick value={color} onChange={setColor} palette={PALETTE} label="Color de la carpeta" size={34} />
          <input id="mf-n" data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ej: Diseño de la carcasa" style={{ flex: 1 }} />
        </div>
        <div>
          <div>
            <label className="lbl" htmlFor="mf-in">Dentro de</label>
            <Select
              id="mf-in"
              label="Dentro de"
              variant="field"
              searchable
              value={parent}
              onChange={setParent}
              options={[{ value: '', label: 'Materiales', visual: <Icon name="folder" className="sm" /> }, ...folders.filter((f) => !banned.has(f.id)).map((f) => ({ value: f.id, label: f.name, color: f.color }))]}
            />
          </div>
        </div>
        {sure && <p className="formerror">Se borran la carpeta, sus subcarpetas y todos sus archivos para todo el equipo.</p>}
      </form>
    </Sheet>
  )
}

function LinkDialog({ folderId, onClose }: { folderId: string | null; onClose: () => void }) {
  const { addLink } = useMaterialActions()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const svc = url.trim() ? serviceOf(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    const ok = await addLink({ url, name, folderId })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Agregar enlace"
      footer={
        <>
          <button className="btn" form="mlink" disabled={busy || !url.trim()}>Agregar</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancelar</button>
        </>
      }
    >
      <form id="mlink" onSubmit={submit}>
        <label className="lbl" htmlFor="ml-u">Enlace</label>
        <input id="ml-u" data-autofocus inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pega un enlace de Drive, Docs, Figma, YouTube…" />
        {svc && (
          <p className="hint mlink-svc" style={{ ['--kc' as string]: svc.color } as CSSProperties}>
            <span className="mbadge">{svc.letter}</span> {svc.name}
          </p>
        )}
        <label className="lbl" htmlFor="ml-n">Nombre (opcional)</label>
        <input id="ml-n" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={svc?.name ?? 'Cómo lo va a encontrar el equipo'} />
      </form>
    </Sheet>
  )
}

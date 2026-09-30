import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toasts'
import { useMemberships } from '../features/spaces/SpaceProvider'
import { burst, haptic, pointOf } from '../lib/fx'
import { supabase } from '../lib/supabase'
import type { Peer } from './collab'
import { useCuadernoActions, type Note } from './data'
import { CIcon } from './icons'

// Compartir una página con el equipo: aparece en Materiales y todos la editan a la vez (como
// Google Docs). Sigue siendo de quien la escribió: vive en su Cuaderno y la deja de compartir cuando quiera.

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

/** Mientras se conecta al documento en vivo de una nota compartida. */
export function LiveWait({ status, onRetry }: { status: string; onRetry?: () => void }) {
  if (status === 'error')
    return (
      <p className="cu-live-wait err" role="alert">
        No se pudo conectar con la nota compartida.
        {onRetry && (
          <button className="cu-linkbtn" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </p>
    )
  return (
    <p className="cu-live-wait" aria-busy="true">
      <span className="rk-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {status === 'waiting' ? 'Tu equipo está abriendo la nota…' : 'Conectando con tu equipo…'}
    </p>
  )
}

/** Quién está en la página ahora mismo (sus cursores llevan el mismo color). */
export function PeerStack({ peers, max = 4 }: { peers: Peer[]; max?: number }) {
  return (
    <AnimatePresence initial={false}>
      {peers.length > 0 && (
        <motion.span
          className="cu-peers"
          role="img"
          aria-label={`Editando ahora: ${peers.map((p) => p.name).join(', ')}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
        >
          {peers.slice(0, max).map((p) => (
            <i
              key={p.id}
              style={{ ['--pc' as string]: p.color } as CSSProperties}
              title={`${p.name} está aquí`}
            >
              {initial(p.name)}
            </i>
          ))}
          {peers.length > max && <i className="more">+{peers.length - max}</i>}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

export function ShareButton({ note, mobile, peers }: { note: Note; mobile: boolean; peers: Peer[] }) {
  const [open, setOpen] = useState(false)
  const shared = Boolean(note.space_id)
  const label = shared ? 'Compartida con tu equipo' : 'Compartir con el equipo'
  return (
    <>
      <PeerStack peers={peers} />
      <button
        className={`${mobile ? 'iconbtn' : 'btn ghost sm'} cu-sharebtn${shared ? ' on' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <CIcon name="team" size={mobile ? 18 : 15} />
        {!mobile && (shared ? 'Compartida' : 'Compartir')}
      </button>
      <ShareSheet note={note} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function ShareSheet({ note, open, onClose }: { note: Note; open: boolean; onClose: () => void }) {
  const actions = useCuadernoActions()
  const spaces = useMemberships().data ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const space = note.space_id ?? picked ?? spaces[0]?.space_id ?? null
  const spaceName = spaces.find((s) => s.space_id === space)?.name ?? 'tu equipo'
  const [folder, setFolder] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const folders = useQuery({
    queryKey: ['share-folders', space],
    enabled: open && Boolean(space) && !note.space_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_folders')
        .select('id, name, color, parent_id')
        .eq('space_id', space!)
        .order('position')
        .order('name')
      if (error) throw error
      return data ?? []
    },
  }).data

  async function share(el: HTMLElement) {
    if (!space) return
    setBusy(true)
    const id = await actions.shareNote(note, space, folder)
    setBusy(false)
    if (!id) return
    const pt = pointOf(el)
    burst(pt.x, pt.y, 18)
    haptic([8, 24, 8])
    toast(`Compartida con «${spaceName}»: ya está en Materiales`, { kind: 'ok', icon: 'check' })
  }

  async function stop() {
    setBusy(true)
    const ok = await actions.unshareNote(note)
    setBusy(false)
    setSure(false)
    if (ok) toast('Dejaste de compartirla: vuelve a ser solo tuya')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={note.space_id ? 'Compartida con tu equipo' : 'Compartir con el equipo'}
    >
      <div className="cu-share">
        {note.space_id ? (
          <>
            <p className="cu-share-state">
              <span className="cu-share-ico" aria-hidden="true">
                <CIcon name="team" size={18} />
              </span>
              <span>
                <b>En Materiales de «{spaceName}»</b>
                <small>
                  Todos en el equipo pueden abrirla y escribir a la vez; ves sus cursores con su nombre.
                </small>
              </span>
            </p>
            <div className="cu-share-acts">
              <Link className="btn sm" to={`/materiales?nota=${note.id}`} onClick={onClose}>
                <CIcon name="folder" size={15} /> Ver en Materiales
              </Link>
              {sure ? (
                <>
                  <span className="cu-muted">¿Dejar de compartirla?</span>
                  <button className="btn ghost sm" onClick={() => setSure(false)}>
                    No
                  </button>
                  <button className="btn danger sm" disabled={busy} onClick={() => void stop()}>
                    Sí, que sea solo mía
                  </button>
                </>
              ) : (
                <button className="btn ghost sm" onClick={() => setSure(true)}>
                  Dejar de compartir
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="cu-muted" style={{ margin: 0 }}>
              Tu equipo la verá en <b>Materiales</b> y podrán escribir en ella a la vez, como en Google Docs.
              Sigue siendo tuya: la dejas de compartir cuando quieras.
            </p>
            {spaces.length > 1 && (
              <>
                <span className="cu-share-lbl">Equipo</span>
                <div className="cu-share-chips" role="radiogroup" aria-label="Equipo">
                  {spaces.map((s) => (
                    <button
                      key={s.space_id}
                      role="radio"
                      aria-checked={s.space_id === space}
                      className={`cu-chip${s.space_id === space ? ' on' : ''}`}
                      onClick={() => setPicked(s.space_id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {folders && folders.length > 0 && (
              <>
                <span className="cu-share-lbl">Carpeta en Materiales</span>
                <div className="cu-share-chips" role="radiogroup" aria-label="Carpeta en Materiales">
                  <button
                    role="radio"
                    aria-checked={folder === null}
                    className={`cu-chip${folder === null ? ' on' : ''}`}
                    onClick={() => setFolder(null)}
                  >
                    Sin carpeta
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      role="radio"
                      aria-checked={folder === f.id}
                      className={`cu-chip${folder === f.id ? ' on' : ''}`}
                      style={{ ['--fc' as string]: f.color } as CSSProperties}
                      onClick={() => setFolder(f.id)}
                    >
                      <i className="cu-share-dot" aria-hidden="true" /> {f.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {note.kind === 'pizarra' ? (
              <p className="cu-muted">Por ahora se comparten páginas; las pizarras todavía no.</p>
            ) : (
              <button
                className="btn block"
                disabled={busy || !space}
                onClick={(e) => void share(e.currentTarget)}
              >
                <CIcon name="team" size={16} /> Compartir con «{spaceName}»
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

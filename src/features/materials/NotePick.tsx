import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { toast, toastError } from '../../components/Toasts'
import { timeAgo } from '../../lib/dates'
import { haptic } from '../../lib/fx'
import { humanError, supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useSpace } from '../spaces/SpaceProvider'
import { recifrarNota } from '../../cuaderno/recifrar'

// "Agregar → Nota del cuaderno": una página nueva para el equipo, o una de tu Cuaderno que quieras
// compartir. Queda en Materiales (en la carpeta abierta) y todos la editan a la vez.

type MyNote = { id: string; title: string; updated_at: string; space_id: string | null }

export function NotePick({
  folderId,
  onClose,
  onOpen,
}: {
  folderId: string | null
  onClose: () => void
  onOpen: (noteId: string) => void
}) {
  const { userId } = useAuth()
  const { spaceId } = useSpace()
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const notesQ = useQuery({
    queryKey: ['my-notes-to-share', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyNote[]> => {
      const { data, error } = await supabase
        .from('cuaderno_notes')
        .select('id, title, updated_at, space_id')
        .eq('user_id', userId!)
        .eq('kind', 'pagina')
        .order('updated_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data ?? []
    },
  })
  const needle = q.trim().toLowerCase()
  const list = useMemo(
    () => (notesQ.data ?? []).filter((n) => !needle || n.title.toLowerCase().includes(needle)).slice(0, 40),
    [notesQ.data, needle],
  )

  async function share(noteId: string) {
    if (!spaceId) return
    setBusy(noteId)
    const { error } = await supabase.rpc('share_note', {
      nid: noteId,
      p_space: spaceId,
      p_folder: folderId ?? undefined,
    })
    if (!error) await recifrarNota(noteId) // ahora con la llave de la página, que recibe el equipo
    setBusy(null)
    if (error) {
      toastError(humanError(error))
      return
    }
    haptic([8, 24, 8])
    onClose()
    onOpen(noteId)
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t || !spaceId) return
    setBusy('new')
    const { data, error } = await supabase
      .from('cuaderno_notes')
      .insert({
        title: t.slice(0, 160),
        body: '',
        area: 'proyectos',
        kind: 'pagina',
        position: Date.now() / 1000,
      })
      .select('id')
      .single()
    if (error || !data) {
      setBusy(null)
      toastError(humanError(error))
      return
    }
    await share(data.id)
    toast(`«${t}» está en Materiales y en tu Cuaderno (Sueltas)`, { kind: 'ok' })
  }

  return (
    <Sheet open onClose={onClose} title="Nota del cuaderno">
      <div className="mnotepick">
        <p className="hint" style={{ margin: 0 }}>
          Todos en el equipo la podrán abrir y escribir a la vez, como en Google Docs. Sigue siendo de quien
          la escribió: vive en su Cuaderno.
        </p>
        <form className="mnotepick-new" onSubmit={create}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder="Nota nueva: ej. Minuta de la reunión"
            aria-label="Título de la nota nueva"
          />
          <button className="btn sm" disabled={!title.trim() || busy !== null}>
            <Icon name="plus" className="sm" /> Crear
          </button>
        </form>
        <span className="mnotepick-lbl">O comparte una de tu Cuaderno</span>
        <label className="msearch">
          <Icon name="search" className="sm" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en tus páginas"
            aria-label="Buscar en tus páginas"
          />
        </label>
        {notesQ.isLoading ? (
          <p className="hint">Cargando tus páginas…</p>
        ) : list.length === 0 ? (
          <p className="hint">{needle ? `Nada con «${q}»` : 'Todavía no tienes páginas en tu Cuaderno.'}</p>
        ) : (
          <ul className="mnotepick-list">
            {list.map((n) => {
              const here = n.space_id === spaceId
              return (
                <li key={n.id}>
                  <button
                    onClick={() => (here ? (onClose(), onOpen(n.id)) : void share(n.id))}
                    disabled={busy !== null}
                    aria-label={here ? `Abrir «${n.title}»` : `Compartir «${n.title}»`}
                  >
                    <span className="mnotepick-ic" aria-hidden="true">
                      <Icon name="notebook" className="sm" />
                    </span>
                    <span className="mnotepick-txt">
                      <b>{n.title}</b>
                      <small>
                        {here
                          ? 'Ya está en Materiales'
                          : n.space_id
                            ? 'Compartida con otro equipo'
                            : `Editada ${timeAgo(n.updated_at)}`}
                      </small>
                    </span>
                    <span className="mnotepick-go">{busy === n.id ? '…' : here ? 'Abrir' : 'Compartir'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { Icon } from '../../components/Icon'
import { humanError } from '../../lib/supabase'
import { isFirstToday, XP_PLAIN, XP_PROOF } from '../../lib/xp'
import { toastError } from '../../components/Toasts'
import { useSpace } from '../spaces/SpaceProvider'
import { useTasks, useXp } from '../data/queries'
import { useTaskActions } from './actions'
import { closeValidate, validateStore } from './dialogs'
import { useLookup } from './bits'
import { uploadProof } from './proofUpload'

// "¿Cómo lo validamos?" — Hecho (+40) o Hecho con prueba (+100). El ADN de B+.
export function ValidateDialog() {
  const state = validateStore.use()
  const tasks = useTasks().data ?? []
  const xp = useXp().data ?? []
  const { memberById, today } = useLookup()
  const { spaceId } = useSpace()
  const { validate } = useTaskActions()
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [needProof, setNeedProof] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const linkRef = useRef<HTMLInputElement>(null)

  const task = state ? tasks.find((t) => t.id === state.taskId) : undefined

  useEffect(() => {
    setLink(task?.proof_url ?? '')
    setFile(null)
    setPreview(null)
    setNeedProof(false)
  }, [state?.taskId, task?.proof_url])

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  if (!state || !task) return null
  const owner = task.assignee_id ?? ''
  const first = owner ? isFirstToday(xp, owner, today) : false
  const mult = first ? 2 : 1
  const ownerName = memberById.get(owner)?.profile.display_name ?? 'el responsable'
  const validLink = /^https?:\/\/\S+$/i.test(link.trim())

  async function go(mode: 'plain' | 'proof') {
    if (!state || !task) return
    if (mode === 'proof' && !validLink && !file) {
      setNeedProof(true)
      linkRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      let path: string | undefined
      if (mode === 'proof' && file) path = await uploadProof(spaceId, task.id, file)
      const res = await validate(task, mode, { url: validLink ? link.trim() : undefined, path }, state.at)
      if (res) closeValidate()
    } catch (e) {
      toastError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={closeValidate} title="¿Cómo lo validamos?">
      <p style={{ fontWeight: 700 }}>{task.title}</p>
      {first && (
        <span className="bonusnote">
          <Icon name="star" className="sm" /> Primera validación del día de {ownerName}: vale doble
        </span>
      )}
      <label className="lbl" htmlFor="proofLink">Prueba: link o foto</label>
      <div className="row">
        <input
          id="proofLink"
          ref={linkRef}
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setNeedProof(false)
          }}
          placeholder="https://… (build, doc, video, commit)"
          inputMode="url"
          aria-invalid={needProof}
        />
        <button type="button" className="iconbtn" aria-label="Subir foto de prueba" onClick={() => fileRef.current?.click()}>
          <Icon name="image" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            setPreview(f ? URL.createObjectURL(f) : null)
            setNeedProof(false)
          }}
        />
      </div>
      {preview && (
        <div className="proofbox" style={{ marginTop: 10 }}>
          <img src={preview} alt="Foto de prueba" style={{ maxHeight: 180, objectFit: 'contain' }} />
          <button type="button" className="btn ghost sm" onClick={() => { setFile(null); setPreview(null) }}>Quitar foto</button>
        </div>
      )}
      {needProof && <p className="formerror">Para «con prueba» pega un link o sube una foto.</p>}
      <div className="valopts">
        <button className="valopt proof" disabled={busy} onClick={() => go('proof')}>
          <b>+{XP_PROOF * mult} XP</b>
          <span style={{ fontWeight: 700 }}>Hecho con prueba</span>
          <span className="hint">Link o foto. Sello verde sólido.</span>
        </button>
        <button className="valopt plain" disabled={busy} onClick={() => go('plain')}>
          <b>+{XP_PLAIN * mult} XP</b>
          <span style={{ fontWeight: 700 }}>Lo hice</span>
          <span className="hint">Sin prueba. Sello punteado.</span>
        </button>
      </div>
    </Sheet>
  )
}

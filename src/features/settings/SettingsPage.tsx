import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { toast, toastError } from '../../components/Toasts'
import { todayIn } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useSpaceRow } from '../data/queries'
import { AreasEditor } from './AreasEditor'

// Ajustes del proyecto (los de tu cuenta —tema, color, zona horaria, contraseña— son globales: /ajustes).
// Ajustes mínimos. Si algo necesita un menú para entenderse, está mal.
export default function SettingsPage() {
  const { spaceId, isOwner } = useSpace()
  const qc = useQueryClient()
  const space = useSpaceRow().data
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [about, setAbout] = useState('')

  useEffect(() => {
    if (!space) return
    setName(space.name)
    setTagline(space.tagline)
    setAbout(space.about)
  }, [space])

  async function saveSpace() {
    const { error } = await supabase.from('spaces').update({ name: name.trim() || 'B+', tagline: tagline.trim(), about: about.trim() }).eq('id', spaceId)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.space(spaceId) })
    qc.invalidateQueries({ queryKey: ['memberships'] })
    toast('Espacio guardado', { kind: 'ok', icon: 'check' })
  }

  return (
    <div className="content settings">
      <header className="pagehead"><h1>Ajustes del proyecto</h1></header>

      <section className="card pad">
        <div className="sectionh"><h2>Espacio</h2></div>
        <label className="lbl" htmlFor="s-n">Nombre</label>
        <input id="s-n" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <label className="lbl" htmlFor="s-t">Lema</label>
        <input id="s-t" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Una frase que los describa" />
        <label className="lbl" htmlFor="s-a">Sobre el espacio</label>
        <textarea id="s-a" rows={6} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="De qué trata todo esto, las reglas del equipo…" />
        <div style={{ marginTop: 12 }}><button className="btn sm" onClick={saveSpace}>Guardar</button></div>
      </section>

      <section className="card pad" id="areas">
        <div className="sectionh"><h2>Áreas</h2></div>
        <p className="hint">Cómo se divide el proyecto: la franja de color de cada tarea y el equipo de cada meta.</p>
        <AreasEditor />
      </section>


      <DataSection isOwner={isOwner} />
    </div>
  )
}

function DataSection({ isOwner }: { isOwner: boolean }) {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ data: Json; tasks: number; members: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  async function exportJson() {
    const tables = ['spaces', 'areas', 'projects', 'tasks', 'events', 'event_attendees', 'xp_log', 'achievements_unlocked'] as const
    const out: Record<string, unknown> = { format: 'bplus-hq-v3', exported_at: new Date().toISOString() }
    for (const t of tables) {
      const q = t === 'spaces' ? supabase.from(t).select('*').eq('id', spaceId) : supabase.from(t).select('*').eq('space_id', spaceId)
      const { data } = await q
      out[t] = data
    }
    const { data: members } = await supabase.from('space_members').select('role, role_title, job_description, profile:profiles(username, display_name, color)').eq('space_id', spaceId)
    out.members = members
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hq-respaldo-${todayIn()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function pick(f: File | undefined) {
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        const data = JSON.parse(String(r.result))
        if (!Array.isArray(data?.tasks) || !Array.isArray(data?.members)) throw new Error('Ese archivo no parece un respaldo del HQ v2.')
        setPending({ data, tasks: data.tasks.length, members: data.members.map((m: { name: string }) => m.name) })
      } catch (e) {
        toastError(humanError(e))
      }
      if (fileRef.current) fileRef.current.value = ''
    }
    r.readAsText(f)
  }

  async function runImport() {
    if (!pending) return
    setBusy(true)
    const { data, error } = await supabase.rpc('import_v2', { p_space: spaceId, p: pending.data })
    setBusy(false)
    if (error) return toastError(humanError(error))
    const rep = data as { tasks: number; projects: number; xp_entries: number; unmatched: string[] }
    setPending(null)
    qc.invalidateQueries()
    toast(`Importadas ${rep.tasks} tareas, ${rep.projects} proyectos y ${rep.xp_entries} validaciones`, { kind: 'ok', icon: 'check', ms: 6000 })
    if (rep.unmatched?.length) toast(`Sin cuenta todavía: ${rep.unmatched.join(', ')}. Sus tareas quedaron a tu nombre.`, { ms: 9000 })
  }

  return (
    <section className="card pad">
      <div className="sectionh"><h2>Datos</h2></div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn ghost sm" onClick={exportJson}><Icon name="download" className="sm" /> Exportar (JSON)</button>
        {isOwner && (
          <>
            <button className="btn ghost sm" onClick={() => fileRef.current?.click()}><Icon name="upload" className="sm" /> Importar respaldo v2</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </>
        )}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {isOwner
          ? 'El respaldo v2 es el .json que exportaba el HQ anterior (Ajustes › Datos). Los miembros se emparejan por nombre: que el equipo cree su cuenta antes de importar.'
          : 'Solo el dueño del espacio puede importar.'}
      </p>
      <Sheet
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title="Importar respaldo v2"
        footer={<><button className="btn" disabled={busy} onClick={runImport}>{busy ? 'Importando…' : 'Importar'}</button><button className="btn ghost" onClick={() => setPending(null)}>Cancelar</button></>}
      >
        <p>Se van a añadir <b>{pending?.tasks}</b> tareas (con su XP y logros) a este espacio. Los hitos pasan a ser proyectos.</p>
        <p className="hint">Miembros en el respaldo: {pending?.members.join(', ')}. Si importas dos veces, las tareas se duplican.</p>
      </Sheet>
    </section>
  )
}

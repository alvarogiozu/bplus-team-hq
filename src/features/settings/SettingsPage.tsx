import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { AccentPicker } from '../../components/AccentPicker'
import { ColorPick, Select } from '../../components/Select'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE, TIMEZONES } from '../../lib/colors'
import { todayIn } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { useMe } from '../auth/AuthProvider'
import { signOut } from '../auth/credentials'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useAreas, useSpaceRow } from '../data/queries'
import { useTheme } from '../../app/theme'

// Ajustes mínimos. Si algo necesita un menú para entenderse, está mal.
export default function SettingsPage() {
  const { spaceId, isOwner } = useSpace()
  const { userId, profile } = useMe()
  const qc = useQueryClient()
  const space = useSpaceRow().data
  const areas = useAreas().data ?? []
  const { theme, toggle } = useTheme()
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

  async function saveArea(id: string, patch: { name?: string; color?: string }) {
    const { error } = await supabase.from('areas').update(patch).eq('id', id)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.areas(spaceId) })
  }

  async function setTimezone(tz: string) {
    const { error } = await supabase.from('profiles').update({ timezone: tz }).eq('id', userId)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: ['profile'] })
  }

  return (
    <div className="content settings">
      <header className="pagehead"><h1>Ajustes</h1></header>

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

      <section className="card pad">
        <div className="sectionh"><h2>Áreas</h2></div>
        <p className="hint">La franja de color de cada tarea. Solo se cambian nombre y color.</p>
        <div className="arealist">
          {areas.map((a) => (
            <div className="arow" key={a.id}>
              <ColorPick value={a.color} onChange={(c) => saveArea(a.id, { color: c })} palette={PALETTE} label={`Color de ${a.name}`} size={28} />
              <input defaultValue={a.name} aria-label={`Nombre del área ${a.name}`} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && saveArea(a.id, { name: e.target.value.trim() })} />
            </div>
          ))}
        </div>
      </section>

      <section className="card pad">
        <div className="sectionh"><h2>Tu cuenta</h2></div>
        <p className="hint">Usuario: <b>@{profile.username}</b></p>
        <label className="lbl" htmlFor="s-tz">Zona horaria</label>
        <Select
          id="s-tz"
          label="Zona horaria"
          variant="field"
          searchable
          value={profile.timezone}
          onChange={setTimezone}
          options={Array.from(new Set([profile.timezone, ...TIMEZONES])).map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
        />
        <label className="lbl">Tu color principal</label>
        <AccentPicker />
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 16 }}>
          <button className="btn ghost sm" onClick={toggle}><Icon name={theme === 'dark' ? 'sun' : 'moon'} className="sm" /> Tema {theme === 'dark' ? 'claro' : 'oscuro'}</button>
          <Link className="btn ghost sm" to="/cambiar-clave"><Icon name="key" className="sm" /> Cambiar contraseña</Link>
          <button className="btn danger sm" onClick={() => signOut()}><Icon name="logout" className="sm" /> Cerrar sesión</button>
        </div>
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

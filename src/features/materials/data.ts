import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'
import { humanError, supabase } from '../../lib/supabase'
import { toast, toastError } from '../../components/Toasts'
import { keys } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'

// Materiales del equipo: carpetas + archivos (bucket privado `materiales`) + enlaces.
// Todo el espacio en caché (son cientos como mucho); Realtime invalida.

export type Folder = Tables<'material_folders'>
export type Material = Tables<'materials'>
export const BUCKET = 'materiales'
export const MAX_FILE = 50 * 1024 * 1024

export function useFolders() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.folders(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('material_folders').select('*').eq('space_id', spaceId).order('position').order('name')
      if (error) throw error
      return data as Folder[]
    },
  })
}

export function useMaterials() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.materials(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('*').eq('space_id', spaceId).order('created_at', { ascending: false })
      if (error) throw error
      return data as Material[]
    },
  })
}

/** Enlace firmado (1 h) para ver o bajar un archivo privado. */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['material-url', path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export async function openMaterial(m: Material, download = false) {
  if (m.kind === 'link' && m.url) return void window.open(m.url, '_blank', 'noopener,noreferrer')
  if (!m.storage_path) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 3600, download ? { download: m.name } : undefined)
  if (error) return void toastError(humanError(error))
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

/** Nombre seguro para la ruta del bucket (sin tildes, espacios ni símbolos raros). */
export function safeName(name: string) {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return (clean || 'archivo').slice(-120)
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0).replace('.', ',')} MB`
  return `${(n / 1073741824).toFixed(1).replace('.', ',')} GB`
}

export type Service = { name: string; color: string; letter: string }

/** Qué es un enlace (para su insignia y un nombre por defecto). */
export function serviceOf(url: string): Service {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { name: 'Enlace', color: '#6b6784', letter: '↗' }
  }
  const h = u.hostname.replace(/^www\./, '')
  const p = u.pathname
  if (h === 'docs.google.com' && p.startsWith('/document')) return { name: 'Google Docs', color: '#2f6fd6', letter: 'D' }
  if (h === 'docs.google.com' && p.startsWith('/spreadsheets')) return { name: 'Google Sheets', color: '#1e8e4e', letter: 'S' }
  if (h === 'docs.google.com' && p.startsWith('/presentation')) return { name: 'Google Slides', color: '#c98a0b', letter: 'P' }
  if (h === 'docs.google.com' && p.startsWith('/forms')) return { name: 'Google Forms', color: '#6c3fb8', letter: 'F' }
  if (h === 'drive.google.com') return { name: 'Google Drive', color: '#1e8e4e', letter: 'D' }
  if (h.endsWith('figma.com')) return { name: 'Figma', color: '#9747ff', letter: 'F' }
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'm.youtube.com') return { name: 'YouTube', color: '#d92d20', letter: '▶' }
  if (h === 'github.com') return { name: 'GitHub', color: '#24292f', letter: 'G' }
  if (h.endsWith('notion.so') || h.endsWith('notion.site')) return { name: 'Notion', color: '#37352f', letter: 'N' }
  if (h.endsWith('canva.com')) return { name: 'Canva', color: '#0e8b8e', letter: 'C' }
  if (h.endsWith('miro.com')) return { name: 'Miro', color: '#b88a00', letter: 'M' }
  if (h.endsWith('dropbox.com')) return { name: 'Dropbox', color: '#0061fe', letter: 'D' }
  return { name: h, color: '#2e88aa', letter: (h[0] ?? '↗').toUpperCase() }
}

export type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'doc' | 'sheet' | 'slides' | 'zip' | 'cad' | 'other'
export function fileKind(m: Pick<Material, 'mime' | 'name'>): FileKind {
  const n = m.name.toLowerCase()
  const t = m.mime
  if (t.startsWith('image/')) return 'image'
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  if (/\.(docx?|odt|rtf|txt|md)$/.test(n)) return 'doc'
  if (/\.(xlsx?|ods|csv)$/.test(n)) return 'sheet'
  if (/\.(pptx?|odp|key)$/.test(n)) return 'slides'
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'zip'
  if (/\.(stl|step|stp|f3d|dwg|dxf|kicad_pcb|sch|brd|gbr)$/.test(n)) return 'cad'
  return 'other'
}

export const KIND_LABEL: Record<FileKind, string> = {
  image: 'Imagen',
  pdf: 'PDF',
  video: 'Video',
  audio: 'Audio',
  doc: 'Documento',
  sheet: 'Hoja de cálculo',
  slides: 'Presentación',
  zip: 'Comprimido',
  cad: 'Diseño / CAD',
  other: 'Archivo',
}

export const KIND_COLOR: Record<FileKind, string> = {
  image: '#4a7c3f',
  pdf: '#b1432f',
  video: '#944d63',
  audio: '#7d5fb2',
  doc: '#2f6fd6',
  sheet: '#1e8e4e',
  slides: '#c98a0b',
  zip: '#6b6784',
  cad: '#216b87',
  other: '#6b6784',
}

/** ids de la carpeta y de todas las que tiene dentro. */
export function folderSubtree(folders: Folder[], id: string): Set<string> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

export function useMaterialActions() {
  const qc = useQueryClient()
  const { spaceId } = useSpace()
  const fk = keys.folders(spaceId)
  const mk = keys.materials(spaceId)

  const putFolder = useCallback((f: Folder) => qc.setQueryData<Folder[]>(fk, (old) => (old ? (old.some((x) => x.id === f.id) ? old.map((x) => (x.id === f.id ? f : x)) : [...old, f]) : old)), [qc, fk])
  const putMaterial = useCallback((m: Material) => qc.setQueryData<Material[]>(mk, (old) => (old ? (old.some((x) => x.id === m.id) ? old.map((x) => (x.id === m.id ? m : x)) : [m, ...old]) : old)), [qc, mk])

  const createFolder = useCallback(
    async (input: Omit<TablesInsert<'material_folders'>, 'space_id'>) => {
      const sibs = (qc.getQueryData<Folder[]>(fk) ?? []).filter((f) => (f.parent_id ?? null) === (input.parent_id ?? null))
      const position = sibs.reduce((m, f) => Math.max(m, f.position), 0) + 1
      const { data, error } = await supabase.from('material_folders').insert({ position, ...input, space_id: spaceId }).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      putFolder(data)
      return data
    },
    [qc, fk, spaceId, putFolder],
  )

  const updateFolder = useCallback(
    async (id: string, patch: TablesUpdate<'material_folders'>) => {
      const prev = (qc.getQueryData<Folder[]>(fk) ?? []).find((f) => f.id === id)
      if (prev) putFolder({ ...prev, ...patch } as Folder)
      const { data, error } = await supabase.from('material_folders').update(patch).eq('id', id).select('*').single()
      if (error) {
        if (prev) putFolder(prev)
        toastError(humanError(error))
        return null
      }
      putFolder(data)
      return data
    },
    [qc, fk, putFolder],
  )

  /** Borra la carpeta, lo que tiene dentro y sus archivos del bucket. */
  const removeFolder = useCallback(
    async (folder: Folder) => {
      const folders = qc.getQueryData<Folder[]>(fk) ?? []
      const materials = qc.getQueryData<Material[]>(mk) ?? []
      const ids = folderSubtree(folders, folder.id)
      const paths = materials.filter((m) => m.folder_id && ids.has(m.folder_id) && m.storage_path).map((m) => m.storage_path!)
      const { error } = await supabase.from('material_folders').delete().eq('id', folder.id)
      if (error) return void toastError(humanError(error))
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      qc.setQueryData<Folder[]>(fk, (old) => old?.filter((f) => !ids.has(f.id)))
      qc.setQueryData<Material[]>(mk, (old) => old?.filter((m) => !(m.folder_id && ids.has(m.folder_id))))
      toast(`Borraste la carpeta «${folder.name}»`)
    },
    [qc, fk, mk],
  )

  /** Sube archivos a una carpeta: primero el archivo, después la fila (la base mide el tamaño y
   *  revisa el cupo). Si la fila falla, el archivo se borra para no dejar basura. */
  const uploadFiles = useCallback(
    async (files: File[], folderId: string | null, onDone?: (name: string) => void) => {
      let ok = 0
      for (const f of files) {
        try {
          if (f.size > MAX_FILE) {
            toastError(`«${f.name}» pesa más de 50 MB. Súbelo a Drive y agrégalo como enlace.`)
            continue
          }
          const path = `${spaceId}/${crypto.randomUUID()}/${safeName(f.name)}`
          const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false })
          if (up.error) {
            toastError(/row-level|policy/i.test(up.error.message) ? 'Se llenó el espacio de materiales del equipo.' : humanError(up.error))
            continue
          }
          const { data, error } = await supabase
            .from('materials')
            .insert({ space_id: spaceId, folder_id: folderId, kind: 'file', name: f.name.slice(0, 200) || 'archivo', storage_path: path })
            .select('*')
            .single()
          if (error) {
            await supabase.storage.from(BUCKET).remove([path])
            toastError(humanError(error))
            continue
          }
          putMaterial(data)
          ok++
        } finally {
          onDone?.(f.name)
        }
      }
      if (ok) toast(ok === 1 ? 'Archivo subido' : `${ok} archivos subidos`, { kind: 'ok', icon: 'check' })
      return ok
    },
    [spaceId, putMaterial],
  )

  const addLink = useCallback(
    async (input: { url: string; name: string; folderId: string | null; note?: string }) => {
      const url = /^https?:\/\//i.test(input.url.trim()) ? input.url.trim() : `https://${input.url.trim()}`
      const { data, error } = await supabase
        .from('materials')
        .insert({ space_id: spaceId, folder_id: input.folderId, kind: 'link', url, name: (input.name.trim() || serviceOf(url).name).slice(0, 200), note: input.note ?? '' })
        .select('*')
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      putMaterial(data)
      toast('Enlace agregado', { kind: 'ok', icon: 'check' })
      return data
    },
    [spaceId, putMaterial],
  )

  const updateMaterial = useCallback(
    async (id: string, patch: TablesUpdate<'materials'>, undoLabel?: string) => {
      const prev = (qc.getQueryData<Material[]>(mk) ?? []).find((m) => m.id === id)
      if (prev) putMaterial({ ...prev, ...patch } as Material)
      const { data, error } = await supabase.from('materials').update(patch).eq('id', id).select('*').single()
      if (error) {
        if (prev) putMaterial(prev)
        toastError(humanError(error))
        return null
      }
      putMaterial(data)
      if (undoLabel && prev) {
        const back: TablesUpdate<'materials'> = {}
        for (const k of Object.keys(patch) as (keyof Material)[]) (back as Record<string, unknown>)[k] = prev[k]
        toast(undoLabel, { action: { label: 'Deshacer', onClick: () => void supabase.from('materials').update(back).eq('id', id).select('*').single().then(({ data: d }) => d && putMaterial(d)) } })
      }
      return data
    },
    [qc, mk, putMaterial],
  )

  const removeMaterial = useCallback(
    async (m: Material) => {
      qc.setQueryData<Material[]>(mk, (old) => old?.filter((x) => x.id !== m.id))
      const { error } = await supabase.from('materials').delete().eq('id', m.id)
      if (error) {
        putMaterial(m)
        return void toastError(humanError(error))
      }
      if (m.storage_path) await supabase.storage.from(BUCKET).remove([m.storage_path])
      toast(`Borraste «${m.name}»`)
    },
    [qc, mk, putMaterial],
  )

  return { createFolder, updateFolder, removeFolder, uploadFiles, addLink, updateMaterial, removeMaterial }
}

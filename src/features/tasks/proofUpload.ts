import { supabase } from '../../lib/supabase'

// Fotos de prueba: se achican en el navegador (máx. 1600 px, JPEG) antes de subir a Storage.
// Carpeta = id del espacio: así la RLS de Storage deja verlas solo a los miembros.

async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82))
    return blob ?? file
  } catch {
    return file // HEIC u otro formato que el navegador no decodifica: se sube tal cual
  }
}

export async function uploadProof(spaceId: string, taskId: string, file: File): Promise<string> {
  const blob = await shrink(file)
  const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'img').toLowerCase()
  const path = `${spaceId}/${taskId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('proofs').upload(path, blob, { contentType: blob.type || file.type, upsert: false })
  if (error) throw error
  return path
}

export async function proofUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('proofs').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

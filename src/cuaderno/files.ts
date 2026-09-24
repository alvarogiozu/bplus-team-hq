import { humanError, supabase } from '../lib/supabase'
import { toastError } from '../components/Toasts'

// Imágenes y dibujos del cuaderno: privados en storage (<user_id>/<archivo>).
// En el Markdown viajan como "cuaderno://<ruta>" y al mostrarse se cambian por un enlace firmado.
const SCHEME = 'cuaderno://'
const BUCKET = 'cuaderno'
const signed = new Map<string, { url: string; exp: number }>()

export const isStored = (src: string) => src.startsWith(SCHEME)
export const pathOfSrc = (src: string) => src.slice(SCHEME.length).split('?')[0]
/** La marca de versión obliga a pedir otro enlace cuando un dibujo se vuelve a guardar. */
export const srcOf = (path: string) => `${SCHEME}${path}?v=${Date.now().toString(36)}`

export async function resolveSrc(src: string): Promise<string> {
  if (!isStored(src)) return src
  const hit = signed.get(src)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pathOfSrc(src), 3600)
  if (error || !data) return ''
  signed.set(src, { url: data.signedUrl, exp: Date.now() + 55 * 60_000 })
  return data.signedUrl
}

const MAX_SIDE = 1800

/** Fotos grandes se achican a 1800 px en WebP: se ven igual y pesan una fracción (ahorra almacenamiento). */
export async function shrinkImage(file: Blob): Promise<{ blob: Blob; ext: string }> {
  if (file.type === 'image/gif') return { blob: file, ext: 'gif' }
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.size < 900_000) return { blob: file, ext: file.type === 'image/png' ? 'png' : 'jpg' }
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.86))
    return blob ? { blob, ext: 'webp' } : { blob: file, ext: 'png' }
  } catch {
    return { blob: file, ext: file.type === 'image/png' ? 'png' : 'jpg' }
  }
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' }

/** Sube a la carpeta de la persona y devuelve la ruta (o null si falló). */
export async function upload(uid: string, blob: Blob, ext: string, name: string = crypto.randomUUID()) {
  const path = `${uid}/${name}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: MIME[ext] ?? blob.type,
    cacheControl: '3600',
  })
  if (error) {
    toastError(error.message.includes('exceeded') ? 'El archivo pesa demasiado.' : humanError(error))
    return null
  }
  return path
}

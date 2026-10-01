import { humanError, supabase } from '../lib/supabase'
import { urlDeArchivo } from '../lib/cofre/archivos'
import { toastError } from '../components/Toasts'
import { BOARD_SRC } from './text'

// Imágenes y dibujos del cuaderno: privados en storage y cifrados con el Cofre.
//   <user_id>/n/<nota>/<archivo>  imagen de una página: llave de la página (si se comparte, el equipo la ve)
//   <user_id>/<archivo>           lo demás (y lo de antes): llave de la persona
// En el Markdown viajan como "cuaderno://<ruta>" y al mostrarse se bajan y se abren aquí (URL local blob:).
const SCHEME = 'cuaderno://'
const BUCKET = 'cuaderno'

/** Una pizarra metida en una página viaja como imagen "cuaderno://pizarra/<id>" (no es un archivo). */
export { BOARD_SRC }
export const isBoardSrc = (src: string) => src.startsWith(BOARD_SRC)
export const isStored = (src: string) => src.startsWith(SCHEME) && !isBoardSrc(src) && !src.startsWith(`${SCHEME}nota/`)
export const pathOfSrc = (src: string) => src.slice(SCHEME.length).split('?')[0]
/** La marca de versión obliga a pedir otro enlace cuando un dibujo se vuelve a guardar. */
export const srcOf = (path: string) => `${SCHEME}${path}?v=${Date.now().toString(36)}`

export async function resolveSrc(src: string): Promise<string> {
  if (!isStored(src)) return src
  try {
    // la marca ?v= cambia cuando un dibujo se vuelve a guardar: esa versión se baja de nuevo
    return await urlDeArchivo(BUCKET, pathOfSrc(src), undefined, src)
  } catch {
    return ''
  }
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

/** Ancho y alto reales de una imagen (o null si el navegador no la puede leer). */
export async function imageSize(f: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const b = await createImageBitmap(f)
    const out = { w: b.width, h: b.height }
    b.close()
    return out
  } catch {
    return null
  }
}

/** El nombre del archivo, si dice algo (las capturas pegadas se llaman "image.png"). */
export const imageName = (n: string) => {
  const base = n.replace(/\.[a-z0-9]{2,5}$/i, '').trim()
  return !base || /^(image|imagen|screenshot|captura|clipboard|blob|unnamed|download)$/i.test(base) ? undefined : base.slice(0, 80)
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' }

/** Sube a la carpeta de la persona (o de la página, si se dice cuál) y devuelve la ruta (o null si falló).
 *  Se cifra solo al subir (fetch del Cofre); las fuentes para la IA («fuente-…») van en claro y se borran al leerse. */
export async function upload(uid: string, blob: Blob, ext: string, name: string = crypto.randomUUID(), noteId?: string | null) {
  const path = noteId ? `${uid}/n/${noteId}/${name}.${ext}` : `${uid}/${name}.${ext}`
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

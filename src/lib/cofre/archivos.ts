// Mostrar archivos del Cofre. Los archivos se guardan cifrados, así que un enlace firmado de Storage
// entregaría bytes ilegibles: se bajan (el fetch del Cofre los abre) y se muestran como blob: local.
// Si el archivo era de antes del Cofre (está en claro), `alMigrar` permite volver a subirlo cifrado.

import { supabase } from '../supabase'
import { archivosEnClaro } from './fetchCifrado'

const urls = new Map<string, Promise<string>>()

export type Migrar = (datos: Blob) => Promise<void>

/** URL local (blob:) del archivo ya abierto. Se recuerda mientras la página esté abierta. */
export function urlDeArchivo(bucket: string, ruta: string, alMigrar?: Migrar): Promise<string> {
  const clave = `${bucket}/${ruta}`
  let p = urls.get(clave)
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.storage.from(bucket).download(ruta)
      if (error || !data) throw error ?? new Error('No se pudo bajar el archivo')
      if (alMigrar && archivosEnClaro.has(clave)) {
        archivosEnClaro.delete(clave)
        void alMigrar(data).catch(() => undefined)
      }
      return URL.createObjectURL(data)
    })()
    p.catch(() => urls.delete(clave))
    urls.set(clave, p)
  }
  return p
}

/** Abre el archivo en otra pestaña o lo descarga con su nombre. */
export async function abrirArchivo(bucket: string, ruta: string, nombre?: string, descargar = false) {
  // la pestaña se abre ya (dentro del clic) para que el navegador no la bloquee; luego se llena
  const ventana = descargar ? null : window.open('', '_blank')
  try {
    const url = await urlDeArchivo(bucket, ruta)
    if (descargar || !ventana) {
      const a = document.createElement('a')
      a.href = url
      a.download = nombre ?? ruta.split('/').pop() ?? 'archivo'
      a.click()
    } else {
      ventana.location.href = url
    }
  } catch (e) {
    ventana?.close()
    throw e
  }
}

/** Sube de nuevo, cifrado, un archivo que estaba en claro: ruta nueva (el fetch del Cofre lo cifra), y la vieja se borra. */
export async function resubirCifrado(bucket: string, rutaVieja: string, datos: Blob): Promise<string | null> {
  const nueva = rutaVieja.replace(/(\.[a-z0-9]+)?$/i, (ext) => `.cofre${ext}`)
  if (nueva === rutaVieja) return null
  const up = await supabase.storage.from(bucket).upload(nueva, datos, { contentType: datos.type || undefined, upsert: false })
  if (up.error) return null
  return nueva
}

export async function borrarArchivo(bucket: string, ruta: string) {
  await supabase.storage.from(bucket).remove([ruta])
  const clave = `${bucket}/${ruta}`
  const p = urls.get(clave)
  urls.delete(clave)
  p?.then((u) => URL.revokeObjectURL(u)).catch(() => undefined)
}

// Procesado de la foto de prueba ANTES de subirla (regla 3 del doc 19):
// re-encode via canvas = elimina metadatos EXIF (incluido GPS) y
// reduce a max 1280px = sube rapido en 4G y pesa menos en Storage.
// `maxPx` opcional: avatares usan 512.
export async function prepararFoto(file, maxPx = 1280) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const MAX = maxPx
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('No se pudo procesar la foto')
  return blob
}


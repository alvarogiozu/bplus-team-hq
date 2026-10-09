// Íconos de Rockie (PWA y Android): dibuja a Rockie con sus piezas reales (public/rockie-svg: cuarzo + ojos1 +
// boca6, igual que el splash de la app) sobre el fondo de la app.
//   node capacitor/iconos.mjs      (o, dentro de capacitor/: npm run iconos)
// Escribe en public/ (PWA) y, si existe capacitor/android, sus íconos y pantallas de carga.
// Usa el Chromium de Playwright (ya instalado para los e2e).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..')
const svg = (p) => `data:image/svg+xml;base64,${readFileSync(resolve(raiz, 'public/rockie-svg', p)).toString('base64')}`
const PIEZAS = ['bases/cuarzo/base1.svg', 'eyes/ojos1.svg', 'mouth/boca6.svg'].map(svg)
const FONDO = '#f0ebe5'

// ancho×alto · rockie = fracción del lado corto que ocupa Rockie · esquinas: '22%' redondeado, '50%' círculo,
// 0 a sangre · fondo: false = transparente (la capa de adelante de un ícono adaptable de Android)
const ICONOS = [
  { archivo: 'public/icon-192.png', w: 192, h: 192, rockie: 0.74, esquinas: '22%' },
  { archivo: 'public/icon-512.png', w: 512, h: 512, rockie: 0.74, esquinas: '22%' },
  // maskable: Android recorta hasta un círculo del 80 % → Rockie dentro de la zona segura
  { archivo: 'public/icon-maskable-512.png', w: 512, h: 512, rockie: 0.64, esquinas: 0 },
  // iOS redondea solo y no acepta transparencia
  { archivo: 'public/apple-touch-icon.png', w: 180, h: 180, rockie: 0.7, esquinas: 0 },
]

const res = join(aqui, 'android/app/src/main/res')
if (existsSync(res)) {
  // densidades de Android: mdpi = 1x … xxxhdpi = 4x
  for (const [d, x] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
    const icono = 48 * x
    ICONOS.push(
      { archivo: `${res}/mipmap-${d}/ic_launcher.png`, w: icono, h: icono, rockie: 0.74, esquinas: '22%' },
      { archivo: `${res}/mipmap-${d}/ic_launcher_round.png`, w: icono, h: icono, rockie: 0.66, esquinas: '50%' },
      // ícono adaptable: 108dp con zona segura de 66dp en el centro; el fondo es ic_launcher_background (#F0EBE5)
      { archivo: `${res}/mipmap-${d}/ic_launcher_foreground.png`, w: 108 * x, h: 108 * x, rockie: 0.5, esquinas: 0, fondo: false },
    )
  }
  // pantallas de carga: se rehacen con el mismo tamaño que dejó Capacitor
  for (const dir of readdirSync(res).filter((n) => n.startsWith('drawable'))) {
    const png = join(res, dir, 'splash.png')
    if (!existsSync(png)) continue
    const b = readFileSync(png)
    ICONOS.push({ archivo: png, w: b.readUInt32BE(16), h: b.readUInt32BE(20), rockie: 0.32, esquinas: 0 })
  }
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage()
for (const { archivo, w, h, rockie, esquinas, fondo = true } of ICONOS) {
  const r = Math.round(Math.min(w, h) * rockie)
  const transparente = !fondo || esquinas !== 0
  await pagina.setViewportSize({ width: w, height: h })
  await pagina.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:${fondo ? FONDO : 'transparent'};
      border-radius:${esquinas}">
      <div style="position:relative;width:${r}px;height:${r}px">
        ${PIEZAS.map((src) => `<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%">`).join('')}
      </div>
    </div></body></html>`)
  await pagina.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
  writeFileSync(resolve(raiz, archivo), await pagina.screenshot({ omitBackground: transparente }))
  console.log('✓', archivo.replace(raiz, '').replace(/\\/g, '/'))
}
await navegador.close()

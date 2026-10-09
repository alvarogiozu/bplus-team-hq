// Íconos de Rockie (PWA y, más adelante, Android): dibuja a Rockie con sus piezas reales (public/rockie-svg:
// cuarzo + ojos1 + boca6, igual que el splash de la app) sobre el fondo de la app y los guarda en public/.
//   node capacitor/iconos.mjs
// Usa el Chromium de Playwright (ya instalado para los e2e).
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = (p) => `data:image/svg+xml;base64,${readFileSync(resolve(raiz, 'public/rockie-svg', p)).toString('base64')}`
const PIEZAS = ['bases/cuarzo/base1.svg', 'eyes/ojos1.svg', 'mouth/boca6.svg'].map(svg)
const FONDO = '#f0ebe5'

// rockie = fracción del lado que ocupa Rockie; redondo = esquinas transparentes (ícono «any», p. ej. en la PC)
const ICONOS = [
  { archivo: 'icon-192.png', lado: 192, rockie: 0.74, redondo: true },
  { archivo: 'icon-512.png', lado: 512, rockie: 0.74, redondo: true },
  // maskable: Android recorta hasta un círculo del 80 % → Rockie dentro de la zona segura
  { archivo: 'icon-maskable-512.png', lado: 512, rockie: 0.64, redondo: false },
  // iOS redondea solo y no acepta transparencia
  { archivo: 'apple-touch-icon.png', lado: 180, rockie: 0.7, redondo: false },
]

const navegador = await chromium.launch()
const pagina = await navegador.newPage()
for (const { archivo, lado, rockie, redondo } of ICONOS) {
  const r = Math.round(lado * rockie)
  await pagina.setViewportSize({ width: lado, height: lado })
  await pagina.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${lado}px;height:${lado}px;display:grid;place-items:center;background:${FONDO};
      border-radius:${redondo ? '22%' : '0'}">
      <div style="position:relative;width:${r}px;height:${r}px">
        ${PIEZAS.map((src) => `<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%">`).join('')}
      </div>
    </div></body></html>`)
  await pagina.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
  writeFileSync(resolve(raiz, 'public', archivo), await pagina.screenshot({ omitBackground: redondo }))
  console.log('✓', archivo)
}
await navegador.close()

// Gráfico destacado de Play Store (1024×500, PNG sin transparencia): Rockie + nombre + lema de la portada.
//   node capacitor/play-store/grafico.mjs   → capacitor/play-store/grafico-destacado.png
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../..')
const svg = (p) => `data:image/svg+xml;base64,${readFileSync(resolve(raiz, 'public/rockie-svg', p)).toString('base64')}`
const PIEZAS = ['bases/cuarzo/base1.svg', 'eyes/ojos1.svg', 'mouth/boca6.svg'].map(svg)

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1024, height: 500 } })
await pagina.setContent(`<!doctype html><html><head>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Quicksand:wght@600;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; width: 1024px; height: 500px; background: #f0ebe5; display: flex; align-items: center; gap: 48px;
      padding: 0 80px; box-sizing: border-box; font-family: Quicksand, sans-serif; color: #575279; }
    .rk { position: relative; width: 300px; height: 300px; flex: none; }
    .rk img { position: absolute; inset: 0; width: 100%; height: 100%; }
    h1 { margin: 0; font: 700 96px/1 Fraunces, Georgia, serif; color: #2a82ad; letter-spacing: -1px; }
    p { margin: 18px 0 0; font-size: 34px; font-weight: 700; line-height: 1.2; }
    small { display: block; margin-top: 14px; font-size: 22px; font-weight: 600; color: #797593; }
  </style></head><body>
  <div class="rk">${PIEZAS.map((s) => `<img src="${s}">`).join('')}</div>
  <div><h1>Rockie</h1><p>Todas tus herramientas,<br>en una sola mochila</p><small>Hábitos · Agenda · Cuaderno · Proyectos</small></div>
</body></html>`)
await pagina.evaluate(async () => {
  await document.fonts.ready
  await Promise.all([...document.images].map((i) => i.decode()))
})
await pagina.screenshot({ path: resolve(aqui, 'grafico-destacado.png') })
await navegador.close()
console.log('✓ capacitor/play-store/grafico-destacado.png')

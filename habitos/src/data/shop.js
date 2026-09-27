// Tienda de Rockie: catalogo de items (dominio de cliente, como rockie.js).
//
// Tipos:
//  - acc:  accesorio equipable. Su PNG en /rockie/acc esta ALINEADO al canvas
//          2500x2500 de Rockie (base/ojos/boca), asi que se superpone directo
//          como una capa mas. `slot` = donde se equipa (uno por slot).
//  - bg:   fondo del hero de Rockie (gradiente CSS). Se equipa en el slot 'fondo'.
//  - food: consumible. No se guarda: al comprarlo Rockie celebra y dice su frase.
//
// `thumb` recorta la zona del PNG donde vive el accesorio para las miniaturas
// (cx/cy = centro del item en % del canvas, z = zoom). Ver acercarThumb().
// `req` = candado de progreso ademas del precio: { level } o { days }.

export const SLOT_LABELS = { cabeza: 'Cabeza', cara: 'Cara', mano: 'Mano', espalda: 'Espalda' }

export const SHOP_ITEMS = [
  // ---- Piedras (la linea evolutiva de Rockie; arte real en rockie-svg/bases) ----
  // `colorId` enlaza con ROCKIE_COLORS; comprar/equipar = vestir ese color.
  // Cuarzo es la piedra de fabrica (gratis, ya en `owned` al arrancar).
  { id: 'stone-cuarzo', type: 'stone', colorId: 'cuarzo', name: 'Cuarzo', price: 0,
    desc: 'La piedra de siempre' },
  { id: 'stone-jade', type: 'stone', colorId: 'jade', name: 'Jade', price: 120,
    desc: 'Verdeazul sereno' },
  { id: 'stone-arcilla', type: 'stone', colorId: 'arcilla', name: 'Arcilla', price: 120,
    desc: 'Calida y terrosa' },
  { id: 'stone-tierra', type: 'stone', colorId: 'tierra', name: 'Tierra', price: 150,
    desc: 'Marron de raiz' },
  { id: 'stone-carbon', type: 'stone', colorId: 'carbon', name: 'Carbon', price: 200,
    desc: 'Gris profundo' },
  { id: 'stone-obsidiana', type: 'stone', colorId: 'obsidiana', name: 'Obsidiana', price: 250,
    desc: 'Noche volcanica', req: { level: 10 } },

  // ---- Accesorios ----
  { id: 'sombrero', type: 'acc', slot: 'cabeza', name: 'Sombrero', price: 80,
    desc: 'Un clasico con cinta roja', thumb: { cx: 54, cy: 19, z: 2.1 } },
  { id: 'baston', type: 'acc', slot: 'mano', name: 'Baston', price: 60,
    desc: 'Elegancia de caballero', thumb: { cx: 21, cy: 52, z: 2.3 } },
  { id: 'lentes', type: 'acc', slot: 'cara', name: 'Lentes', price: 60,
    desc: 'Para leer mas paginas', thumb: { cx: 48, cy: 39, z: 2.0 } },
  { id: 'libros', type: 'acc', slot: 'mano', name: 'Libros', price: 70,
    desc: 'Sabiduria portatil', thumb: { cx: 31, cy: 63, z: 2.2 } },
  { id: 'aro', type: 'acc', slot: 'cabeza', name: 'Aureola', price: 90,
    desc: 'Un angel de los habitos', thumb: { cx: 50, cy: 26, z: 1.9 } },
  { id: 'tridente', type: 'acc', slot: 'mano', name: 'Tridente', price: 150,
    desc: 'Para dias con actitud', req: { level: 15 }, thumb: { cx: 19, cy: 50, z: 2.2 } },
  { id: 'cuernos', type: 'acc', slot: 'cabeza', name: 'Cuernos', price: 200,
    desc: 'El lado travieso', req: { level: 30 }, thumb: { cx: 50, cy: 29, z: 1.8 } },
  { id: 'alas', type: 'acc', slot: 'espalda', name: 'Alas', price: 250,
    desc: 'Rockie despega', req: { days: 100 }, thumb: { cx: 50, cy: 34, z: 1.3 } },

  // ---- Fondos y Habitats del hero (Tier 4) ----
  { id: 'bg-amanecer', type: 'bg', name: 'Amanecer', price: 40,
    desc: 'Madrugadas doradas', bg: 'linear-gradient(180deg, #fdf0dc 0%, #f7e3d3 55%, transparent 100%)' },
  { id: 'bg-bosque', type: 'bg', name: 'Bosque', price: 40,
    desc: 'Verde que calma', bg: 'linear-gradient(180deg, #e4ecdc 0%, #dfe9e0 55%, transparent 100%)' },
  { id: 'bg-cielo', type: 'bg', name: 'Cielo', price: 40,
    desc: 'Cabeza en las nubes', bg: 'linear-gradient(180deg, #e0ebf2 0%, #e6eef3 55%, transparent 100%)' },
  { id: 'bg-noche', type: 'bg', name: 'Noche', price: 60,
    desc: 'Para los buhos', bg: 'linear-gradient(180deg, #dcd8ea 0%, #e6e2ef 55%, transparent 100%)' },
  { id: 'bg-amatista', type: 'bg', name: 'Santuario Amatista', price: 80, req: { level: 5 },
    desc: 'Cristales violetas de foco', bg: 'linear-gradient(180deg, #ecdcf7 0%, #dfc8f2 55%, transparent 100%)' },
  { id: 'bg-zen', type: 'bg', name: 'Jardin Cuarzo', price: 80,
    desc: 'Calma mineral y armonia', bg: 'linear-gradient(180deg, #faebd7 0%, #f3dfc8 55%, transparent 100%)' },
  { id: 'bg-volcan', type: 'bg', name: 'Veta Volcanica', price: 120, req: { level: 12 },
    desc: 'Energia ignea y constancia', bg: 'linear-gradient(180deg, #ebdcd6 0%, #dfc4bc 55%, transparent 100%)' },

  // ---- Comida (consumible) ----
  { id: 'manzana', type: 'food', name: 'Manzana', price: 10, emoji: '🍎',
    frase: '"¡Crunch! Justo lo que necesitaba."' },
  { id: 'galleta', type: 'food', name: 'Galleta', price: 15, emoji: '🍪',
    frase: '"¿Galleta? GALLETA. Te adoro."' },
  { id: 'pastel', type: 'food', name: 'Pastelito', price: 30, emoji: '🍰',
    frase: '"¡¿Todo para mi?! Hoy es el mejor dia."' },
]

export const itemById = (id) => SHOP_ITEMS.find(i => i.id === id) || null

/** Estilo del <img> para la miniatura recortada de un accesorio */
export function acercarThumb(thumb) {
  if (!thumb) return {}
  return { transform: `scale(${thumb.z}) translate(${50 - thumb.cx}%, ${50 - thumb.cy}%)` }
}

/** Texto del candado de progreso de un item (null = sin candado) */
export function lockLabel(item, { level, days }) {
  if (item.req?.level && level < item.req.level) return `Nivel ${item.req.level}`
  if (item.req?.days && days < item.req.days) return `${item.req.days} dias juntos`
  return null
}

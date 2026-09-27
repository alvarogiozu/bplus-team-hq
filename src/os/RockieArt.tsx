import type { CSSProperties } from 'react'

// Rockie de Hábitos (la geoda con su piedra, su cara y sus accesorios), el mismo arte de rockie.plus.
// Todas las capas comparten lienzo (2000x2000): se apilan una sobre otra.

const STONES = ['cuarzo', 'arcilla', 'carbon', 'jade', 'obsidiana', 'tierra']
const ACC = ['alas', 'aro', 'baston', 'cuernos', 'lentes', 'libros', 'sombrero', 'tridente']

type Props = {
  size: number
  stone?: string
  eyes?: number
  mouth?: number
  equipped?: Record<string, string | null>
  className?: string
  style?: CSSProperties
}

export function RockieArt({ size, stone = 'cuarzo', eyes = 1, mouth = 6, equipped = {}, className = '', style }: Props) {
  const body = `/rockie-svg/bases/${STONES.includes(stone) ? stone : 'cuarzo'}/base1.svg`
  const acc = (slot: string) => {
    const id = equipped[slot]
    return id && ACC.includes(id) ? `/rockie-svg/acc/${id}.svg` : null
  }
  const back = acc('espalda')
  const front = ['cara', 'cabeza', 'mano'].map(acc).filter(Boolean) as string[]
  const e = Math.min(7, Math.max(1, eyes))
  const m = Math.min(8, Math.max(1, mouth))
  return (
    <span className={`os-rockie ${className}`} style={{ width: size, height: size, ...style }} role="img" aria-label="Tu Rockie">
      {back && <img src={back} alt="" />}
      <img src={body} alt="" />
      <img src={`/rockie-svg/eyes/ojos${e}.svg`} alt="" className="os-blink" />
      <img src={`/rockie-svg/mouth/boca${m}.svg`} alt="" />
      {front.map((src) => (
        <img key={src} src={src} alt="" />
      ))}
    </span>
  )
}

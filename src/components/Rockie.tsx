import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { rockieLook } from '../os/habitos'
import { RockieArt } from '../os/RockieArt'

type Props = {
  color?: string
  size?: number
  sleepy?: boolean
  listening?: boolean
  /** salta cuando alguien valida (evento global hq:celebrate) */
  reactive?: boolean
  still?: boolean
  title?: string
}

// Los colores con que las apps pintaban a Rockie (la mascota). Cualquier otro es el de una persona.
const MASCOTA = new Set(['#2a82ad', '#3c5d73', '#4a7c3f', '#cf7358', '#8aa54a', '#9893a5', 'var(--brand)', 'var(--rockie)'])

// Rockie es el de Hábitos en todas las apps (la geoda con su piedra y sus accesorios, os/RockieArt):
// - la mascota lleva tu look (lo que tienes puesto en Hábitos);
// - una persona (su color de perfil) es un Rockie sobre su color, para distinguir a cada quien.
export function Rockie({ color, size = 44, sleepy, listening, reactive, still, title }: Props) {
  const [jump, setJump] = useState(0)
  useEffect(() => {
    if (!reactive) return
    const on = () => setJump((n) => n + 1)
    window.addEventListener('hq:celebrate', on)
    return () => window.removeEventListener('hq:celebrate', on)
  }, [reactive])
  const look = useMemo(() => rockieLook(), [])

  const persona = Boolean(color && !MASCOTA.has(color.toLowerCase()))
  const eyes = sleepy ? 5 : listening ? 4 : 1
  const mouth = sleepy ? 8 : listening ? 7 : 6
  const cls = ['rockie', still && 'still', listening && 'listening', jump > 0 && 'celebrate', persona && 'persona'].filter(Boolean).join(' ')
  const style = { width: size, height: size, ['--rk' as string]: persona ? color : undefined } as CSSProperties
  return (
    <span key={jump} className={cls} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {persona ? (
        <RockieArt size={Math.round(size * 0.86)} eyes={eyes} mouth={mouth} />
      ) : (
        <RockieArt size={size} stone={look.stone} equipped={look.equipped} eyes={eyes} mouth={mouth} />
      )}
    </span>
  )
}

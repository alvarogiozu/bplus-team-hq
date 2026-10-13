import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { rockieLook } from '../os/habitos'
import { RockieArt } from '../os/RockieArt'
import { Icon } from './Icon'

type Props = {
  color?: string
  size?: number
  sleepy?: boolean
  listening?: boolean
  /** salta cuando alguien valida (evento global hq:celebrate) */
  reactive?: boolean
  still?: boolean
  title?: string
  /** Dibuja al personaje (la geoda de Hábitos). Solo para lo que es del sistema (entrar, páginas públicas):
   *  dentro de Proyectos, Cuaderno y Agenda el personaje NO sale. */
  personaje?: boolean
}

// Los colores con que las apps pintaban a Rockie (la mascota). Cualquier otro es el de una persona.
const MASCOTA = new Set(['#2a82ad', '#3c5d73', '#4a7c3f', '#cf7358', '#8aa54a', '#9893a5', 'var(--brand)', 'var(--rockie)'])

// El personaje Rockie es exclusivo de Hábitos. En Proyectos, Cuaderno y Agenda este componente ya no lo dibuja:
// - una persona (su color de perfil) es un círculo de su color con una silueta, para distinguir a cada quien;
// - donde iba la mascota (el asistente, los estados vacíos) va una chispa en el color de la app.
// Con `personaje` sí se dibuja la geoda con tu look de Hábitos (os/RockieArt).
export function Rockie({ color, size = 44, sleepy, listening, reactive, still, title, personaje }: Props) {
  const [jump, setJump] = useState(0)
  useEffect(() => {
    if (!reactive) return
    const on = () => setJump((n) => n + 1)
    window.addEventListener('hq:celebrate', on)
    return () => window.removeEventListener('hq:celebrate', on)
  }, [reactive])
  const persona = Boolean(color && !MASCOTA.has(color.toLowerCase()))
  const chispa = !persona && !personaje
  const look = useMemo(() => (personaje && !persona ? rockieLook() : null), [personaje, persona])
  const eyes = sleepy ? 5 : listening ? 4 : 1
  const mouth = sleepy ? 8 : listening ? 7 : 6
  const cls = ['rockie', still && 'still', listening && 'listening', jump > 0 && 'celebrate', persona && 'persona', chispa && 'chispa']
    .filter(Boolean)
    .join(' ')
  const style = { width: size, height: size, ['--rk' as string]: persona || chispa ? (color ?? 'var(--brand)') : undefined } as CSSProperties
  return (
    <span key={jump} className={cls} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {personaje ? (
        look ? (
          <RockieArt size={size} stone={look.stone} equipped={look.equipped} eyes={eyes} mouth={mouth} />
        ) : (
          <RockieArt size={Math.round(size * 0.86)} eyes={eyes} mouth={mouth} />
        )
      ) : persona ? (
        <Icon name="user" size={Math.round(size * 0.58)} />
      ) : (
        <Icon name="sparkle" size={Math.round(size * 0.54)} />
      )}
    </span>
  )
}

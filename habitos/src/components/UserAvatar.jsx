// Avatar de perfil: emoji O foto (URL en profiles.avatar).
// Si avatar empieza por http/data → <img>; si no → emoji.

export function isPhotoAvatar(avatar) {
  if (typeof avatar !== 'string' || !avatar) return false
  return /^https?:\/\//i.test(avatar) || avatar.startsWith('data:')
}

/**
 * Circulo de avatar reutilizable.
 * `size` en px (numero) o string token CSS. `fontSize` solo aplica a emoji.
 */
export default function UserAvatar({
  avatar,
  size = 40,
  fontSize,
  background = 'var(--azure-soft)',
  className,
  style,
  alt = '',
}) {
  const photo = isPhotoAvatar(avatar)
  const dim = typeof size === 'number' ? `${size}px` : size
  const emojiSize = fontSize
    || (typeof size === 'number' ? Math.round(size * 0.48) : 'var(--text-xl)')

  const box = {
    width: dim,
    height: dim,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: photo ? 'var(--paper-alt)' : background,
    fontSize: emojiSize,
    lineHeight: 1,
    ...style,
  }

  if (photo) {
    return (
      <span className={className} style={box} aria-hidden={alt ? undefined : true}>
        <img
          src={avatar}
          alt={alt}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </span>
    )
  }

  return (
    <span className={className} style={box} aria-hidden={alt ? undefined : true}>
      {avatar || '😊'}
    </span>
  )
}

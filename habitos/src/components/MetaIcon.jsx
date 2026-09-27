// Glifo de una meta: icono Tabler en el color de la meta. Fallback a emoji para
// metas guardadas antes del cambio icono+color (retrocompatibilidad de LS).
// `boxed` = icono blanco sobre fondo del color de la meta (nodo del mapa activo).
export default function MetaIcon({ meta, size = 16, color, boxed = false }) {
  if (!meta) return null
  const c = color || meta.color
  if (meta.icon) {
    return <i className={`ti ${meta.icon}`} style={{ fontSize: size, color: boxed ? '#fff' : c, lineHeight: 1 }} aria-hidden="true" />
  }
  // Metas viejas (emoji): se muestran tal cual hasta que el usuario las edite
  return <span style={{ fontSize: size, lineHeight: 1 }}>{meta.emoji}</span>
}

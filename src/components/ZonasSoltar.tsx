import { useState, type CSSProperties, type DragEvent } from 'react'
import { claveDe, type Destino, type Zona } from '../lib/mosaico'
import './zonas.css'

// Dónde cae lo que arrastras (escritorio de Rockie OS y Cuaderno). Ligero a propósito: las zonas se
// calculan una vez al empezar (zonasDe) y aquí solo se ilumina la que toca, con opacidad y un leve
// desplazamiento (lo hace la tarjeta de video). La zona iluminada vive aquí dentro: al mover el mouse
// solo se vuelve a dibujar esta capa, nunca las apps ni las notas de debajo. Al soltar, cae justo en la
// que se ve iluminada.
export function ZonasSoltar({
  zonas,
  destino,
  alSoltar,
  alCancelar,
  color,
}: {
  zonas: Zona[]
  /** el destino bajo el puntero */
  destino: (e: DragEvent) => Destino
  alSoltar: (d: Destino, e: DragEvent) => void
  /** el arrastre terminó sin avisar (el mouse se mueve sin arrastrar): fuera la capa, que no tape nada */
  alCancelar: () => void
  /** el color de las zonas (por defecto, el de la marca) */
  color?: string
}) {
  const [activa, setActiva] = useState<string | null>(null)
  return (
    <div
      className="zs"
      aria-hidden="true"
      style={color ? ({ ['--zc' as string]: color } as CSSProperties) : undefined}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        // solo cambia algo al pasar a otra zona (no en cada pixel)
        const k = claveDe(destino(e))
        setActiva((p) => (p === k ? p : k))
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActiva(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        const d = zonas.find((z) => z.clave === activa)?.d ?? destino(e)
        setActiva(null)
        alSoltar(d, e)
      }}
      // mientras se arrastra el navegador no manda movimientos del mouse: si llega uno, ya no hay arrastre
      onPointerMove={alCancelar}
      onPointerDown={alCancelar}
    >
      {zonas.map((z) => (
        <div key={z.clave} className={`zs-z${z.clave === activa ? ' on' : ''}`} style={{ left: z.luz.x, top: z.luz.y, width: z.luz.w, height: z.luz.h }}>
          <span>{z.texto}</span>
        </div>
      ))}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { alPedirLimite, type Clave } from '../../lib/limites'
import { TEXTOS } from '../../lib/limitesTextos'
import { usePlan } from '../../lib/planes'
import { alEscritorio, enVentana } from '../../os/ventana'
import './planes.css'

// La hoja que aparece al llegar a un límite del plan: explica qué pasó en simple, qué sigue funcionando y qué
// trae Plus. Nunca castiga: lo que ya tienes sigue igual. La abre abrirLimite() (lib/limites) desde cualquier
// pantalla, o humanError cuando la base dice que no.

/** Ir a la página de planes: dentro del escritorio la abre arriba (no dentro de la ventana de la app). */
export function useIrAPlanes() {
  const navigate = useNavigate()
  return () => {
    if (enVentana()) alEscritorio({ rockieOS: 'ir', path: '/planes' })
    else navigate('/planes')
  }
}

/** Escucha los avisos de límite (montado una vez en App). El plan se pide recién cuando hay que mostrar la hoja. */
export function LimiteHost() {
  const [clave, setClave] = useState<Clave | null>(null)
  useEffect(() => alPedirLimite(setClave), [])
  return clave ? <HojaLimite clave={clave} cerrar={() => setClave(null)} /> : null
}

function HojaLimite({ clave, cerrar }: { clave: Clave; cerrar: () => void }) {
  const plan = usePlan()
  const ir = useIrAPlanes()
  // espera al plan (para decir el número correcto), pero nunca más de un momento
  const [esperar, setEsperar] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setEsperar(false), 1500)
    return () => clearTimeout(t)
  }, [])
  if (!plan.cargado && esperar) return null
  const t = TEXTOS[clave]
  const n = plan.limite(clave) ?? 0
  return (
    <Sheet
      open
      onClose={cerrar}
      title={t.titulo(n)}
      footer={
        <div className="pl-lim-pie">
          <button className="btn ghost sm" onClick={cerrar}>
            Ahora no
          </button>
          <button
            className="btn sm"
            data-autofocus
            onClick={() => {
              cerrar()
              ir()
            }}
          >
            <Icon name="sparkle" className="sm" /> Ver planes
          </button>
        </div>
      }
    >
      <div className="pl-lim">
        <p>{t.cuerpo(n)}</p>
        <p className="pl-lim-mejora">
          <Icon name="star" className="sm" /> {t.mejora}
        </p>
      </div>
    </Sheet>
  )
}

import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { Rockie } from '../components/Rockie'
import { AppSwitcher } from '../os/AppSwitcher'
import '../os/os.css'

// Hábitos se muda a Rockie OS por tandas. Mientras tanto, esta pantalla lleva a rockie.plus
// (misma experiencia de siempre) y deja volver al Inicio.
export default function HabitosApp() {
  return (
    <div className="os-moving">
      <div style={{ position: 'absolute', top: 16, left: 20 }}>
        <AppSwitcher />
      </div>
      <Rockie color="#4a7c3f" size={96} reactive />
      <h1>Hábitos se está mudando aquí</h1>
      <p>Muy pronto vas a validar tus hábitos, ver tu racha y animar a tu gente sin salir de Rockie. Mientras tanto, siguen en rockie.plus con tu misma cuenta de siempre.</p>
      <div className="row">
        <a className="btn" href="https://rockie.plus/hoy">
          <Icon name="flame" className="sm" /> Abrir mis hábitos
        </a>
        <Link className="btn ghost" to="/inicio">
          Volver al Inicio
        </Link>
      </div>
    </div>
  )
}

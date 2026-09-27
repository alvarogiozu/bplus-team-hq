import WheelColumn from './WheelColumn.jsx'
import './WheelTimePicker.css'

// --- Rueda de hora tipo iPhone (columnas hora + minuto que se deslizan arriba/abajo) ---
// Se abre al tocar la hora del centro del reloj (HabitEditSheet). Comparte el mismo
// valor que el reloj (minutos desde medianoche) y el mismo boton de guardar.
// Sigue la regla del reloj: solo hacia adelante desde la hora original (los horarios
// anteriores salen atenuados y no se pueden elegir). Ver 17_longpress_bottom_sheet.md

const MAX_MINS = 23 * 60 + 55
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// value/min/onChange en minutos desde medianoche (misma unidad que el reloj).
// `min` = tope inferior: los horarios por debajo salen atenuados y no se eligen
// (en Hoy = hora original; en crear/editar = 0, o sea libre).
export default function WheelTimePicker({ value, min = 0, onChange, onBack }) {
  const h = Math.floor(value / 60)
  const mSnap = Math.round((value % 60) / 5) % 12
  const m = mSnap * 5

  const hourItems = Array.from({ length: 24 }, (_, i) => ({
    label: String(i).padStart(2, '0'),
    disabled: i * 60 + 55 < min,
  }))
  const minItems = MINUTES.map((mm) => ({
    label: String(mm).padStart(2, '0'),
    disabled: h * 60 + mm < min,
  }))

  const emit = (hh, mm) => {
    const v = clamp(hh * 60 + mm, min, MAX_MINS)
    if (v !== value) onChange(v)
  }

  return (
    <div className="wheel">
      <div className="wheel-window">
        <div className="wheel-band" />
        <div className="wheel-cols">
          <WheelColumn items={hourItems} index={h} onChange={(i) => emit(i, m)} ariaLabel="Hora" />
          <span className="s wheel-colon">:</span>
          <WheelColumn items={minItems} index={mSnap} onChange={(i) => emit(h, MINUTES[i])} ariaLabel="Minutos" />
        </div>
      </div>
      <button type="button" className="q wheel-back" onClick={onBack}>
        <i className="ti ti-clock-hour-3" /> Volver al reloj
      </button>
    </div>
  )
}

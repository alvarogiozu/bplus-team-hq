import StandardTimePicker from './StandardTimePicker.jsx'
import './HabitEditSheet.css'

// --- Campo de hora comun y comodo ---
// Selector digital con ajuste de horas, minutos rapidos (:00, :15, :30, :45) y selector AM/PM
export default function TimePickerField({ value, origin, changed, forwardOnly = false, onChange }) {
  const lo = forwardOnly ? origin : 0

  return (
    <div className="sheet-switch" style={{ height: 'auto', minHeight: 260, padding: 'var(--space-2) 0' }}>
      <StandardTimePicker value={value} min={lo} onChange={onChange} />
    </div>
  )
}

import { BOOK_COLORS, COLOR_ORDER, type BookColor } from './books'
import { CIcon, EMOJI_CHOICES, ICON_CHOICES, ItemIcon } from './icons'

// Elegir color e ícono de una carpeta, cuaderno o página.
// "Heredar" = usa el color de quien lo contiene (lo normal: así todo lo de adentro se reconoce).

export function ColorPick({
  value,
  inherited,
  onPick,
}: {
  value: BookColor | null
  /** el color que tendría si hereda (si no se pasa, no hay opción de heredar) */
  inherited?: BookColor | null
  onPick: (c: BookColor | null) => void
}) {
  return (
    <div className="cu-swatches" role="radiogroup" aria-label="Color">
      {inherited !== undefined && (
        <button
          role="radio"
          aria-checked={value === null}
          className={`cu-swatch inherit${value === null ? ' on' : ''}`}
          style={{ ['--sw' as string]: BOOK_COLORS[inherited ?? 'accent'].fill }}
          onClick={() => onPick(null)}
          aria-label="Heredar el color de donde está"
          title="Heredar el color de donde está"
        >
          <CIcon name="folder" size={13} />
        </button>
      )}
      {COLOR_ORDER.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          className={`cu-swatch${value === c ? ' on' : ''}`}
          style={{ ['--sw' as string]: BOOK_COLORS[c].fill }}
          onClick={() => onPick(c)}
          aria-label={BOOK_COLORS[c].label}
          title={BOOK_COLORS[c].label}
        />
      ))}
    </div>
  )
}

export function IconPick({ value, fallback, onPick }: { value: string | null; fallback: string; onPick: (icon: string | null) => void }) {
  return (
    <div className="cu-iconpick">
      <div className="cu-iconpick-grid" role="radiogroup" aria-label="Ícono">
        <button role="radio" aria-checked={!value} className={`cu-iconpick-it${!value ? ' on' : ''}`} onClick={() => onPick(null)} title="El de siempre" aria-label="Ícono de siempre">
          <CIcon name={fallback} size={18} />
        </button>
        {ICON_CHOICES.filter((i) => i !== fallback).map((i) => (
          <button key={i} role="radio" aria-checked={value === i} className={`cu-iconpick-it${value === i ? ' on' : ''}`} onClick={() => onPick(i)} aria-label={i}>
            <CIcon name={i} size={18} />
          </button>
        ))}
      </div>
      <div className="cu-iconpick-grid emoji" role="radiogroup" aria-label="Emoji">
        {EMOJI_CHOICES.map((e) => (
          <button key={e} role="radio" aria-checked={value === e} className={`cu-iconpick-it${value === e ? ' on' : ''}`} onClick={() => onPick(e)} aria-label={e}>
            <ItemIcon value={e} fallback={fallback} size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}

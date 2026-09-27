// Moods de Rockie — abanico centrado, loop infinito, estrella (sin numeros).
import FanDeck from './FanDeck.jsx'

const MOOD_PAINT = [
  { bg: 'var(--brand)', edge: 'var(--brand-edge)' },
  { bg: 'var(--berry)', edge: 'var(--berry-edge)' },
  { bg: 'var(--amber)', edge: 'var(--amber-edge)' },
  { bg: 'var(--coral)', edge: 'var(--coral-edge)' },
  { bg: 'var(--olive)', edge: 'var(--olive-edge)' },
]

export default function MoodCarousel({ moods }) {
  const n = moods?.length || 0
  const center = Math.floor(n / 2)

  return (
    <FanDeck
      items={moods}
      ariaLabel="Rockie moods"
      autoMs={3800}
      cardClassName="ld-fan-card--mood"
      initialIndex={center}
      infinite
      spread={1.38}
      renderCard={(m, i) => {
        const paint = MOOD_PAINT[i % MOOD_PAINT.length]
        return (
          <article className="gsurf ld-fan-face ld-mood-face">
            <span
              className="ld-mood-badge"
              style={{
                background: paint.bg,
                boxShadow: `0 3px 0 ${paint.edge}`,
                color: '#fff',
              }}
              aria-hidden="true"
            >
              <i className="ti ti-star-filled" />
            </span>
            <div className="ld-mood-art">
              <img src={m.src} alt="" loading="lazy" draggable={false} />
            </div>
            <h3 className="s ld-mood-title">{m.title}</h3>
            <p className="q ld-mood-sub">{m.sub}</p>
            <span className="gpill q ld-mood-chip" style={{ color: paint.bg }}>
              Rockie
            </span>
          </article>
        )
      }}
    />
  )
}

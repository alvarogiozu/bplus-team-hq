import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LANDING_COPY, LANG_KEY } from './landingCopy.js'
import './TeamHq.css'

function useLandingLang() {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY)
      if (saved === 'es' || saved === 'en') return saved
    } catch { /* ignore */ }
    return 'en'
  })
  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang) } catch { /* ignore */ }
    if (typeof document !== 'undefined') document.documentElement.lang = lang
  }, [lang])
  const toggle = () => setLang((l) => (l === 'en' ? 'es' : 'en'))
  return { lang, t: LANDING_COPY[lang], toggle }
}

/** Entrada al scrollear (mismo criterio que Landing: dispara antes de verse). */
function Reveal({ children, delay = 0, className, style }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18, margin: '0px 0px 18% 0px' }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

function Eyebrow({ color = 'var(--brand)', children }) {
  return (
    <span className="q thq-eyebrow" style={{ color }}>
      <span className="thq-eyebrow-dot" style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  )
}

function BrandButton({ children, onClick, big = false, tone = 'brand' }) {
  const tones = {
    brand: { bg: 'var(--brand)', edge: 'var(--brand-edge)', fg: '#fff' },
    amber: { bg: 'var(--amber)', edge: 'var(--amber-edge)', fg: '#fff' },
    paper: { bg: 'var(--paper)', edge: 'var(--card-edge)', fg: 'var(--ink)' },
  }
  const t = tones[tone] || tones.brand
  return (
    <motion.button
      type="button"
      className="gbtn q"
      onClick={onClick}
      whileTap={{ y: 4 }}
      style={{
        '--edge': t.edge,
        background: t.bg,
        color: t.fg,
        borderRadius: 'var(--r-pill)',
        minHeight: 'var(--tap-min)',
        padding: big ? 'var(--space-4) var(--space-10)' : 'var(--space-3) var(--space-7)',
        fontSize: big ? 'var(--text-lg)' : 'var(--text-base)',
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {children}
    </motion.button>
  )
}

function GhostButton({ children, onClick }) {
  return (
    <motion.button
      type="button"
      className="gbtn q"
      onClick={onClick}
      whileTap={{ y: 4 }}
      style={{
        '--edge': 'var(--card-edge)',
        background: 'var(--card)',
        border: '2px solid var(--card-line)',
        color: 'var(--ink)',
        borderRadius: 'var(--r-pill)',
        minHeight: 'var(--tap-min)',
        padding: 'var(--space-3) var(--space-6)',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </motion.button>
  )
}

function LangToggle({ current, next, ariaLabel, onClick }) {
  return (
    <button
      type="button"
      className="q"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        minHeight: 'var(--tap-min)',
        minWidth: 'var(--tap-min)',
        padding: '0 var(--space-3)',
        borderRadius: 'var(--r-pill)',
        border: '2px solid var(--card-line)',
        background: 'var(--card)',
        color: 'var(--ink)',
        fontWeight: 800,
        fontSize: 'var(--text-xs)',
        cursor: 'pointer',
      }}
    >
      <span style={{ opacity: 0.45 }}>{current}</span>
      <span aria-hidden="true"> · </span>
      <span>{next}</span>
    </button>
  )
}

export default function TeamHq() {
  const navigate = useNavigate()
  const { t, toggle } = useLandingLang()
  const hq = t.teamHq
  const goEntrar = () => navigate('/entrar')

  return (
    <div className="thq">
      <header className="thq-nav">
        <div className="thq-wrap thq-nav-in">
          <Link
            to="/"
            className="s"
            style={{
              fontWeight: 800,
              fontSize: 22,
              color: 'var(--brand-logo)',
              letterSpacing: -1,
              textDecoration: 'none',
            }}
          >
            Rockie<em style={{ fontStyle: 'italic', color: 'var(--berry)', fontWeight: 600 }}>Plus</em>
          </Link>
          <div className="thq-nav-actions">
            <LangToggle
              current={t.langCurrent}
              next={t.langBtn}
              ariaLabel={t.langAria}
              onClick={toggle}
            />
            <GhostButton onClick={goEntrar}>{hq.hasAccount}</GhostButton>
            <BrandButton tone="brand" onClick={goEntrar}>{hq.start}</BrandButton>
          </div>
        </div>
      </header>

      <section className="thq-wrap thq-hero">
        <Reveal>
          <div className="thq-hero-copy">
            <Eyebrow color="var(--amber)">{hq.hero.eyebrow}</Eyebrow>
            <h1 className="s thq-h1" style={{ margin: 0 }}>
              {hq.hero.titleBefore}
              <span style={{ color: 'var(--berry)', fontStyle: 'italic' }}>{hq.hero.titleEm}</span>
              {hq.hero.titleAfter}
            </h1>
            <p className="q thq-sub" style={{ margin: 0, maxWidth: 540 }}>
              {hq.hero.sub}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <BrandButton big tone="brand" onClick={goEntrar}>{hq.hero.ctaPrimary}</BrandButton>
              <GhostButton onClick={goEntrar}>{hq.hero.ctaSecondary}</GhostButton>
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="thq-hero-art">
            <img
              className="thq-hero-img"
              src="/landing/rockies/art/rockie-terno-3.png"
              alt="Rockie Team HQ"
              width={800}
              height={800}
              decoding="async"
            />
          </div>
        </Reveal>
      </section>

      <section className="thq-section thq-band" id="para-quien">
        <div className="thq-wrap">
          <Reveal>
            <Eyebrow color="var(--olive)">{hq.forWhom.eyebrow}</Eyebrow>
            <h2 className="s thq-h2" style={{ margin: '0 0 var(--space-3)' }}>{hq.forWhom.title}</h2>
            <p className="q thq-sub" style={{ margin: 0, maxWidth: 520 }}>{hq.forWhom.sub}</p>
          </Reveal>
          <div className="thq-whom-grid">
            {hq.forWhom.cards.map((c, i) => (
              <Reveal key={c.title} delay={i * 0.05}>
                <article className="thq-whom-card">
                  <img className="thq-whom-art" src={c.art} alt="" loading="lazy" decoding="async" />
                  <div>
                    <h3 className="s thq-whom-title">{c.title}</h3>
                    <p className="q thq-whom-body">{c.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="thq-section" id="pilares">
        <div className="thq-wrap">
          <Reveal>
            <Eyebrow color="var(--brand)">{hq.pillars.eyebrow}</Eyebrow>
            <h2 className="s thq-h2" style={{ margin: '0 0 var(--space-3)' }}>{hq.pillars.title}</h2>
            <p className="q thq-sub" style={{ margin: 0, maxWidth: 520 }}>{hq.pillars.sub}</p>
          </Reveal>
          <div className="thq-pillars">
            {hq.pillars.items.map((p, i) => (
              <Reveal key={p.title} delay={0.04}>
                <article className={`thq-pillar${i % 2 === 1 ? ' thq-pillar--flip' : ''}`}>
                  <div className="thq-pillar-copy">
                    <div className="thq-pillar-top">
                      <span className="thq-pillar-icon" aria-hidden="true">
                        <i className={`ti ${p.icon}`} />
                      </span>
                      <h3 className="s thq-pillar-title">{p.title}</h3>
                    </div>
                    <p className="q thq-pillar-body">{p.body}</p>
                  </div>
                  <div className="thq-pillar-art-wrap">
                    <img className="thq-pillar-art" src={p.art} alt="" loading="lazy" decoding="async" />
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="thq-close" id="entrar">
        <div className="thq-wrap">
          <Reveal>
            <Eyebrow color="var(--amber)">{hq.close.eyebrow}</Eyebrow>
            <h2 className="s thq-h2" style={{ margin: '0 0 var(--space-3)' }}>{hq.close.title}</h2>
            <p className="q thq-sub" style={{ margin: 0, maxWidth: 520 }}>{hq.close.sub}</p>
            <div className="thq-close-actions">
              <BrandButton big tone="amber" onClick={goEntrar}>{hq.close.ctaPrimary}</BrandButton>
              <Link
                to="/"
                className="gbtn q"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  '--edge': 'transparent',
                  background: 'transparent',
                  border: '2px solid rgba(255,255,255,0.35)',
                  color: '#fff',
                  borderRadius: 'var(--r-pill)',
                  minHeight: 'var(--tap-min)',
                  padding: 'var(--space-3) var(--space-6)',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                {hq.close.ctaSecondary}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="thq-footer">
        <div className="thq-wrap">
          <span className="s" style={{ fontWeight: 800, fontSize: 22, color: 'var(--brand-logo)', letterSpacing: -1 }}>
            Rockie<em style={{ fontStyle: 'italic', color: 'var(--berry)', fontWeight: 600 }}>Plus</em>
          </span>
          <p className="q" style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
            {t.footer.tagline}
          </p>
        </div>
      </footer>
    </div>
  )
}

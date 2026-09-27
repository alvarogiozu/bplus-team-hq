import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Rockie from '../components/Rockie.jsx'
import HeroDevice3D from './HeroDevice3D.jsx'
import MoodCarousel from './MoodCarousel.jsx'
import SystemSim from './SystemSims.jsx'
import { CONTACT_EMAIL } from '../lib/site.js'
import { LANDING_COPY, LANG_KEY } from './landingCopy.js'
import { joinWaitlist, sendRockieMessage } from './rockieWaitlistApi.js'
import './Landing.css'

// Landing publica rockie.plus — estilo Playdate x B+.
// Default EN + toggle ES. Sin menciones geograficas.

function useDesktop() {
  const [desk, setDesk] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const onChange = (e) => setDesk(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desk
}

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

/** Entrada al scrollear: el margin POSITIVO dispara la animacion antes de
 *  que el bloque entre en pantalla (evita el flash vacío del margin negativo). */
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

function stepPaint(tone) {
  if (tone === 'olive') return { bg: 'var(--olive)', edge: 'var(--olive-edge)' }
  if (tone === 'berry') return { bg: 'var(--berry)', edge: 'var(--berry-edge)' }
  if (tone === 'amber') return { bg: 'var(--amber)', edge: 'var(--amber-edge)' }
  return { bg: 'var(--brand)', edge: 'var(--brand-edge)' }
}

function SystemFlow({ steps, footnote, sims }) {
  return (
    <div className="ld-story">
      {steps.map((step, i) => {
        const paint = stepPaint(step.tone)
        const flip = i % 2 === 0
        return (
          <div
            key={step.id}
            className={`ld-story-row${flip ? ' ld-story-row--flip' : ''}`}
          >
            {step.art ? (
              <img
                className="ld-story-rockie"
                src={step.art}
                alt=""
                loading="lazy"
                draggable={false}
              />
            ) : null}

            <article className="gsurf ld-story-card">
              <div className="ld-story-card-top">
                <span
                  className="s ld-story-num"
                  style={{ background: paint.bg, boxShadow: `0 3px 0 ${paint.edge}` }}
                >
                  {step.n}
                </span>
                <span className="q ld-story-verb" style={{ color: paint.bg }}>{step.verb}</span>
              </div>
              <h3 className="s ld-story-title">{step.title}</h3>
              <p className="q ld-story-body">{step.body}</p>
              <div className="ld-story-graph" aria-hidden="true">
                <SystemSim kind={step.id} copy={sims?.[step.id]} />
              </div>
            </article>
          </div>
        )
      })}
      {footnote ? <p className="q ld-story-note">{footnote}</p> : null}
    </div>
  )
}

function Eyebrow({ color = 'var(--brand)', children }) {
  return (
    <span className="q ld-eyebrow" style={{ color }}>
      <span className="ld-eyebrow-dot" style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  )
}

function waitlistStatusMsg(copy, code) {
  if (code === 'name') return copy.errName
  if (code === 'email') return copy.errEmail
  if (code === 'duplicate') return copy.errDup
  if (code === 'offline') return copy.errOffline
  return copy.err
}

function feedbackStatusMsg(copy, code) {
  if (code === 'message') return copy.errMessage
  if (code === 'email') return copy.errEmail
  if (code === 'offline') return copy.errOffline
  return copy.err
}

function DeviceActions({ device }) {
  const w = device.waitlist
  const f = device.feedback
  const [open, setOpen] = useState(null) // null | 'waitlist' | 'propose'
  const [wlName, setWlName] = useState('')
  const [wlEmail, setWlEmail] = useState('')
  const [wlState, setWlState] = useState('idle')
  const [wlCode, setWlCode] = useState(null)
  const [fbName, setFbName] = useState('')
  const [fbEmail, setFbEmail] = useState('')
  const [fbMsg, setFbMsg] = useState('')
  const [fbState, setFbState] = useState('idle')
  const [fbCode, setFbCode] = useState(null)

  function close() {
    setOpen(null)
    setWlState('idle')
    setWlCode(null)
    setFbState('idle')
    setFbCode(null)
  }

  useEffect(() => {
    if (!open) return undefined
    const landing = document.querySelector('.landing')
    const prevLanding = landing ? landing.style.overflow : ''
    const prevBody = document.body.style.overflow
    if (landing) landing.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => {
      if (landing) landing.style.overflow = prevLanding
      document.body.style.overflow = prevBody
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function onWaitlist(e) {
    e.preventDefault()
    if (wlState === 'loading') return
    setWlState('loading')
    setWlCode(null)
    const res = await joinWaitlist({ name: wlName, email: wlEmail })
    if (res.ok) {
      setWlState('ok')
      setWlName('')
      setWlEmail('')
      return
    }
    setWlCode(res.code)
    setWlState('error')
  }

  async function onPropose(e) {
    e.preventDefault()
    if (fbState === 'loading') return
    setFbState('loading')
    setFbCode(null)
    const res = await sendRockieMessage({ name: fbName, email: fbEmail, message: fbMsg })
    if (res.ok) {
      setFbState('ok')
      setFbName('')
      setFbEmail('')
      setFbMsg('')
      return
    }
    setFbCode(res.code)
    setFbState('error')
  }

  const panel = open === 'waitlist' ? w : f
  const done = open === 'waitlist' ? wlState === 'ok' : fbState === 'ok'

  const modal = open ? (
    <motion.div
      className="ld-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ld-modal-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button type="button" className="ld-modal-scrim" aria-label={device.close} onClick={close} />
      <motion.div
        className="gsurf ld-modal-panel"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      >
        <div className="ld-modal-top ld-modal-top--end">
          <button type="button" className="q ld-modal-x" onClick={close} aria-label={device.close}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="ok"
              className="ld-modal-done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <span className="ld-modal-check" aria-hidden="true">
                <i className="ti ti-check" />
              </span>
              <h3 id="ld-modal-title" className="s ld-form-title">{panel.okTitle}</h3>
              <p className="q ld-form-lead">{panel.ok}</p>
              <BrandButton tone={open === 'waitlist' ? 'brand' : 'olive'} block onClick={close}>
                {device.doneCta}
              </BrandButton>
            </motion.div>
          ) : open === 'waitlist' ? (
            <motion.form
              key="waitlist"
              className="ld-modal-form"
              onSubmit={onWaitlist}
              noValidate
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h3 id="ld-modal-title" className="s ld-form-title">{w.title}</h3>
              <p className="q ld-form-lead">{w.lead}</p>
              <label className="q ld-field">
                <span>{w.name}</span>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  autoFocus
                  enterKeyHint="next"
                  value={wlName}
                  onChange={(e) => { setWlName(e.target.value); if (wlState !== 'idle') setWlState('idle') }}
                  placeholder={w.namePh}
                  maxLength={120}
                  required
                />
              </label>
              <label className="q ld-field">
                <span>{w.email}</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  enterKeyHint="done"
                  value={wlEmail}
                  onChange={(e) => { setWlEmail(e.target.value); if (wlState !== 'idle') setWlState('idle') }}
                  placeholder={w.emailPh}
                  maxLength={254}
                  required
                />
              </label>
              <BrandButton type="submit" tone="brand" block disabled={wlState === 'loading'}>
                {wlState === 'loading' ? w.sending : w.cta}
              </BrandButton>
              {wlState === 'error' && (
                <p className="q ld-form-err" role="alert">{waitlistStatusMsg(w, wlCode)}</p>
              )}
            </motion.form>
          ) : (
            <motion.form
              key="propose"
              className="ld-modal-form"
              onSubmit={onPropose}
              noValidate
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h3 id="ld-modal-title" className="s ld-form-title">{f.title}</h3>
              <p className="q ld-form-lead">{f.lead}</p>
              <label className="q ld-field">
                <span>{f.name}</span>
                <input
                  type="text"
                  name="fb-name"
                  autoComplete="name"
                  value={fbName}
                  onChange={(e) => { setFbName(e.target.value); if (fbState !== 'idle') setFbState('idle') }}
                  placeholder={f.namePh}
                  maxLength={120}
                />
              </label>
              <label className="q ld-field">
                <span>{f.email}</span>
                <input
                  type="email"
                  name="fb-email"
                  autoComplete="email"
                  inputMode="email"
                  value={fbEmail}
                  onChange={(e) => { setFbEmail(e.target.value); if (fbState !== 'idle') setFbState('idle') }}
                  placeholder={f.emailPh}
                  maxLength={254}
                />
              </label>
              <label className="q ld-field">
                <span>{f.message}</span>
                <textarea
                  name="message"
                  autoFocus
                  value={fbMsg}
                  onChange={(e) => { setFbMsg(e.target.value); if (fbState !== 'idle') setFbState('idle') }}
                  placeholder={f.messagePh}
                  rows={5}
                  maxLength={2000}
                  required
                />
              </label>
              <BrandButton type="submit" tone="amber" block disabled={fbState === 'loading'}>
                {fbState === 'loading' ? f.sending : f.cta}
              </BrandButton>
              {fbState === 'error' && (
                <p className="q ld-form-err" role="alert">{feedbackStatusMsg(f, fbCode)}</p>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  ) : null

  return (
    <>
      <div className="ld-announce-ctas">
        <BrandButton big tone="paper" block onClick={() => { setWlState('idle'); setWlCode(null); setOpen('waitlist') }}>
          {w.openCta}
        </BrandButton>
        <BrandButton big tone="amber" block onClick={() => { setFbState('idle'); setFbCode(null); setOpen('propose') }}>
          {f.openCta}
        </BrandButton>
      </div>

      {typeof document !== 'undefined'
        ? createPortal(<AnimatePresence>{modal}</AnimatePresence>, document.body)
        : null}
    </>
  )
}

function BrandButton({ children, onClick, big = false, tone = 'brand', type = 'button', disabled = false, block = false, className = '' }) {
  const tones = {
    brand: { bg: 'var(--brand)', edge: 'var(--brand-edge)', fg: '#fff' },
    green: { bg: 'var(--green)', edge: 'var(--green-edge)', fg: '#fff' },
    amber: { bg: 'var(--amber)', edge: 'var(--amber-edge)', fg: '#fff' },
    olive: { bg: 'var(--olive)', edge: 'var(--olive-edge)', fg: '#fff' },
    berry: { bg: 'var(--berry)', edge: 'var(--berry-edge)', fg: '#fff' },
    coral: { bg: 'var(--coral)', edge: 'var(--coral-edge)', fg: '#fff' },
    paper: { bg: 'var(--paper)', edge: 'var(--card-edge)', fg: 'var(--ink)' },
  }
  const t = tones[tone] || tones.brand
  return (
    <motion.button
      type={type}
      className={`gbtn q${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { y: 4 }}
      style={{
        '--edge': t.edge,
        background: t.bg,
        color: t.fg,
        borderRadius: 'var(--r-pill)',
        minHeight: 'var(--tap-min)',
        padding: big ? 'var(--space-4) var(--space-10)' : 'var(--space-3) var(--space-7)',
        fontSize: big ? 'var(--text-lg)' : 'var(--text-base)',
        fontWeight: 800,
        opacity: disabled ? 0.7 : 1,
        cursor: disabled ? 'wait' : 'pointer',
        width: block ? '100%' : undefined,
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
        fontSize: 'var(--text-base)',
        fontWeight: 700,
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
      className="q ld-lang"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span className="ld-lang-on">{current}</span>
      <span className="ld-lang-sep" aria-hidden="true">/</span>
      <span className="ld-lang-off">{next}</span>
    </button>
  )
}

const HERO_EVO = [
  { src: '/landing/rockies/art/pose-sparkle.png?v=hq-crop', alt: 'Rockie', scale: 1 },
  { src: '/landing/rockies/art/geoda-sparkle.png?v=hq-crop', alt: 'Geoda', scale: 1.18 },
]

function HeroRockieAlive({ chips }) {
  const [form, setForm] = useState(0)
  useEffect(() => {
    HERO_EVO.forEach((f) => {
      const im = new Image()
      im.src = f.src
    })
    const id = window.setInterval(() => setForm((i) => (i + 1) % HERO_EVO.length), 2800)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="ld-hero-alive">
      <div className="ld-hero-blob" aria-hidden="true" />
      <div className="ld-hero-evo float">
        {HERO_EVO.map((f, i) => (
          <img
            key={f.src}
            className={`ld-hero-evo-img${i === form ? ' is-on' : ''}`}
            src={f.src}
            alt={i === form ? f.alt : ''}
            draggable={false}
            style={{ '--evo-scale': f.scale }}
          />
        ))}
      </div>
      <span className="gpill q ld-chip ld-chip--1">{chips.goals}</span>
      <span className="gpill q ld-chip ld-chip--2">{chips.made}</span>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const desktop = useDesktop()
  const { t, toggle } = useLandingLang()
  const goEntrar = () => navigate('/entrar')
  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="landing">
      <header className="ld-nav">
        <div className="ld-wrap ld-nav-in">
          <a
            href="#top"
            className="s ld-nav-brand"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            style={{
              fontWeight: 800,
              fontSize: 22,
              color: 'var(--brand-logo)',
              letterSpacing: -1,
              textDecoration: 'none',
            }}
          >
            Rockie<em style={{ fontStyle: 'italic', color: 'var(--berry)', fontWeight: 600 }}>Plus</em>
          </a>
          <nav className="ld-nav-links q" aria-label={t.navAria}>
            <button type="button" onClick={() => scrollTo('rockie')}>{t.nav.rockie}</button>
            <button type="button" onClick={() => scrollTo('sistema')}>{t.nav.system}</button>
            <button type="button" onClick={() => scrollTo('aparato')}>{t.nav.device}</button>
            {/* Team HQ: oculto por ahora — ruta /team-hq sigue viva */}
          </nav>
          <div className="ld-nav-actions">
            <LangToggle
              current={t.langCurrent}
              next={t.langBtn}
              ariaLabel={t.langAria}
              onClick={toggle}
            />
            <BrandButton className="ld-nav-start" tone="brand" onClick={goEntrar}>{t.hasAccount}</BrandButton>
          </div>
        </div>
      </header>

      <section id="top" className="ld-wrap ld-hero">
        <Reveal>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-5)' }}>
            <Eyebrow color="var(--brand)">{t.hero.eyebrow}</Eyebrow>
            <h1 className="s ld-h1" style={{ margin: 0 }}>
              {t.hero.titleBefore}
              <span style={{ color: 'var(--berry)', fontStyle: 'italic' }}>{t.hero.titleEm}</span>
              {t.hero.titleAfter}
            </h1>
            <p className="q ld-sub" style={{ margin: 0, maxWidth: 520 }}>
              {t.hero.sub}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <BrandButton big tone="brand" onClick={goEntrar}>{t.hero.ctaPrimary}</BrandButton>
              <GhostButton onClick={goEntrar}>{t.hero.ctaSecondary}</GhostButton>
            </div>
            <BrandButton tone="amber" onClick={() => scrollTo('aparato')}>
              {t.hero.comingSoon}
            </BrandButton>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <HeroRockieAlive chips={t.chips} />
        </Reveal>
      </section>

      <section className="ld-idea" id="sync">
        <Reveal>
          <p className="s ld-idea-quote">{t.idea.line}</p>
          {t.idea.punch ? <p className="q ld-idea-attrib">{t.idea.punch}</p> : null}
        </Reveal>
      </section>

      <section className="ld-wrap ld-section ld-problem" id="problema">
        <Reveal>
          <Eyebrow color="var(--amber)">{t.problem.eyebrow}</Eyebrow>
          <h2 className="s ld-h2 ld-problem-title" style={{ margin: '0 0 var(--space-3)' }}>
            {t.problem.titleBefore}
            <em className="ld-problem-em">{t.problem.titleEm}</em>
            {t.problem.titleAfter}
          </h2>
          <p className="q ld-sub" style={{ margin: 0, maxWidth: 540 }}>{t.problem.sub}</p>
        </Reveal>
        <div className="ld-problem-grid">
          {t.problem.cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.06}>
              <article
                className="gsurf ld-problem-card"
                style={{ '--problem-accent': c.accent, '--problem-soft': c.soft }}
              >
                <div className="ld-problem-card-top">
                  <span className="ld-problem-icon" aria-hidden="true">
                    <i className={`ti ${c.icon}`} />
                  </span>
                  <span className="q ld-problem-tag">{c.tag}</span>
                </div>
                <h3 className="s ld-problem-card-title">{c.title}</h3>
                <p className="q ld-problem-card-body">{c.body}</p>
                <span className="ld-problem-card-mark" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              </article>
            </Reveal>
          ))}
        </div>
        {t.problem.bridge ? (
          <Reveal delay={0.16}>
            <p className="s ld-problem-bridge">{t.problem.bridge}</p>
          </Reveal>
        ) : null}
      </section>

      <section className="ld-section ld-band" id="rockie">
        <div className="ld-wrap">
          <Reveal>
            <Eyebrow color="var(--berry)">{t.rockie.eyebrow}</Eyebrow>
            <h2 className="s ld-h2" style={{ margin: '0 0 var(--space-3)' }}>{t.rockie.title}</h2>
            <p className="q ld-sub" style={{ margin: 0, maxWidth: 520 }}>{t.rockie.sub}</p>
          </Reveal>
          <MoodCarousel moods={t.rockie.moods} />
          <Reveal>
            <p className="s ld-geoda">{t.rockie.geoda}</p>
          </Reveal>
        </div>
      </section>

      <section className="ld-section ld-band" id="sistema">
        <div className="ld-wrap">
          <Reveal>
            <Eyebrow color="var(--olive)">{t.system.eyebrow}</Eyebrow>
            <h2 className="s ld-h2" style={{ margin: '0 0 var(--space-3)' }}>{t.system.title}</h2>
            <p className="q ld-sub" style={{ margin: 0, maxWidth: 520 }}>{t.system.sub}</p>
          </Reveal>
          <Reveal delay={0.08}>
            <SystemFlow steps={t.system.steps} footnote={t.system.footnote} sims={t.system.sims} />
          </Reveal>
        </div>
      </section>

      <section className="ld-wrap ld-section" id="aparato">
        {t.problem.announce ? (
          <Reveal>
            <aside className="ld-announce" aria-label={t.problem.announce.badge}>
              <div className="ld-announce-copy">
                <span className="q ld-announce-badge">
                  <i className="ti ti-speakerphone" aria-hidden="true" />
                  {t.problem.announce.badge}
                </span>
                <h3 className="s ld-announce-title">{t.problem.announce.title}</h3>
                <p className="q ld-announce-sub">{t.problem.announce.sub}</p>
                <DeviceActions device={t.device} />
              </div>
              <div className="ld-announce-art" aria-hidden="true">
                <span className="ld-announce-burst" />
                <span className="ld-announce-burst ld-announce-burst--2" />
                <img
                  className="ld-announce-img bob"
                  src="/landing/rockies/art/rockie-megafono-v2.png?v=real-marketing"
                  alt=""
                  width={2000}
                  height={2000}
                  decoding="async"
                />
              </div>
            </aside>
          </Reveal>
        ) : null}
        <Reveal>
          <Eyebrow color="var(--brand)">{t.device.eyebrow}</Eyebrow>
          <h2 id="aparato-detalle" className="s ld-h2" style={{ margin: '0 0 var(--space-3)' }}>{t.device.title}</h2>
          <p className="q ld-sub" style={{ margin: 0, maxWidth: 520 }}>{t.device.sub}</p>
        </Reveal>
        <div className="ld-device-grid">
          <Reveal>
            <div className="ld-device-col">
              <div className="ld-device-shell">
                <HeroDevice3D desktop={desktop} />
                <p className="q ld-device-hint">{t.device.orbit}</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="ld-device-side">
              <ul className="ld-features">
                {t.device.features.map((f) => (
                  <li key={f.title} className="gsurf">
                    <span
                      className="s"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: f.color,
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 'var(--text-xs)',
                        flexShrink: 0,
                      }}
                    >
                      {f.n}
                    </span>
                    <div>
                      <strong className="s" style={{ display: 'block', fontSize: 'var(--text-base)', color: 'var(--ink)' }}>{f.title}</strong>
                      <span className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>{f.body}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="ld-wrap ld-section" id="vinculo">
        <Reveal>
          <Eyebrow color="var(--olive)">{t.link.eyebrow}</Eyebrow>
          <h2 className="s ld-h2" style={{ margin: '0 0 var(--space-3)' }}>{t.link.title}</h2>
          <p className="q ld-sub" style={{ margin: 0, maxWidth: 480 }}>{t.link.sub}</p>
        </Reveal>
        <div className="ld-flow">
          {t.link.nodes.map((n, i) => (
            <Reveal key={n.t} delay={i * 0.06} className="ld-flow-piece">
              {i > 0 && <span className="ld-flow-arrow" aria-hidden="true">→</span>}
              <div className="gsurf ld-flow-node">
                <h3 className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', margin: '0 0 var(--space-1)' }}>{n.t}</h3>
                <p className="q" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>{n.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="ld-wrap ld-section" id="specs">
        <Reveal>
          <Eyebrow color="var(--brand)">{t.specs.eyebrow}</Eyebrow>
          <h2 className="s ld-h2" style={{ margin: '0 0 var(--space-3)' }}>{t.specs.title}</h2>
          <p className="q ld-sub" style={{ margin: 0, maxWidth: 480 }}>{t.specs.sub}</p>
        </Reveal>
        <div className="ld-specs">
          {t.specs.blocks.map((s) => (
            <div key={s.h} className="ld-spec">
              <h3 className="q">{s.h}</h3>
              <ul className="q">
                {s.items.map(([a, b]) => (
                  <li key={a}><strong>{a}</strong>{b ? ` ${b}` : ''}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-wrap ld-section ld-thq-teaser" id="team-hq">
        <Reveal>
          <div className="ld-thq-teaser-in">
            <div className="ld-thq-teaser-copy">
              <Eyebrow color="var(--amber)">{t.teamHqTeaser.eyebrow}</Eyebrow>
              <h2 className="s ld-h2" style={{ margin: '0 0 var(--space-3)' }}>
                {t.teamHqTeaser.titleBefore}
                <em style={{ color: 'var(--berry)', fontStyle: 'italic' }}>{t.teamHqTeaser.titleEm}</em>
                {t.teamHqTeaser.titleAfter}
              </h2>
              <p className="q ld-sub" style={{ margin: 0, maxWidth: 480 }}>{t.teamHqTeaser.sub}</p>
              <div style={{ marginTop: 'var(--space-5)' }}>
                <span
                  className="gbtn q"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    '--edge': 'var(--olive-edge)',
                    background: 'var(--olive)',
                    color: '#fff',
                    borderRadius: 'var(--r-pill)',
                    minHeight: 'var(--tap-min)',
                    padding: 'var(--space-3) var(--space-7)',
                    fontWeight: 800,
                    cursor: 'default',
                  }}
                >
                  <i className="ti ti-flask" aria-hidden="true" />
                  {t.teamHqTeaser.status}
                </span>
              </div>
            </div>
            <div className="ld-thq-teaser-art" aria-hidden="true">
              <img
                src="/landing/rockies/art/rockie-terno-1.png"
                alt=""
                width={640}
                height={640}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </Reveal>
      </section>

      <section className="ld-section ld-band" id="equipo">
        <div className="ld-wrap">
          <Reveal>
            <Eyebrow color="var(--berry)">{t.team.eyebrow}</Eyebrow>
            <h2 className="s ld-h2" style={{ margin: '0 0 var(--space-3)' }}>{t.team.title}</h2>
            <p className="q ld-sub" style={{ margin: 0, maxWidth: 520 }}>{t.team.sub}</p>
          </Reveal>
          <div className="ld-who">
            <Reveal>
              <article className="gsurf ld-who-card">
                <h3 className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)', margin: 0 }}>{t.team.alvaro.name}</h3>
                <p className="q ld-who-role">{t.team.alvaro.role}</p>
                <p className="q" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
                  {t.team.alvaro.body}
                </p>
              </article>
            </Reveal>
            <Reveal delay={0.08}>
              <article className="gsurf ld-who-card">
                <h3 className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)', margin: 0 }}>{t.team.jose.name}</h3>
                <p className="q ld-who-role">{t.team.jose.role}</p>
                <p className="q" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
                  {t.team.jose.body}
                </p>
              </article>
            </Reveal>
          </div>
          <Reveal>
            <p className="s ld-story-strip">{t.team.strip}</p>
          </Reveal>
        </div>
      </section>

      <section className="ld-cta" id="join">
        <div className="ld-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-5)' }}>
          <Reveal>
            <Eyebrow color="var(--amber)">{t.cta.eyebrow}</Eyebrow>
            <h2 className="s ld-h2" style={{ margin: '0 0 var(--space-3)', color: '#fff' }}>
              {t.cta.title}
            </h2>
            <p className="q ld-sub" style={{ margin: 0, maxWidth: 520, color: 'rgba(240,235,229,0.78)' }}>
              {t.cta.sub}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
              <BrandButton big tone="brand" onClick={goEntrar}>{t.cta.tryApp}</BrandButton>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
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
                {t.cta.writeUs}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer style={{ background: 'var(--paper-alt)' }}>
        <div
          className="ld-wrap"
          style={{
            paddingTop: 'var(--space-8)',
            paddingBottom: 'var(--space-8)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-4)',
            textAlign: 'center',
          }}
        >
          <Rockie emotion={{ eyes: 6, mouth: 7 }} size={88} float={false} stage={2} />
          <span className="s" style={{ fontWeight: 800, fontSize: 24, color: 'var(--brand-logo)', letterSpacing: -1 }}>
            Rockie<em style={{ fontStyle: 'italic', color: 'var(--berry)', fontWeight: 600 }}>Plus</em>
          </span>
          <p className="q" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
            {t.footer.tagline}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/legal" className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', fontWeight: 700 }}>
              {t.footer.legal}
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', fontWeight: 700 }}>
              {CONTACT_EMAIL}
            </a>
          </div>
          <span className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>&copy; 2026 RockiePlus · rockie.plus</span>
        </div>
      </footer>
    </div>
  )
}

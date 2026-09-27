import { HQ_ACHIEVEMENTS } from '../../data/hq/hqAchievements.js'
import { hqLevelOf, hqRankOf } from '../../data/hq/hqThemes.js'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import Rockie from '../../components/Rockie.jsx'

const MEDALS = ['#eaa545', '#9893a5', '#bd6c56']

export default function CuartelEquipo() {
  const { members, xp, unlocked, who, setWho } = useHqStore()
  const ranked = [...members].sort((a, b) => (xp[b.id] || 0) - (xp[a.id] || 0))

  return (
    <div className="scroll-area" style={{ padding: 'var(--space-4) var(--screen-x) var(--space-8)', flex: 1 }}>
      <p className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-soft)', marginBottom: 'var(--space-4)' }}>
        Cada miembro tiene su Rockie. Tus validaciones suman XP a tu nombre.
      </p>

      {ranked.map((m, i) => {
        const mxp = xp[m.id] || 0
        const lv = hqLevelOf(mxp)
        return (
          <div key={m.id} style={{ background: 'var(--card)', borderRadius: 'var(--r-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-3)', border: who === m.id ? '2px solid var(--azure)' : '2px solid transparent' }} onClick={() => setWho(m.id)}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              {i < 3 && <span style={{ fontSize: 'var(--text-lg)' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>}
              <div style={{ width: 56, height: 56 }}>
                <Rockie eyes={3} mouth={5} size={56} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="s" style={{ fontSize: 'var(--text-md)', color: m.c }}>{m.name}</div>
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{m.role}</div>
                <div className="q" style={{ fontSize: 'var(--text-s)', fontWeight: 700, marginTop: 'var(--space-1)' }}>
                  Nv {lv} · {hqRankOf(lv)} · {mxp} XP
                </div>
              </div>
            </div>
            {m.job && <p className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-soft)', marginTop: 'var(--space-2)' }}>{m.job}</p>}
          </div>
        )
      })}

      <div className="s" style={{ fontSize: 'var(--text-lg)', marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>Logros del equipo</div>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {HQ_ACHIEVEMENTS.map((a) => {
          const on = unlocked.includes(a.id)
          return (
            <div key={a.id} style={{ padding: 'var(--space-3)', borderRadius: 'var(--r-md)', background: on ? 'var(--olive-soft)' : 'var(--card-2)', opacity: on ? 1 : 0.55 }}>
              <div className="q" style={{ fontWeight: 700, color: on ? 'var(--olive)' : 'var(--ink)' }}>{a.name}</div>
              <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{a.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useHQ, HQ_THEMES, levelOf, rankOf, xpForLevel, ACHIEVEMENTS_DEF } from '../../data/hqStore.jsx'

function MedalIcon({ pos }) {
  const colors = ['#eaa545', 'var(--ink-muted)', '#bd6c56']
  const label  = ['Oro', 'Plata', 'Bronce']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: '50%',
      background: colors[pos], color: '#fff', fontSize: 11, fontWeight: 700,
    }}>
      {pos + 1}
    </span>
  )
}

function XPBar({ xp, nextXP }) {
  const pct = nextXP > 0 ? Math.min(100, (xp / nextXP) * 100) : 100
  return (
    <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: 'var(--azure)', borderRadius: 3,
        transition: 'width 0.6s ease',
      }} />
    </div>
  )
}

export default function HQEquipo() {
  const { space, members, xpMap, teamXP, streak, achievements } = useHQ()
  const theme = HQ_THEMES[space.colorTheme] || HQ_THEMES.coral

  // Ordenar por XP descendente
  const sorted = [...members].sort((a, b) => (xpMap[b.id] || 0) - (xpMap[a.id] || 0))

  // Logros desbloqueados
  const unlockedIds = new Set(achievements.map(a => a.id))

  return (
    <div style={{ padding: 'var(--space-4) var(--screen-x) var(--space-10)' }}>
      {/* Estadisticas del equipo */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        {[
          { label: 'XP del equipo', value: teamXP, icon: 'ti-star', color: theme.accent },
          { label: 'Racha (dias)',   value: streak,  icon: 'ti-flame', color: 'var(--coral)' },
          { label: 'Miembros',      value: members.length, icon: 'ti-users', color: 'var(--azure)' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: 'var(--card)',
            borderRadius: 'var(--r-md)', padding: 'var(--space-3)',
            boxShadow: 'var(--shadow-soft)', textAlign: 'center',
          }}>
            <i className={`ti ${s.icon}`} style={{ fontSize: 16, color: s.color }} />
            <p className="s" style={{ margin: '2px 0 0', fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
              {s.value}
            </p>
            <p className="q" style={{ margin: 0, fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)' }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Titulo ranking */}
      <p className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', margin: '0 0 var(--space-3)' }}>
        Ranking del equipo
      </p>

      {/* Tarjetas de miembros */}
      {sorted.map((member, idx) => {
        const xp   = xpMap[member.id] || 0
        const lv   = levelOf(xp)
        const rank = rankOf(lv)
        const nextXP = xpForLevel(lv + 1)
        const isPodium = idx < 3

        return (
          <div key={member.id} style={{
            background: 'var(--card)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-3)',
            boxShadow: 'var(--shadow-soft)',
            borderLeft: isPodium ? `3px solid ${member.color}` : '3px solid transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              {/* Posicion + avatar */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {isPodium ? <MedalIcon pos={idx} /> : (
                  <span className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', fontWeight: 700 }}>
                    {idx + 1}
                  </span>
                )}
                <span style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: member.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 'var(--text-sm)',
                }}>
                  {member.name.charAt(0)}
                </span>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                  <span className="q" style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
                    {member.name}
                  </span>
                  <span className="q" style={{
                    fontSize: 'var(--text-2xs)', color: theme.accent,
                    background: theme.accentSoft, padding: '1px 6px', borderRadius: 'var(--r-pill)',
                  }}>
                    {rank} · Lv {lv}
                  </span>
                </div>
                <p className="q" style={{ margin: '2px 0 4px', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
                  {member.role} · {member.job}
                </p>
                <XPBar xp={xp} nextXP={nextXP} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                    {xp} XP
                  </span>
                  <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-faint)' }}>
                    → {nextXP} XP
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Logros del equipo */}
      <p className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', margin: 'var(--space-6) 0 var(--space-3)' }}>
        Logros del equipo
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
        {ACHIEVEMENTS_DEF.map(ach => {
          const unlocked = unlockedIds.has(ach.id)
          return (
            <div key={ach.id} style={{
              background: 'var(--card)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--space-3)',
              boxShadow: 'var(--shadow-soft)',
              opacity: unlocked ? 1 : 0.45,
              borderTop: unlocked ? `3px solid ${theme.accent}` : '3px solid var(--line)',
            }}>
              <p className="q" style={{
                margin: '0 0 2px',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                color: unlocked ? 'var(--ink)' : 'var(--ink-muted)',
              }}>
                {unlocked ? '✅ ' : '🔒 '}{ach.name}
              </p>
              <p className="q" style={{
                margin: 0,
                fontSize: 'var(--text-2xs)',
                color: 'var(--ink-muted)',
                lineHeight: 1.3,
              }}>
                {ach.desc}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

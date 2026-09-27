import { motion } from 'framer-motion'
import { HQ_THEMES } from '../data/hqStore.jsx'
import './HQNav.css'

export const HQ_TABS = [
  { id: 'tablero',    title: 'Tablero',    icon: 'ti-layout-kanban' },
  { id: 'hitos',      title: 'Hitos',      icon: 'ti-target-arrow' },
  { id: 'equipo',     title: 'Equipo',     icon: 'ti-users' },
  { id: 'base',       title: 'Base',       icon: 'ti-folder' },
  { id: 'manifiesto', title: 'Manifiesto', icon: 'ti-star' },
]

export default function HQNav({ activeTab, onSelectTab, space }) {
  const theme = HQ_THEMES[space?.colorTheme] || HQ_THEMES.coral
  const currentTab = HQ_TABS.find(t => t.id === activeTab) || HQ_TABS[0]

  return (
    <header className="hq-nav-wrap" aria-label="Navegacion Cuartel HQ">
      {/* Fila superior editorial */}
      <div className="hq-header-row">
        <div>
          <div className="q hq-kicker">
            <span
              className="hq-theme-dot"
              style={{
                background: theme.accent,
                boxShadow: `0 0 0 2px ${theme.accentSoft}`,
              }}
            />
            {space?.name || 'B+'} HQ · CUARTEL
          </div>
          <h1 className="s hq-section-title">
            {currentTab.title}
          </h1>
        </div>

        {space?.tagline && (
          <div className="q hq-tagline-badge" title={space.tagline}>
            {space.tagline}
          </div>
        )}
      </div>

      {/* Fila de navegacion con solo iconos (5 botones con tamano parejo) */}
      <nav className="hq-subnav-row" role="tablist">
        {HQ_TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <motion.button
              key={tab.id}
              role="tab"
              aria-selected={active}
              aria-label={tab.title}
              title={tab.title}
              className={`hq-subnav-btn ${active ? 'on' : ''}`}
              style={active ? {
                background: theme.accent,
                boxShadow: `0 3px 0 ${theme.edge}`,
              } : undefined}
              whileTap={{ scale: 0.92 }}
              onClick={() => onSelectTab(tab.id)}
            >
              <i className={`ti ${tab.icon}`} />
              <span className="hq-subnav-label q">{tab.title}</span>
            </motion.button>
          )
        })}
      </nav>
    </header>
  )
}

import type { LinkItem } from '../../lib/types'
import { useSpaceRow } from '../data/queries'

// Los links generales del equipo (los de la antigua "Base"): Drive, el repo, el Figma…
export function TeamLinks() {
  const space = useSpaceRow().data
  const links = ((space?.links as LinkItem[] | undefined) ?? []).filter((l) => l.url)
  if (!links.length) return null
  return (
    <section style={{ marginTop: 32 }}>
      <div className="sectionh"><h2>Recursos del equipo</h2></div>
      <div className="card">
        <ul className="feed">
          {links.map((l, i) => (
            <li key={i} style={{ gridTemplateColumns: '28px 1fr' }}>
              <span className="adot" style={{ ['--ac' as string]: l.c ?? 'var(--accent)', width: 14, height: 14, marginTop: 4 }} />
              <a href={l.url} target="_blank" rel="noopener noreferrer"><b>{l.t}</b>{l.d && <span className="when">{l.d}</span>}</a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

import { useMemo } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { fileKind, fmtBytes, folderSubtree, KIND_LABEL, openMaterial, serviceOf, useFolders, useMaterials } from './data'

/** Materiales de un proyecto (ligados a él o dentro de sus carpetas), para su panel. */
export function ProjectMaterials({ projectId }: { projectId: string }) {
  const folders = useFolders().data
  const materials = useMaterials().data
  const { own, folder } = useMemo(() => {
    const fs = folders ?? []
    const mine = fs.filter((f) => f.project_id === projectId)
    const ids = new Set<string>()
    for (const f of mine) for (const id of folderSubtree(fs, f.id)) ids.add(id)
    const list = (materials ?? []).filter((m) => m.project_id === projectId || (m.folder_id && ids.has(m.folder_id)))
    return { own: list, folder: mine[0] }
  }, [folders, materials, projectId])

  return (
    <>
      <div className="sectionh" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 'var(--t-lg)' }}>Materiales ({own.length})</h2>
        <Link className="btn ghost sm" to={folder ? `/materiales?carpeta=${folder.id}` : '/materiales'}>
          <Icon name="folder" className="sm" /> {folder ? 'Abrir carpeta' : 'Ir a Materiales'}
        </Link>
      </div>
      {own.length === 0 ? (
        <p className="hint">Liga una carpeta de Materiales a este proyecto y todo lo que tenga aparece aquí.</p>
      ) : (
        <ul className="history">
          {own.slice(0, 8).map((m) => (
            <li key={m.id}>
              <button type="button" className="linkish" onClick={() => void openMaterial(m)}>
                <b>{m.name}</b>
              </button>{' '}
              · {m.kind === 'link' ? serviceOf(m.url ?? '').name : `${KIND_LABEL[fileKind(m)]}, ${fmtBytes(Number(m.size_bytes))}`}
            </li>
          ))}
          {own.length > 8 && <li className="hint">y {own.length - 8} más</li>}
        </ul>
      )}
    </>
  )
}

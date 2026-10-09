import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { toast, toastError } from '../../components/Toasts'
import { haptic } from '../../lib/fx'
import { humanError, supabase } from '../../lib/supabase'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useSpaceRow } from '../data/queries'

// Claude en este proyecto. El proyecto está cifrado (el Cofre): ni Rockie ni Claude lo pueden leer. Si su dueño lo
// abre para Claude, su nombre, sus áreas y sus tareas pasan a guardarse sin cifrar (la app las reescribe sola al
// volver a leerlas) y el conector de Rockie (rockie.plus/mcp) puede verlas, crear tareas y moverlas por
// Por hacer → En curso → Hecho mientras Claude trabaja. Cerrarlo las vuelve a cifrar.

const INSTRUCCION =
  'Usa el conector de Rockie para este proyecto: al empezar una tarea, muévela a en_curso; al terminarla, a hecho con una nota corta de lo que hiciste. Si aparece trabajo nuevo, créalo como tarea.'

export function ClaudeProyecto() {
  const { spaceId, isOwner } = useSpace()
  const qc = useQueryClient()
  const space = useSpaceRow().data
  const abierto = Boolean((space as { abierto_claude?: boolean } | undefined)?.abierto_claude)
  const [ocupado, setOcupado] = useState(false)
  const url = `${location.origin}/mcp`

  async function cambiar(abrir: boolean) {
    if (!space) return
    if (abrir && !window.confirm(`¿Abrir «${space.name}» para Claude? Su nombre, sus áreas y sus tareas dejan de estar cifrados para que Claude los pueda leer y mover.`)) return
    setOcupado(true)
    // el nombre va en el mismo cambio: así queda en claro (o se vuelve a cifrar) en el acto
    const { error } = await supabase.from('spaces').update({ abierto_claude: abrir, name: space.name } as never).eq('id', spaceId)
    if (error) {
      setOcupado(false)
      return toastError(humanError(error))
    }
    // al volver a leerlas, cada tarea y cada área se guarda abierta (o se vuelve a cifrar) sola
    await Promise.all(
      [keys.space(spaceId), keys.tasks(spaceId), keys.areas(spaceId), keys.projects(spaceId), keys.goals(spaceId), ['memberships']].map((k) =>
        qc.invalidateQueries({ queryKey: k }),
      ),
    )
    setOcupado(false)
    haptic(6)
    toast(abrir ? `Claude ya puede ver y mover las tareas de «${space.name}»` : `«${space.name}» volvió a cifrarse: Claude ya no lo ve`, { kind: 'ok', icon: 'check' })
  }

  const copiar = async (t: string, que: string) => {
    try {
      await navigator.clipboard.writeText(t)
      toast(`${que} copiado`, { kind: 'ok', icon: 'check' })
    } catch {
      toastError('No se pudo copiar')
    }
  }

  return (
    <section className="card pad claude-proy" aria-label="Claude en este proyecto">
      <div className="sectionh">
        <h2>Claude</h2>
      </div>
      <p className="hint">
        Con el proyecto abierto para Claude, Claude ve sus tareas, crea las que falten y las mueve de Por hacer a En curso y a Hecho mientras
        trabaja. Hecho no es validada: eso sigue siendo de ustedes.
      </p>
      <div className={`claude-proy-sw${abierto ? ' on' : ''}`}>
        <span className="claude-proy-ic">
          <Icon name={abierto ? 'sparkle' : 'lock'} />
        </span>
        <span className="claude-proy-t">
          <b>{abierto ? 'Abierto para Claude' : 'Cifrado: Claude no lo ve'}</b>
          <small>{abierto ? 'Su nombre, áreas y tareas están sin cifrar' : 'Nadie fuera del equipo puede leerlo, ni Rockie'}</small>
        </span>
        {isOwner ? (
          <button
            type="button"
            role="switch"
            aria-checked={abierto}
            aria-label="Abrir este proyecto para Claude"
            className="claude-proy-btn"
            disabled={ocupado || !space}
            onClick={() => void cambiar(!abierto)}
          >
            <i />
          </button>
        ) : (
          <small className="claude-proy-dueno">Lo decide el dueño</small>
        )}
      </div>
      {abierto && (
        <div className="claude-proy-pasos">
          <p className="lbl">1 · Conecta Rockie en Claude (una sola vez)</p>
          <p className="hint">En Claude: Ajustes › Conectores › Agregar conector personalizado, y pega esta dirección. En Claude Code: <code>claude mcp add --transport http rockie {url}</code>.</p>
          <span className="claude-proy-url">
            <code>{url}</code>
            <button type="button" className="btn ghost sm" onClick={() => void copiar(url, 'Dirección')}>
              <Icon name="copy" className="sm" /> Copiar
            </button>
          </span>
          <p className="lbl">2 · Pídele que las mueva solo (pega esto en las instrucciones de tu proyecto en Claude)</p>
          <span className="claude-proy-url">
            <code>{INSTRUCCION}</code>
            <button type="button" className="btn ghost sm" onClick={() => void copiar(INSTRUCCION, 'Instrucción')}>
              <Icon name="copy" className="sm" /> Copiar
            </button>
          </span>
        </div>
      )}
    </section>
  )
}

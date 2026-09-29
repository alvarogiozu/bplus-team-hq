import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toasts'
import type { Json } from '../lib/database.types'
import { fmtDay, weekday, WEEKDAY_NAMES } from '../lib/dates'
import { anchorsOf, type Routine } from './blocks'
import { useAgendaActions, usePrefs } from './data'
import { useDayActions, useDayMap } from './days'
import { AIcon } from './icons'
import { hhmm, parseHhmm } from './time'

// Tocar el sol o la luna de un día: cambiar SOLO ese día, volverlo tu rutina de ese día de la
// semana ("todos los sábados") o regresar a la rutina. Arrastrarlos hace lo mismo que "solo este día".
export type AnchorEdit = { which: 'wake' | 'sleep'; day: string } | null

/** "sábado" -> "sábados"; "lunes" se queda igual. */
export const pluralDay = (dow: number) => (WEEKDAY_NAMES[dow].endsWith('s') ? WEEKDAY_NAMES[dow] : `${WEEKDAY_NAMES[dow]}s`)
/** La hora ya no choca con la otra punta del día (al menos 30 min entre despertar y dormir). */
export const anchorOk = (which: 'wake' | 'sleep', min: number, other: number) => (which === 'wake' ? min <= other - 30 : min >= other + 30)

export function AnchorSheet({ edit, onClose, onRoutine }: { edit: AnchorEdit; onClose: () => void; onRoutine: () => void }) {
  const title = edit ? `${edit.which === 'wake' ? 'Despertar' : 'A dormir'} · ${fmtDay(edit.day)}` : ''
  return (
    <Sheet open={Boolean(edit)} onClose={onClose} title={title}>
      {edit && <AnchorBody key={`${edit.which}:${edit.day}`} edit={edit} onClose={onClose} onRoutine={onRoutine} />}
    </Sheet>
  )
}

function AnchorBody({ edit, onClose, onRoutine }: { edit: NonNullable<AnchorEdit>; onClose: () => void; onRoutine: () => void }) {
  const prefs = usePrefs().data
  const dayMap = useDayMap()
  const { savePrefs } = useAgendaActions()
  const { setDay } = useDayActions()
  const a = anchorsOf(prefs, edit.day, dayMap.get(edit.day))
  const wake = edit.which === 'wake'
  const key = wake ? 'wake_min' : 'sleep_min'
  const custom = wake ? a.custom.wake : a.custom.sleep
  const base = wake ? a.base.wake : a.base.sleep
  const [t, setT] = useState(hhmm(wake ? a.wake : a.sleep))
  const min = parseHhmm(t)
  const ok = min != null && anchorOk(edit.which, min, wake ? a.sleep : a.wake)
  const dow = weekday(edit.day)

  async function onlyThisDay() {
    if (!ok || min == null) return
    const undo = await setDay(edit.day, { [key]: min })
    if (undo) toast(`${wake ? 'Te despiertas' : 'Te duermes'} a las ${hhmm(min)} el ${fmtDay(edit.day)} (solo ese día)`, { action: { label: 'Deshacer', onClick: () => void undo() } })
    onClose()
  }
  async function everyWeek() {
    if (!ok || min == null) return
    const routine = { ...((prefs?.routine ?? {}) as Routine) }
    routine[String(dow)] = { ...routine[String(dow)], [wake ? 'wake' : 'sleep']: min }
    await savePrefs({ routine: routine as unknown as Json })
    if (custom) await setDay(edit.day, { [key]: null })
    toast(`Todos los ${pluralDay(dow)}: ${wake ? 'despertar' : 'dormir'} a las ${hhmm(min)}`)
    onClose()
  }
  async function backToRoutine() {
    await setDay(edit.day, { [key]: null })
    onClose()
  }

  return (
    <div className="ag-anchor">
      <p className="hint" style={{ margin: 0 }}>
        {wake ? '¿A qué hora te levantas' : '¿A qué hora te vas a dormir'} el {fmtDay(edit.day)}?{custom ? ` Tu rutina de los ${pluralDay(dow)} dice ${hhmm(base)}.` : ''}
      </p>
      <label className="ag-anchor-time">
        <AIcon name={wake ? 'sun' : 'moon'} size={22} />
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} aria-label={wake ? 'Hora de despertar' : 'Hora de dormir'} />
      </label>
      {min != null && !ok && <p className="rk-err">{wake ? 'Tiene que ser antes de tu hora de dormir.' : 'Tiene que ser después de tu hora de despertar.'}</p>}
      <div className="ag-anchor-acts">
        <button className="btn" disabled={!ok} onClick={() => void onlyThisDay()}>
          Solo este día
        </button>
        <button className="btn ghost" disabled={!ok} onClick={() => void everyWeek()}>
          Todos los {pluralDay(dow)}
        </button>
        {custom && (
          <button className="btn ghost" onClick={() => void backToRoutine()}>
            <AIcon name="undo" size={15} /> Volver a mi rutina ({hhmm(base)})
          </button>
        )}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Atajo: arrastra {wake ? 'el sol' : 'la luna'} en tu día y suéltalo en la nueva hora (cambia solo ese día).
      </p>
      <button className="ag-linkbtn" onClick={onRoutine}>
        Ver mi rutina de la semana
      </button>
    </div>
  )
}

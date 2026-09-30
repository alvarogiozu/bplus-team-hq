import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { addDays, todayIn } from '../../lib/dates'
import { availSummary, statusNow, statusText, useTeamAvailability } from '../../agenda/availability'
import { AvailabilityEditor } from '../../agenda/AvailabilityEditor'
import { useMe } from '../auth/AuthProvider'
import { useMembers } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'
import { FindTime } from './FindTime'
import '../../agenda/agenda.css'

// Disponibilidad en el Equipo: cómo está cada quien ahora (en su tarjeta), tu horario y
// "Buscar hueco" para reunirse sin preguntar uno por uno.

function useTeamNow() {
  const { spaceId } = useSpace()
  const { profile } = useMe()
  const tz = profile.timezone
  const today = todayIn(tz)
  const q = useTeamAvailability(spaceId ? [spaceId] : [], today, addDays(today, 14))
  // el estado ("hasta 15:30") avanza solo
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  return { data: q.data, tz }
}

/** Una línea en la tarjeta de cada persona: disponible, ocupada, fuera de horario… */
export function MemberStatus({ userId }: { userId: string }) {
  const { data, tz } = useTeamNow()
  if (!data) return null
  const st = statusNow(data, userId, tz)
  return (
    <span className={`mstat st-${st.kind}`}>
      <i aria-hidden="true" /> {statusText(st, tz)}
    </span>
  )
}

export function TeamAvailability() {
  const { spaceId } = useSpace()
  const { userId } = useMe()
  const members = useMembers().data ?? []
  const { data } = useTeamNow()
  const [find, setFind] = useState(false)
  const [mine, setMine] = useState(false)
  const my = data?.members.find((m) => m.user_id === userId)
  const others = members.filter((m) => m.user_id !== userId)
  if (!spaceId || !others.length) return null
  return (
    <section className="card tavail" aria-label="Disponibilidad del equipo">
      <span className="tavail-ic" aria-hidden="true">
        <Icon name="calendar" />
      </span>
      <div className="tavail-txt">
        <b>¿Cuándo nos reunimos?</b>
        <small>Cada quien pone su horario; lo ocupado sale de su agenda y sus reuniones (sin mostrar lo privado).</small>
      </div>
      <button className="btn ghost sm" onClick={() => setMine(true)}>
        <Icon name="clock" className="sm" /> Mi horario: {availSummary(my?.availability)}
      </button>
      <button className="btn sm" onClick={() => setFind(true)}>
        <Icon name="search" className="sm" /> Buscar hueco
      </button>
      {find && <FindTime people={others.map((m) => ({ id: m.user_id, name: m.profile.display_name, color: m.profile.color, spaces: [spaceId] }))} onClose={() => setFind(false)} />}
      <Sheet open={mine} onClose={() => setMine(false)} title="Mi horario para el equipo">
        <AvailabilityEditor />
      </Sheet>
    </section>
  )
}

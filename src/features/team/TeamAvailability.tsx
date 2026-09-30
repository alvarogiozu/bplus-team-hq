import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { addDays, todayIn } from '../../lib/dates'
import { availSummary, hasAvail, statusNow, statusText, useTeamAvailability } from '../../agenda/availability'
import { MyHoursSheet } from '../../agenda/AvailabilityEditor'
import { setPeople } from '../../agenda/People'
import { useMe } from '../auth/AuthProvider'
import { useMembers } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'
import '../../agenda/agenda.css'

// Disponibilidad en el Equipo: cómo está cada quien ahora (en su tarjeta; al tocarla se abre su
// semana en la Agenda), tu horario y "Ver disponibilidad" del equipo entero.

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

/** abre la Agenda con la semana de esas personas */
function useOpenAvailability() {
  const nav = useNavigate()
  return (ids: string[]) => {
    setPeople(ids)
    nav('/agenda?personas=1')
  }
}

/** Una línea en la tarjeta de cada persona: disponible, ocupada, fuera de horario… (toca = ver su semana) */
export function MemberStatus({ userId }: { userId: string }) {
  const { data, tz } = useTeamNow()
  const { userId: me } = useMe()
  const open = useOpenAvailability()
  if (!data) return null
  const st = statusNow(data, userId, tz)
  return (
    <button className={`mstat st-${st.kind}`} onClick={() => open(userId === me ? [] : [userId])} title="Ver su semana en la Agenda">
      <i aria-hidden="true" /> {statusText(st, tz)}
    </button>
  )
}

export function TeamAvailability() {
  const { spaceId } = useSpace()
  const { userId } = useMe()
  const members = useMembers().data ?? []
  const { data } = useTeamNow()
  const open = useOpenAvailability()
  const [mine, setMine] = useState(false)
  const my = data?.members.find((m) => m.user_id === userId)
  const others = members.filter((m) => m.user_id !== userId)
  if (!spaceId || !others.length) return null
  const noHours = data && !hasAvail(my?.availability)
  return (
    <section className="card tavail" aria-label="Disponibilidad del equipo">
      <span className="tavail-ic" aria-hidden="true">
        <Icon name="calendar" />
      </span>
      <div className="tavail-txt">
        <b>Disponibilidad del equipo</b>
        <small>
          {noHours
            ? 'Pon tu horario para que tu equipo sepa cuándo contar contigo (fuera de él te ven «no disponible»).'
            : 'La semana de cada quien en su color: lo privado sale «Ocupado» y lo de fuera de su horario, rayado.'}
        </small>
      </div>
      <button className={`btn sm${noHours ? '' : ' ghost'}`} onClick={() => setMine(true)}>
        <Icon name="clock" className="sm" /> {noHours ? 'Poner mi horario' : `Mi horario: ${availSummary(my?.availability)}`}
      </button>
      <button className={`btn sm${noHours ? ' ghost' : ''}`} onClick={() => open(others.map((m) => m.user_id))}>
        <Icon name="calendar" className="sm" /> Ver disponibilidad
      </button>
      <MyHoursSheet open={mine} onClose={() => setMine(false)} />
    </section>
  )
}

import { supabase } from '../lib/supabase'
import { olvidarNivelAgenda } from '../lib/cofre/fetchCifrado'
import { BLOQUEADO } from '../lib/cofre/cripto'

/** Cambió cuánto ve tu equipo de tu agenda: lo que no marcaste aparte se vuelve a guardar con la llave que le toca
 *  ahora (la de tu agenda, que recibe tu equipo, si muestras títulos; la tuya, si solo «Ocupado»). Ver lib/cofre. */
export async function recifrarAgendaVisible() {
  olvidarNivelAgenda()
  const desde = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('agenda_items')
    .select('id, title, notes, subtasks')
    .is('visibility', null)
    .gte('day', desde)
    .limit(500)
  for (const it of data ?? []) {
    if (it.title === BLOQUEADO) continue // no se pudo abrir aquí: no se toca
    await supabase.from('agenda_items').update({ title: it.title, notes: it.notes, subtasks: it.subtasks, visibility: null }).eq('id', it.id)
  }
}

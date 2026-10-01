import { supabase } from '../lib/supabase'
import { BLOQUEADO } from '../lib/cofre/cripto'

/** Vuelve a guardar el título y el texto de una página para que queden cifrados con la llave que le toca ahora:
 *  al compartirla, la de la página (que recibe el equipo); al dejar de compartirla, la tuya (ver lib/cofre). */
export async function recifrarNota(id: string): Promise<boolean> {
  const { data } = await supabase.from('cuaderno_notes').select('title, body').eq('id', id).maybeSingle()
  // si algo no se pudo abrir en este dispositivo, no se toca (se guardaría el candado en vez del texto)
  if (!data || data.title === BLOQUEADO || data.body === BLOQUEADO) return false
  const { error } = await supabase.from('cuaderno_notes').update({ title: data.title, body: data.body }).eq('id', id)
  return !error
}

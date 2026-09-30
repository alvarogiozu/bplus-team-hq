import { supabase } from '../../lib/supabase'

// Crear un proyecto (en la base se llama "space"). Una persona puede tener todos los que quiera:
// personales o compartidos. La función de la base todavía siembra las áreas de B+ (App, PCB,
// Firmware…), que no tienen sentido para una tesis o un curso: el proyecto nace sin áreas y cada
// quien crea las suyas en Ajustes.
export async function crearProyecto(nombre: string): Promise<{ id: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('create_space', { p_name: nombre.trim() })
  if (error || !data) return { id: null, error }
  await supabase.from('areas').delete().eq('space_id', data)
  return { id: data, error: null }
}

// colores bien distintos entre sí (sin los tonos casi iguales de la paleta)
const COLORES = ['#2a82ad', '#b4637a', '#8aa54a', '#eaa545', '#a573a5', '#cf7358', '#659ca5', '#575279']

/** Un color fijo por proyecto (sale de su id) para distinguir "Mi tesis" de "Mi curso" de un vistazo. */
export function colorDeProyecto(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return COLORES[Math.abs(h) % COLORES.length]
}

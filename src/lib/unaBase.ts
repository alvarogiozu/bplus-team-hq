// Una cuenta, una base (9 oct 2026). Los datos de Hábitos viven en el esquema `habitos` de Rockie OS y la persona es
// la de Rockie OS: ya no hay una segunda cuenta ni un puente hacia la base de Hábitos. Esa base queda solo como
// puerta de Google (se entra por ella y la función puente-google abre la sesión de Rockie OS) y, en solo lectura,
// como vuelta atrás.
// Vuelta atrás: VITE_HABITOS_UNIDA=0 en el entorno y BPLUS COMEBACK/supabase/deshacer-solo-lectura.sql en esa base.
export const UNIDA = import.meta.env.VITE_HABITOS_UNIDA !== '0'
export const ESQUEMA_HABITOS = UNIDA ? 'habitos' : 'public'
export const BUCKET_PRUEBAS = UNIDA ? 'habitos-proofs' : 'proofs'
export const BUCKET_AVATARES = UNIDA ? 'habitos-avatars' : 'avatars'

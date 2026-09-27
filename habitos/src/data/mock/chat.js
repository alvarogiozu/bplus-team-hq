// Hilos de chat mock por canal ('group:<id>' | 'reto:<id>'). En live los
// reemplaza la tabla `messages` de Supabase (migracion 0004). Igual que el
// resto de mock/: NO importar desde componentes; el acceso es via useChat.

export const MOCK_CHATS = {
  'group:g1': [
    { id: 'c1', kind: 'text', author: 'Luisa', avatar: '🧑', color: 'var(--olive)', body: 'Buenos dias equipo! Ya estoy arriba 🌅', time: '5:04' },
    { id: 'c2', kind: 'event', author: 'Luisa', avatar: '🧑', color: 'var(--olive)', body: 'valido "Despertar 5am" con foto', payload: { mode: 'photo', habit_name: 'Despertar 5am' }, time: '5:06' },
    { id: 'c3', kind: 'text', author: 'Rafa', avatar: '👦', color: 'var(--green)', body: 'Crack! Yo voy saliendo a correr', time: '5:12' },
    { id: 'c4', kind: 'event', author: 'Rafa', avatar: '👦', color: 'var(--green)', body: 'valido "Despertar 5am" con foto', payload: { mode: 'photo', habit_name: 'Despertar 5am' }, time: '5:15' },
    { id: 'c5', kind: 'text', author: 'Marco', avatar: '👩', color: 'var(--teal-soft)', body: 'Diego sigue dormido seguro 😅 alguien que lo llame', time: '6:30' },
    { id: 'c6', kind: 'event', author: 'Diego', avatar: '🧒', color: 'var(--paper-dark)', body: 'aplazo "Despertar 5am" para manana (racha protegida)', payload: { mode: 'tomorrow', habit_name: 'Despertar 5am' }, time: '9:41' },
  ],
  'group:g2': [
    { id: 'c1', kind: 'text', author: 'Sara', avatar: '👩', color: 'var(--olive)', body: 'Hoy pierna 🦵 quien viene a las 6?', time: '14:02' },
    { id: 'c2', kind: 'event', author: 'Sara', avatar: '👩', color: 'var(--olive)', body: 'marco "Ir al gym" como hecho', payload: { mode: 'check', habit_name: 'Ir al gym' }, time: '19:10' },
    { id: 'c3', kind: 'text', author: 'Carlos', avatar: '🧔', color: 'var(--paper-dark)', body: 'Manana si o si, hoy no pude 😞', time: '20:15' },
  ],
  'group:g3': [
    { id: 'c1', kind: 'text', author: 'Ana', avatar: '👩', color: 'var(--teal-soft)', body: 'Este domingo toca el capitulo 4 📖 no se olviden', time: '11:20' },
  ],
  'reto:r1': [
    { id: 'c1', kind: 'text', author: 'Luisa', avatar: '🧑', color: 'var(--olive)', body: 'Semana final del reto! Nadie afloja 💪', time: '5:20' },
    { id: 'c2', kind: 'event', author: 'Marco', avatar: '👩', color: 'var(--teal-soft)', body: 'valido "Despertar antes de 6am" con foto', payload: { mode: 'photo', habit_name: 'Despertar antes de 6am' }, time: '5:48' },
  ],
  'reto:r2': [
    { id: 'c1', kind: 'text', author: 'Diego', avatar: '🧒', color: 'var(--paper-dark)', body: 'El azucar me esta matando pero ahi vamos 🍬🚫', time: '16:33' },
  ],
}

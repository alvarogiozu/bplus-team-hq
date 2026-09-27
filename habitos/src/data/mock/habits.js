// Datos mock de habitos. En fase 3 este archivo desaparece:
// lo reemplazan queries a las tablas `habits` y `completions` de Supabase.
// Las formas estan documentadas en ../contract.js (typedef Habit).
// `streak` = racha de ESE habito (revelado del cristal, doc 21). Valores variados
// a proposito para mostrar todas las etapas: bruto/grieta/asoma/formado/gema.

// Catalogo completo (pantalla Habitos + fuente para el dia)
export const ALL_HABITS = [
  { id: 'h1', name: 'Cita medica',        type: 'salud',        time: '8:30',  freq: 'Solo hoy',        days: [0,0,1,0,0,0,0], photo: 'Toma una foto de tu receta', paused: false, streak: 0 },
  { id: 'h2', name: 'Comer sano',         type: 'alimentacion', time: '12:00', freq: 'Todos los dias',  days: [1,1,1,1,1,1,1], photo: 'Toma una foto de tu plato', paused: false, streak: 12 },
  { id: 'h3', name: 'Hora de hidratarte', type: 'hidratacion',  time: '15:00', freq: 'Todos los dias',  days: [1,1,1,1,1,1,1], photo: 'Toma una foto del vaso', paused: false, streak: 34 },
  { id: 'h4', name: 'Pasear a Rocky',     type: 'mascotas',     time: '17:00', freq: 'Todos los dias',  days: [1,1,1,1,1,1,1], photo: 'Toma una foto del paseo', paused: false, streak: 8 },
  { id: 'h5', name: 'Dormir temprano',    type: 'descanso',     time: '20:30', freq: 'Todos los dias',  days: [1,1,1,1,1,1,1], photo: 'Toma una foto de tu cama', paused: false, streak: 4 },
  { id: 'a2', name: 'Ir al gym',          type: 'ejercicio',    time: '7:00',  freq: 'Lun · Mie · Vie', days: [1,0,1,0,1,0,0], photo: 'Toma una foto del gym', paused: false, streak: 16 },
  { id: 'a3', name: 'Leer 30 min',        type: 'lectura',      time: '20:00', freq: 'Solo domingos',   days: [0,0,0,0,0,0,1], photo: 'Toma una foto del libro', paused: false, streak: 1 },
]

// Habitos del dia (orden = carrusel de Hoy). status/done/note solo en `today`.
export const INITIAL_HABITS = [
  { ...ALL_HABITS[0], status: 'scheduled', done: false, note: '' },
  { ...ALL_HABITS[1], status: 'photo', done: true, note: '' },
  { ...ALL_HABITS[2], status: 'scheduled', done: false, note: '' },
  { ...ALL_HABITS[3], status: 'scheduled', done: false, note: '' },
  { ...ALL_HABITS[4], status: 'scheduled', done: false, note: '' },
]

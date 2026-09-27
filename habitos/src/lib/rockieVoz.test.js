import { describe, expect, it } from 'vitest'
import { entender, horaDe, respuesta } from './rockieVoz.js'

// Lo que Rockie entiende por voz en Hábitos (lib/rockieVoz.js). Frases reales del lienzo
// «B+ móvil» y de las pistas de la app («anima a Diego», «quiero meditar más»).

const hoy = [
  { id: 'cm', name: 'Cita medica', done: false },
  { id: 'me', name: 'Meditar 10 min', done: false },
  { id: 'le', name: 'Leer 30 min', done: true },
  { id: 'gy', name: 'Ir al gym', done: false },
  { id: 'ag', name: 'Tomar 2L de agua', done: false },
]
const amigos = [{ id: 'f1', name: 'Diego' }, { id: 'f2', name: 'Carlos Pérez' }]
const tipos = (texto) => entender(texto, hoy, amigos).tarjetas.map((t) => t.tipo)

describe('entender', () => {
  it('parte una frase en pedidos: hábito hecho + cita para la Agenda', () => {
    const { tarjetas } = entender('Ya medité, y mañana tengo cita con Sofía a las siete', hoy, amigos)
    expect(tarjetas[0]).toMatchObject({ tipo: 'hecho', habito: { id: 'me' } })
    expect(tarjetas[1]).toMatchObject({ tipo: 'app', app: 'agenda' })
  })

  it('reconoce el hábito aunque cambie la conjugación, sin confundir parecidos', () => {
    expect(entender('ya tomé agua', hoy).tarjetas[0].habito.id).toBe('ag')
    expect(entender('fui al gym', hoy).tarjetas[0].habito.id).toBe('gy')
    expect(entender('ya leí', hoy).tarjetas[0]).toMatchObject({ tipo: 'ya', habito: { id: 'le' } })
    // «medité» no es «médica»
    const soloCita = [{ id: 'cm', name: 'Cita medica', done: false }]
    expect(entender('ya medité', soloCita).tarjetas.map((t) => t.tipo)).toEqual(['nohay'])
    // un «listo» suelto no es un hábito
    expect(entender('listo', hoy).tarjetas).toEqual([])
  })

  it('«quiero…» es una meta; con hora, un hábito; y no marca un hábito de hoy', () => {
    expect(entender('quiero meditar más', hoy).tarjetas).toEqual([{ tipo: 'meta', nombre: 'Meditar más' }])
    expect(entender('quiero leer 20 minutos a las 9 de la noche', hoy).tarjetas[0]).toMatchObject({ tipo: 'habito', nombre: 'Leer 20 minutos', hora: '21:00' })
    expect(tipos('quiero una cita con Sofía mañana')).toEqual(['app'])
  })

  it('crea hábitos y metas con o sin dos puntos', () => {
    expect(entender('Crea el hábito leer 20 minutos a las 9 de la noche', hoy).tarjetas[0]).toMatchObject({ tipo: 'habito', nombre: 'Leer 20 minutos', hora: '21:00' })
    expect(entender('Nueva meta: correr 5k', hoy).tarjetas[0]).toEqual({ tipo: 'meta', nombre: 'Correr 5k' })
    expect(entender('objetivo correr 10k', hoy).tarjetas[0]).toEqual({ tipo: 'meta', nombre: 'Correr 10k' })
  })

  it('anima a un amigo por su nombre (o avisa si no está)', () => {
    expect(entender('anima a Diego', hoy, amigos).tarjetas[0]).toMatchObject({ tipo: 'animar', amigo: { id: 'f1' } })
    expect(entender('Anímale a carlos', hoy, amigos).tarjetas[0]).toMatchObject({ tipo: 'animar', amigo: { id: 'f2' } })
    expect(entender('anima a Pepe', hoy, amigos).tarjetas[0]).toMatchObject({ tipo: 'animar', amigo: null, nombre: 'Pepe' })
  })

  it('lleva a cada app lo suyo: el verbo «anota» manda aunque diga proyecto', () => {
    expect(entender('anota una idea para el proyecto', hoy).tarjetas[0]).toMatchObject({ tipo: 'app', app: 'cuaderno', pedido: 'una idea para el proyecto' })
    expect(entender('crea una tarea para el equipo: revisar el deck', hoy).tarjetas[0]).toMatchObject({ tipo: 'app', app: 'equipo' })
    expect(tipos('validar con foto')).toEqual(['validar'])
  })
})

describe('respuesta', () => {
  it('cuenta lo que de verdad hizo', () => {
    const { tarjetas } = entender('Ya medité y quiero leer más', hoy)
    expect(respuesta(tarjetas, { 0: true, 1: true })).toBe('¡Eso! Marqué «Meditar 10 min». Creé tu meta «Leer más».')
    expect(respuesta([{ tipo: 'meta', nombre: 'Leer más' }], {})).toMatch(/máximo de metas/)
  })

  it('sin nada que hacer, da ejemplos', () => {
    expect(respuesta([])).toMatch(/No te entendí/)
  })
})

describe('horaDe', () => {
  it('entiende la hora dicha', () => {
    expect(horaDe('a las 7:30 de la noche')).toBe('19:30')
    expect(horaDe('a las 9 y media')).toBe('9:30')
    expect(horaDe('mañana')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { addDays, endOfWeek, fmtDay, fmtRelative, startOfWeek, todayIn } from './dates'
import { levelOf, levelProgress, rankOf, teamStreak, xpForLevel } from './xp'
import { defaultDueFor, groupOf, groupTasks } from './taskGroups'
import { fold, parseQuickTask } from './quickParse'
import type { Task } from './types'

// jueves 24 de septiembre de 2026
const TODAY = '2026-09-24'

describe('fechas', () => {
  it('formatea "jue 24 sep"', () => {
    expect(fmtDay(TODAY)).toBe('jue 24 sep')
    expect(fmtRelative(addDays(TODAY, 1), TODAY)).toBe('mañana')
    expect(fmtRelative(addDays(TODAY, -1), TODAY)).toBe('ayer')
  })
  it('semana de lunes a domingo', () => {
    expect(startOfWeek(TODAY)).toBe('2026-09-21')
    expect(endOfWeek(TODAY)).toBe('2026-09-27')
    expect(endOfWeek('2026-09-27')).toBe('2026-09-27')
  })
  it('hoy en America/Lima aunque en UTC ya sea mañana', () => {
    // 02:00 UTC del 25 = 21:00 del 24 en Lima
    expect(todayIn('America/Lima', new Date('2026-09-25T02:00:00Z'))).toBe('2026-09-24')
  })
})

describe('XP y niveles (espejo de la v2)', () => {
  it('niveles y rangos', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(59)).toBe(1)
    expect(levelOf(60)).toBe(2)
    expect(levelOf(240)).toBe(3)
    expect(xpForLevel(3)).toBe(240)
    expect(rankOf(1)).toBe('Chispa')
    expect(rankOf(4)).toBe('Aprendiz')
    expect(rankOf(99)).toBe('Leyenda')
    expect(levelProgress(150)).toMatchObject({ level: 2, toNext: 90 })
  })
  it('racha del equipo', () => {
    expect(teamStreak([TODAY, addDays(TODAY, -1), addDays(TODAY, -2)], TODAY)).toBe(3)
    expect(teamStreak([addDays(TODAY, -1), addDays(TODAY, -2)], TODAY)).toBe(2)
    expect(teamStreak([addDays(TODAY, -2)], TODAY)).toBe(0)
  })
})

function task(p: Partial<Task>): Task {
  return {
    id: Math.random().toString(36), space_id: 's', project_id: null, area_id: null, title: 't', notes: '',
    assignee_id: null, status: 'todo', priority: 'normal', start_date: null, due_date: null, position: 0,
    validation: null, proof_url: null, proof_image_path: null, validated_at: null, validated_by: null,
    created_by: null, created_at: '', updated_at: '', ...p,
  }
}

describe('grupos de la Lista', () => {
  it('clasifica por fecha', () => {
    expect(groupOf(task({ due_date: addDays(TODAY, -1) }), TODAY)).toBe('overdue')
    expect(groupOf(task({ due_date: TODAY }), TODAY)).toBe('today')
    expect(groupOf(task({ due_date: '2026-09-27' }), TODAY)).toBe('week')
    expect(groupOf(task({ due_date: '2026-09-28' }), TODAY)).toBe('later')
    expect(groupOf(task({}), TODAY)).toBe('nodate')
    expect(groupOf(task({ status: 'done', due_date: addDays(TODAY, -5) }), TODAY)).toBe('done')
  })
  it('urgentes primero dentro del mismo día', () => {
    const g = groupTasks([task({ due_date: TODAY, title: 'a' }), task({ due_date: TODAY, title: 'b', priority: 'urgent' })], TODAY)
    expect(g.today.map((t) => t.title)).toEqual(['b', 'a'])
  })
  it('fecha propuesta al añadir', () => {
    expect(defaultDueFor('today', TODAY)).toBe(TODAY)
    expect(defaultDueFor('week', TODAY)).toBe('2026-09-25')
    expect(defaultDueFor('later', TODAY)).toBe('2026-09-28')
    expect(defaultDueFor('nodate', TODAY)).toBeNull()
  })
})

describe('barra de Rockie (intérprete local)', () => {
  const people = [
    { id: 'a', name: 'Álvaro', username: 'alvaro' },
    { id: 's', name: 'Sebastián', username: 'sebas' },
    { id: 'm1', name: 'Mariana Ríos', username: 'mariana' },
    { id: 'm2', name: 'Mario', username: 'mario.p' },
  ]
  it('quita tildes sin cambiar longitudes', () => {
    expect(fold('Sebastián Ñuñez')).toBe('sebastian nunez')
  })
  it('persona, día y urgencia', () => {
    const r = parseQuickTask('subir el firmware al repo @sebastián viernes urgente', people, TODAY)
    expect(r).toEqual({ title: 'Subir el firmware al repo', assignee: { kind: 'one', id: 's' }, due: '2026-09-25', priority: 'urgent' })
  })
  it('frase natural con "para <nombre>" y "para el viernes"', () => {
    const r = parseQuickTask('Crea una tarea para Sebastián: subir el firmware al repo, para el viernes, urgente', people, TODAY)
    expect(r.title).toBe('Subir el firmware al repo')
    expect(r.assignee).toEqual({ kind: 'one', id: 's' })
    expect(r.due).toBe('2026-09-25')
    expect(r.priority).toBe('urgent')
  })
  it('un nombre ambiguo no se adivina', () => {
    const r = parseQuickTask('revisar PCB @mar', people, TODAY)
    expect(r.assignee.kind).toBe('ambiguous')
  })
  it('fechas relativas', () => {
    expect(parseQuickTask('x mañana', people, TODAY).due).toBe('2026-09-25')
    expect(parseQuickTask('x pasado mañana', people, TODAY).due).toBe('2026-09-26')
    expect(parseQuickTask('x la otra semana', people, TODAY).due).toBe('2026-09-28')
    expect(parseQuickTask('x el jueves', people, TODAY).due).toBe('2026-10-01')
    expect(parseQuickTask('x 3/10', people, TODAY).due).toBe('2026-10-03')
    expect(parseQuickTask('x 5 de octubre', people, TODAY).due).toBe('2026-10-05')
    expect(parseQuickTask('x en 3 días', people, TODAY).due).toBe('2026-09-27')
    expect(parseQuickTask('guion del video', people, TODAY).due).toBeNull()
  })
})

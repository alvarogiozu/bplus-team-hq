import { describe, expect, it } from 'vitest'
import { elapsedOf, paceOf } from '../../lib/pace'
import { ancestors, buildTree, flatten, fmtValue, progressOf, subtreeIds, valueLine, type Goal } from './model'

const TODAY = '2026-09-24'
let seq = 0
const goal = (p: Partial<Goal>): Goal => ({
  id: `g${++seq}`,
  space_id: 's',
  parent_id: null,
  title: 'Meta',
  description: '',
  owner_id: null,
  area_id: null,
  kind: 'number',
  unit: '',
  start_value: 0,
  target_value: 100,
  current_value: 0,
  project_id: null,
  start_date: null,
  due_date: null,
  status_override: null,
  position: seq,
  created_by: null,
  created_at: `2026-09-0${(seq % 9) + 1}T00:00:00Z`,
  updated_at: '2026-09-01T00:00:00Z',
  ...p,
})

describe('ritmo (a tiempo / en riesgo / atrasada)', () => {
  it('sin plazo no hay atraso', () => {
    expect(paceOf(0.1, null, null, TODAY)).toBe('none')
    expect(paceOf(1, null, null, TODAY)).toBe('done')
  })
  it('compara avance con plazo transcurrido', () => {
    // a mitad de plazo (10 de 20 días)
    expect(paceOf(0.5, '2026-09-14', '2026-10-04', TODAY)).toBe('on_track')
    expect(paceOf(0.3, '2026-09-14', '2026-10-04', TODAY)).toBe('at_risk')
    expect(paceOf(0.1, '2026-09-14', '2026-10-04', TODAY)).toBe('off_track')
  })
  it('plazo vencido sin terminar = atrasada', () => {
    expect(paceOf(0.9, '2026-09-01', '2026-09-20', TODAY)).toBe('off_track')
  })
  it('sin inicio solo preocupa la última semana', () => {
    expect(paceOf(0.2, null, '2026-12-01', TODAY)).toBe('on_track')
    expect(paceOf(0.5, null, '2026-09-29', TODAY)).toBe('at_risk')
    expect(paceOf(0.1, null, '2026-09-25', TODAY)).toBe('off_track')
  })
  it('marca de "deberías ir aquí"', () => {
    expect(elapsedOf('2026-09-14', '2026-10-04', TODAY)).toBeCloseTo(0.5)
    expect(elapsedOf(null, '2026-10-04', TODAY)).toBeNull()
  })
})

describe('metas', () => {
  it('avance de número, también cuando el objetivo es bajar', () => {
    const none = new Map()
    expect(progressOf(goal({ start_value: 0, target_value: 500, current_value: 180 }), [], none)).toBeCloseTo(0.36)
    expect(progressOf(goal({ start_value: 100, target_value: 50, current_value: 75 }), [], none)).toBeCloseTo(0.5)
    expect(progressOf(goal({ start_value: 0, target_value: 10, current_value: 30 }), [], none)).toBe(1)
  })
  it('una meta de proyecto avanza con sus tareas hechas', () => {
    const g = goal({ kind: 'project', project_id: 'p1' })
    const tasks = [
      { project_id: 'p1', status: 'done' as const },
      { project_id: 'p1', status: 'todo' as const },
      { project_id: 'p1', status: 'doing' as const },
      { project_id: 'p1', status: 'done' as const },
      { project_id: null, status: 'done' as const },
    ]
    const { byId } = buildTree([g], tasks, TODAY)
    expect(byId.get(g.id)!.pct).toBeCloseTo(0.5)
  })
  it('el árbol promedia sub-metas y respeta el estado elegido a mano', () => {
    const root = goal({ kind: 'children', title: 'Lanzar' })
    const a = goal({ parent_id: root.id, current_value: 100 })
    const b = goal({ parent_id: root.id, current_value: 50, status_override: 'at_risk' })
    const c = goal({ parent_id: b.id, kind: 'percent', current_value: 10 })
    const { roots, byId } = buildTree([c, b, a, root], [], TODAY)
    expect(roots).toHaveLength(1)
    expect(byId.get(root.id)!.pct).toBeCloseTo(0.75)
    expect(byId.get(b.id)!.pace).toBe('at_risk')
    expect(byId.get(a.id)!.pace).toBe('done')
    expect(ancestors(byId.get(c.id)!).map((n) => n.goal.title)).toEqual(['Lanzar', 'Meta'])
    expect([...subtreeIds(byId.get(b.id)!)].sort()).toEqual([b.id, c.id].sort())
    expect(flatten(roots)).toHaveLength(4)
    expect(valueLine(byId.get(root.id)!)).toBe('1 de 2 sub-metas logradas')
  })
  it('una meta huérfana (padre borrado) sube a la raíz', () => {
    const lost = goal({ parent_id: 'no-existe' })
    expect(buildTree([lost], [], TODAY).roots.map((r) => r.goal.id)).toEqual([lost.id])
  })
  it('formatea valores con su unidad', () => {
    expect(fmtValue(180, { kind: 'number', unit: 'patrocinadores' })).toBe('180 patrocinadores')
    expect(fmtValue(1500.5, { kind: 'number', unit: 'S/' })).toMatch(/^S\/ 1.?500,5$/)
    expect(fmtValue(40, { kind: 'percent', unit: '' })).toBe('40%')
    const n = buildTree([goal({ unit: 'clientes', current_value: 45 })], [], TODAY).roots[0]
    expect(valueLine(n)).toBe('45 de 100 clientes')
  })
})

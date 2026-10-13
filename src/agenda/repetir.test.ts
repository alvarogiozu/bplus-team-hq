import { describe, expect, it } from 'vitest'
import { fechasDe, reglaInicial, textoRegla, toca, type Regla } from './repetir'

// 2026-10-14 es miércoles
const MIE = '2026-10-14'

describe('eventos que se repiten', () => {
  it('cada día y cada 2 días', () => {
    expect(fechasDe({ freq: 'dia', cada: 1, dias: [], hasta: null }, MIE, MIE, '2026-10-17')).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
    expect(fechasDe({ freq: 'dia', cada: 2, dias: [], hasta: null }, MIE, MIE, '2026-10-19')).toEqual(['2026-10-14', '2026-10-16', '2026-10-18'])
  })

  it('cada semana en los días elegidos, desde el primer día', () => {
    const r: Regla = { freq: 'semana', cada: 1, dias: [1, 3], hasta: null } // lunes y miércoles
    expect(fechasDe(r, MIE, MIE, '2026-10-26')).toEqual(['2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26'])
    expect(toca(r, MIE, '2026-10-12')).toBe(false) // el lunes anterior al inicio no cuenta
  })

  it('cada 2 semanas se ancla en la semana del primer día', () => {
    const r: Regla = { freq: 'semana', cada: 2, dias: [3], hasta: null }
    expect(fechasDe(r, MIE, MIE, '2026-11-15')).toEqual(['2026-10-14', '2026-10-28', '2026-11-11'])
  })

  it('cada mes el mismo día, y se salta los meses que no lo tienen', () => {
    expect(fechasDe({ freq: 'mes', cada: 1, dias: [], hasta: null }, MIE, MIE, '2027-01-31')).toEqual(['2026-10-14', '2026-11-14', '2026-12-14', '2027-01-14'])
    expect(fechasDe({ freq: 'mes', cada: 1, dias: [], hasta: null }, '2026-01-31', '2026-01-31', '2026-05-31')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })

  it('respeta «hasta» y desde dónde se pide', () => {
    const r: Regla = { freq: 'dia', cada: 1, dias: [], hasta: '2026-10-16' }
    expect(fechasDe(r, MIE, MIE, '2026-12-31')).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
    expect(fechasDe({ ...r, hasta: null }, MIE, '2026-10-20', '2026-10-21')).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('la regla inicial de «cada semana» toma el día del evento', () => {
    expect(reglaInicial('semana', MIE)).toEqual({ freq: 'semana', cada: 1, dias: [3], hasta: null })
  })

  it('se lee en una línea', () => {
    expect(textoRegla({ freq: 'dia', cada: 1, dias: [], hasta: null })).toBe('Cada día')
    expect(textoRegla({ freq: 'semana', cada: 1, dias: [3, 1], hasta: null })).toBe('Cada semana · lun, mié')
    expect(textoRegla({ freq: 'semana', cada: 1, dias: [1, 2, 3, 4, 5], hasta: null })).toBe('De lunes a viernes')
    expect(textoRegla({ freq: 'semana', cada: 2, dias: [6], hasta: null })).toBe('Cada 2 semanas · sáb')
    expect(textoRegla({ freq: 'mes', cada: 3, dias: [], hasta: null })).toBe('Cada 3 meses')
  })
})

import { describe, expect, it } from 'vitest'
import { comoMarkdown } from './notasMarkdown'

describe('comoMarkdown', () => {
  it('un salto suelto entre líneas de texto pasa a párrafo', () => {
    expect(comoMarkdown('Para qué: probar\nPasos: abrir')).toBe('Para qué: probar\n\nPasos: abrir')
  })
  it('las listas, tablas y títulos se dejan igual', () => {
    const md = '# Título\n- uno\n- dos\n1. a\n2. b\n| a | b |\n|---|---|\n| 1 | 2 |\n> cita'
    expect(comoMarkdown(md)).toBe(md)
  })
  it('una lista pegada a un texto queda como lista', () => {
    expect(comoMarkdown('Pasos:\n1. abrir\n2. tocar')).toBe('Pasos:\n1. abrir\n2. tocar')
  })
  it('no toca el código', () => {
    const md = '```\nuno\ndos\n```'
    expect(comoMarkdown(md)).toBe(md)
  })
  it('es idempotente', () => {
    const t = 'a\nb\n\n- c\n- 9 oct: avance\nlisto cuando: x'
    expect(comoMarkdown(comoMarkdown(t))).toBe(comoMarkdown(t))
  })
  it('respeta el salto duro y la sangría de una lista', () => {
    expect(comoMarkdown('uno  \ndos')).toBe('uno  \ndos')
    expect(comoMarkdown('- item\n  sigue')).toBe('- item\n  sigue')
  })
})

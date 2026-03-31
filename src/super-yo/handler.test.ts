import { describe, test, expect } from 'vitest'
import { detectCerebroCommand } from './handler.js'

describe('detectCerebroCommand', () => {
  // --- cerebro command ---
  test('detecta "cerebro" seguido de prompt', () => {
    const result = detectCerebroCommand('cerebro ¿qué hablé con Nacho?')
    expect(result).toEqual({ type: 'cerebro', prompt: '¿qué hablé con Nacho?' })
  })

  test('detecta "/cerebro" con slash', () => {
    const result = detectCerebroCommand('/cerebro resumí las decisiones')
    expect(result).toEqual({ type: 'cerebro', prompt: 'resumí las decisiones' })
  })

  test('detecta "cerebro" case insensitive', () => {
    const result = detectCerebroCommand('CEREBRO analizar métricas')
    expect(result).toEqual({ type: 'cerebro', prompt: 'analizar métricas' })
  })

  test('ignora espacios antes del prompt', () => {
    const result = detectCerebroCommand('cerebro    mucho espacio')
    expect(result).toEqual({ type: 'cerebro', prompt: 'mucho espacio' })
  })

  test('preserva prompt multilinea', () => {
    const result = detectCerebroCommand('cerebro linea uno\nlinea dos')
    expect(result).toEqual({ type: 'cerebro', prompt: 'linea uno\nlinea dos' })
  })

  // --- brief command ---
  test('detecta "brief"', () => {
    const result = detectCerebroCommand('brief')
    expect(result).toEqual({ type: 'brief' })
  })

  test('detecta "/brief" con slash', () => {
    const result = detectCerebroCommand('/brief')
    expect(result).toEqual({ type: 'brief' })
  })

  test('detecta "Brief" case insensitive', () => {
    const result = detectCerebroCommand('Brief')
    expect(result).toEqual({ type: 'brief' })
  })

  test('detecta "brief" con espacios', () => {
    const result = detectCerebroCommand('  brief  ')
    expect(result).toEqual({ type: 'brief' })
  })

  // --- no match ---
  test('retorna null para mensajes normales', () => {
    expect(detectCerebroCommand('hola qué tal')).toBeNull()
  })

  test('retorna null para "cerebro" solo sin prompt', () => {
    expect(detectCerebroCommand('cerebro')).toBeNull()
  })

  test('retorna null para "cerebro" dentro de texto', () => {
    expect(detectCerebroCommand('el cerebro humano es complejo')).toBeNull()
  })
})

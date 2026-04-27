/**
 * Tests de yo/classifier.
 *
 * Unit: sin API real.
 * Integration (VERTEX_INTEGRATION=true): requiere envs Vertex AI.
 */

import { describe, it, expect } from 'vitest'
import { classifyMessage, classifyMultimodal } from './classifier.js'

const VERTEX_INTEGRATION = process.env.VERTEX_INTEGRATION === 'true'

describe('classifyMessage — unit', () => {
  it('retorna defaults sin invocar la API cuando candidates está vacío', async () => {
    const result = await classifyMessage('cualquier cosa', [])
    expect(result.project_slug).toBeNull()
    expect(result.confidence).toBe(0)
  })
})

describe('classifyMultimodal — unit', () => {
  it('rechaza si ni text ni audio están presentes', async () => {
    await expect(
      classifyMultimodal({ candidates: ['x'] }),
    ).rejects.toThrow(/text or audio/i)
  })

  it('retorna null+0 cuando candidates está vacío', async () => {
    const result = await classifyMultimodal({ text: 'hola', candidates: [] })
    expect(result.project_slug).toBeNull()
    expect(result.confidence).toBe(0)
  })
})

describe.runIf(VERTEX_INTEGRATION)('classifyMultimodal — integration (Vertex AI)', () => {
  const candidates = ['traid-crm', 'pyme-inside', 'gov-mendoza', 'oferta-2026']

  it(
    'mensaje con mención explícita devuelve confidence > 0.7 y rich schema',
    async () => {
      const result = await classifyMultimodal({
        text: 'Para el proyecto traid-crm: necesitamos terminar el dashboard de leads esta semana.',
        candidates,
      })
      expect(result.project_slug).toBe('traid-crm')
      expect(result.confidence).toBeGreaterThan(0.7)
      expect(result.priority).toBeDefined()
      expect(result.task_type).toBeDefined()
      expect(Array.isArray(result.tags)).toBe(true)
    },
    30_000,
  )

  it(
    'mensaje ambiguo devuelve personal con confidence baja',
    async () => {
      const result = await classifyMultimodal({
        text: 'che, mañana hablamos por la cosa esa que quedó pendiente',
        candidates,
      })
      expect(result.project_slug).toBe('personal')
      expect(result.confidence).toBeLessThanOrEqual(0.5)
    },
    30_000,
  )
})

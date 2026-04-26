/**
 * Tests de yo/classifier.
 *
 * - 1 unit test: candidates vacíos → defaults sin tocar la red.
 * - 2 integration tests gated por VERTEX_INTEGRATION === 'true'.
 *   Requieren GCP_VERTEX_SA_JSON_PATH + GCP_VERTEX_PROJECT + GCP_VERTEX_LOCATION.
 */

import { describe, it, expect } from 'vitest'
import { classifyMessage } from './classifier.js'

const VERTEX_INTEGRATION = process.env.VERTEX_INTEGRATION === 'true'

describe('classifyMessage — unit', () => {
  it('retorna defaults sin invocar la API cuando candidates está vacío', async () => {
    const result = await classifyMessage('cualquier cosa', [])
    expect(result.project_slug).toBeNull()
    expect(result.confidence).toBe(0)
  })
})

describe.runIf(VERTEX_INTEGRATION)('classifyMessage — integration (Vertex AI)', () => {
  const candidates = ['traid-crm', 'pyme-inside', 'gov-mendoza', 'oferta-2026']

  it(
    'mensaje con mención explícita devuelve confidence > 0.7',
    async () => {
      const text =
        'Para el proyecto traid-crm: necesitamos terminar el dashboard de leads esta semana.'
      const result = await classifyMessage(text, candidates)
      expect(result.project_slug).toBe('traid-crm')
      expect(result.confidence).toBeGreaterThan(0.7)
    },
    30_000,
  )

  it(
    'mensaje ambiguo devuelve confidence < 0.4',
    async () => {
      const text = 'che, mañana hablamos por la cosa esa que quedó pendiente'
      const result = await classifyMessage(text, candidates)
      expect(result.confidence).toBeLessThan(0.4)
    },
    30_000,
  )
})

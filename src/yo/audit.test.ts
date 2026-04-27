import { describe, expect, it, vi } from 'vitest'
import { recordClassification } from './audit.js'

describe('recordClassification', () => {
  it('invoca insert con todos los campos', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockClient = {
      schema: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      insert,
    }
    await recordClassification(mockClient as never, {
      task_id: 't1',
      contact_id: 'c1',
      source: 'whatsapp_text',
      input_excerpt: 'hola',
      candidates: ['a', 'b'],
      model: 'gemini-2.5-flash',
      decision_slug: 'a',
      confidence: 0.9,
      fallback_used: null,
      latency_ms: 320,
    })
    expect(insert).toHaveBeenCalledOnce()
    const args = insert.mock.calls[0][0]
    expect(args.decision_slug).toBe('a')
    expect(args.confidence).toBe(0.9)
  })

  it('no lanza si insert falla — solo log', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const mockClient = {
      schema: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      insert,
    }
    await expect(
      recordClassification(mockClient as never, {
        source: 'whatsapp_text',
        candidates: [],
        model: 'x',
      } as never),
    ).resolves.not.toThrow()
  })
})

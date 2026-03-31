import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del Agent SDK — query() devuelve un AsyncGenerator
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
  createSdkMcpServer: vi.fn(() => ({ type: 'sdk', name: 'mock', instance: {} })),
  tool: vi.fn((_name: string, _desc: string, _schema: any, handler: any) => ({
    name: _name,
    handler,
  })),
}))

import { processQuery, dailyBrief } from './brain.js'
import { query } from '@anthropic-ai/claude-agent-sdk'

const mockQuery = vi.mocked(query)

function createMockConversation(resultText: string, isError = false) {
  async function* gen() {
    yield {
      type: 'result' as const,
      subtype: isError ? 'error' : 'success',
      result: resultText,
      total_cost_usd: 0.01,
      num_turns: 3,
      duration_ms: 1000,
    }
  }
  return gen()
}

describe('processQuery', () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  test('retorna el resultado del Agent SDK', async () => {
    mockQuery.mockReturnValueOnce(createMockConversation('Hablaste con Nacho sobre TRAID web') as any)

    const result = await processQuery('¿qué hablé con Nacho?')
    expect(result).toBe('Hablaste con Nacho sobre TRAID web')
  })

  test('retorna mensaje de fallback si result está vacío', async () => {
    mockQuery.mockReturnValueOnce(createMockConversation('') as any)

    const result = await processQuery('test')
    expect(result).toBe('No pude generar una respuesta. Intentá de nuevo.')
  })

  test('retorna mensaje de error si el SDK lanza excepción', async () => {
    mockQuery.mockImplementationOnce(() => {
      throw new Error('SDK timeout')
    })

    const result = await processQuery('test')
    expect(result).toContain('Error del segundo cerebro')
    expect(result).toContain('SDK timeout')
  })

  test('pasa el prompt al SDK', async () => {
    mockQuery.mockReturnValueOnce(createMockConversation('ok') as any)

    await processQuery('mi prompt específico')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'mi prompt específico',
      })
    )
  })

  test('configura sonnet como modelo', async () => {
    mockQuery.mockReturnValueOnce(createMockConversation('ok') as any)

    await processQuery('test')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: 'sonnet',
        }),
      })
    )
  })
})

describe('dailyBrief', () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  test('llama a processQuery con el prompt de brief', async () => {
    mockQuery.mockReturnValueOnce(createMockConversation('Brief: todo bien') as any)

    const result = await dailyBrief()
    expect(result).toBe('Brief: todo bien')

    // Verifica que el prompt contiene instrucciones de brief
    const calledPrompt = mockQuery.mock.calls[0][0].prompt as string
    expect(calledPrompt).toContain('brief diario')
  })
})

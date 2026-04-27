/**
 * Tests for brain.ts — confirmation label handling
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

// Hoisted mocks
const { mockGenerateContent, mockMaybeSingle, mockYoUpdate, supabaseMock } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  const mockMaybeSingle = vi.fn()
  // Tracks ONLY updates on yo.tasks (via schema('yo'))
  const mockYoUpdate = vi.fn()

  function makeYoChain() {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: mockMaybeSingle,
      update: (data: any) => {
        mockYoUpdate(data)
        return { eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }
      },
    }
    return chain
  }

  // Chain for supabase.from() — used for agent_memory, communication_metrics etc.
  function makePublicChain() {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      not: () => chain,
      in: () => chain,
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: (_data: any) => ({
        eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    return chain
  }

  const supabaseMock = {
    schema: vi.fn(() => ({
      from: vi.fn(() => makeYoChain()),
    })),
    from: vi.fn(() => makePublicChain()),
  }

  return { mockGenerateContent, mockMaybeSingle, mockYoUpdate, supabaseMock }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseMock),
}))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: function () {
    return {
      getGenerativeModel: () => ({
        generateContent: mockGenerateContent,
      }),
    }
  },
}))

vi.mock('./config.js', () => ({
  CONFIG: {
    GEMINI_API_KEY: 'test-key',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_KEY: 'test-supabase-key',
    NACHO_PHONE: '549123456789',
    NAHUEL_PHONE: '5492615181225',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    SESSIONS_DIR: './sessions',
  },
}))

import { analyzeConversation } from './brain.js'

function makeClassification(overrides: Record<string, unknown>) {
  return {
    layer: 1,
    project_tag: 'diego-erp',
    type: 'noise',
    summary: '',
    entities: [],
    urgency: 'low',
    noise_category: 'reaction',
    ...overrides,
  }
}

describe('analyzeConversation — confirmation label', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Restore schema mock after clearAllMocks
    supabaseMock.schema.mockImplementation(() => {
      const yoChain: any = {
        select: () => yoChain,
        eq: () => yoChain,
        order: () => yoChain,
        limit: () => yoChain,
        maybeSingle: mockMaybeSingle,
        update: (data: any) => {
          mockYoUpdate(data)
          return { eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }
        },
      }
      return { from: vi.fn(() => yoChain) }
    })

    supabaseMock.from.mockImplementation(() => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        not: () => chain,
        in: () => chain,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: () => ({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
      return chain
    })
  })

  test('cuando clasificador retorna confirmation, llama a schema yo y actualiza tarea a confirmed', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(makeClassification({
          type: 'confirmation',
          summary: 'Diego confirma que el sync funciona',
          noise_category: 'confirmation',
        })),
      },
    })

    const resolvedTask = { id: 'task-uuid-123', content_md: 'Sync de stock funcionando' }
    mockMaybeSingle.mockResolvedValue({ data: resolvedTask, error: null })

    await analyzeConversation('Diego', '549123456789', 'ok funciona perfecto', 'diego-erp')

    expect(supabaseMock.schema).toHaveBeenCalledWith('yo')
    expect(mockYoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'confirmed',
        confirmed_at: expect.any(String),
      })
    )
  })

  test('cuando no hay tarea resuelta para el project_tag, no llama a update de yo.tasks', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(makeClassification({
          type: 'confirmation',
          summary: 'Diego confirma',
          noise_category: 'confirmation',
        })),
      },
    })

    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    await analyzeConversation('Diego', '549123456789', 'listo todo bien', 'diego-erp')

    expect(supabaseMock.schema).toHaveBeenCalledWith('yo')
    expect(mockYoUpdate).not.toHaveBeenCalled()
  }, 10000)

  test('cuando confirmation sin project_tag, no busca tareas en yo.tasks', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(makeClassification({
          layer: 2,
          project_tag: null,
          type: 'confirmation',
          noise_category: 'confirmation',
        })),
      },
    })

    await analyzeConversation('Alguien', '549999999', 'recibido gracias', 'chat-random')

    expect(supabaseMock.schema).not.toHaveBeenCalled()
    expect(mockYoUpdate).not.toHaveBeenCalled()
  }, 10000)

  test('cuando type es noise, no actualiza yo.tasks', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(makeClassification({
          layer: 2,
          type: 'noise',
          noise_category: 'reaction',
        })),
      },
    })

    await analyzeConversation('Diego', '549123456789', 'jaja', 'diego-erp')

    expect(supabaseMock.schema).not.toHaveBeenCalled()
    expect(mockYoUpdate).not.toHaveBeenCalled()
  }, 10000)
})

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSuperyoDataServer, supabaseQuery, supabaseRpc } from './tools.js'

describe('createSuperyoDataServer', () => {
  test('retorna un McpSdkServerConfigWithInstance válido', () => {
    const server = createSuperyoDataServer()
    expect(server).toBeDefined()
    expect(server.type).toBe('sdk')
    expect(server.name).toBe('superyo-data')
    expect(server.instance).toBeDefined()
  })
})

describe('supabaseQuery', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co'
    process.env.SUPABASE_KEY = 'fake-key'
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  test('construye URL con tabla y query params correctos', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: '1' }],
    } as any)

    await supabaseQuery('crm_messages', {
      select: 'id,content',
      contact_phone: 'eq.123',
      order: 'received_at.desc',
    })

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string)
    expect(calledUrl.pathname).toBe('/rest/v1/crm_messages')
    expect(calledUrl.searchParams.get('select')).toBe('id,content')
    expect(calledUrl.searchParams.get('contact_phone')).toBe('eq.123')
    expect(calledUrl.searchParams.get('order')).toBe('received_at.desc')
  })

  test('envía headers de auth correctos', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any)

    await supabaseQuery('crm_messages')

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.apikey).toBe('fake-key')
    expect(headers.Authorization).toBe('Bearer fake-key')
  })

  test('retorna data en éxito', async () => {
    const mockData = [{ id: '1', content: 'hola' }]
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as any)

    const result = await supabaseQuery('crm_messages')
    expect(result.data).toEqual(mockData)
    expect(result.error).toBeNull()
  })

  test('retorna error cuando fetch falla con HTTP error', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as any)

    const result = await supabaseQuery('crm_messages')
    expect(result.data).toBeNull()
    expect(result.error).toBe('401: Unauthorized')
  })

  test('retorna error cuando fetch lanza excepción', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error')
    )

    const result = await supabaseQuery('crm_messages')
    expect(result.data).toBeNull()
    expect(result.error).toBe('Network error')
  })
})

describe('supabaseRpc', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co'
    process.env.SUPABASE_KEY = 'fake-key'
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  test('llama a /rest/v1/rpc/<fn> con POST y params en body', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: '1', name: 'Nacho' }],
    } as any)

    await supabaseRpc('get_entity_neighbors', { p_entity_id: 'abc', p_scope: null })

    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toBe('https://fake.supabase.co/rest/v1/rpc/get_entity_neighbors')

    const options = fetchSpy.mock.calls[0][1] as any
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ p_entity_id: 'abc', p_scope: null })
  })

  test('retorna error en fallo HTTP', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    } as any)

    const result = await supabaseRpc('get_entity_neighbors', {})
    expect(result.data).toBeNull()
    expect(result.error).toBe('500: Internal error')
  })
})

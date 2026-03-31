import { describe, test, expect, vi, beforeEach } from 'vitest'
import { IncomingMessage, ServerResponse } from 'http'
import { handleCerebroRequest } from './api.js'

// Mock del brain para no llamar al Agent SDK real
vi.mock('./brain.js', () => ({
  processQuery: vi.fn(async (prompt: string) => `Respuesta a: ${prompt}`),
  dailyBrief: vi.fn(async () => 'Brief del día'),
}))

function createMockReq(options: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}): IncomingMessage {
  const { Readable } = require('stream')
  const readable = new Readable()
  readable._read = () => {}
  if (options.body) {
    readable.push(options.body)
    readable.push(null)
  } else {
    readable.push(null)
  }

  readable.method = options.method
  readable.url = options.url
  readable.headers = {
    host: 'localhost:3001',
    ...options.headers,
  }

  return readable as unknown as IncomingMessage
}

function createMockRes(): ServerResponse & { _status: number; _body: string } {
  const res = {
    _status: 0,
    _body: '',
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status
      if (headers) Object.assign(res._headers, headers)
      return res
    },
    end(body?: string) {
      res._body = body || ''
      return res
    },
  }
  return res as any
}

describe('handleCerebroRequest', () => {
  beforeEach(() => {
    // Sin BACKEND_SECRET para tests básicos (auth deshabilitada)
    delete process.env.BACKEND_SECRET
  })

  test('ignora rutas que no son /api/cerebro', async () => {
    const req = createMockReq({ method: 'POST', url: '/webhook' })
    const res = createMockRes()
    const handled = await handleCerebroRequest(req, res)
    expect(handled).toBe(false)
  })

  test('rechaza método GET', async () => {
    const req = createMockReq({ method: 'GET', url: '/api/cerebro' })
    const res = createMockRes()
    const handled = await handleCerebroRequest(req, res)
    expect(handled).toBe(true)
    expect(res._status).toBe(405)
  })

  test('rechaza body sin prompt', async () => {
    const req = createMockReq({
      method: 'POST',
      url: '/api/cerebro',
      body: JSON.stringify({ message: 'hola' }),
    })
    const res = createMockRes()
    await handleCerebroRequest(req, res)
    expect(res._status).toBe(400)
    expect(JSON.parse(res._body).error).toBe('Missing "prompt" in body')
  })

  test('procesa prompt válido y devuelve respuesta', async () => {
    const req = createMockReq({
      method: 'POST',
      url: '/api/cerebro',
      body: JSON.stringify({ prompt: '¿qué hablé con Nacho?' }),
    })
    const res = createMockRes()
    await handleCerebroRequest(req, res)
    expect(res._status).toBe(200)
    const body = JSON.parse(res._body)
    expect(body.response).toBe('Respuesta a: ¿qué hablé con Nacho?')
  })

  test('"brief" como prompt ejecuta dailyBrief', async () => {
    const req = createMockReq({
      method: 'POST',
      url: '/api/cerebro',
      body: JSON.stringify({ prompt: 'brief' }),
    })
    const res = createMockRes()
    await handleCerebroRequest(req, res)
    expect(res._status).toBe(200)
    expect(JSON.parse(res._body).response).toBe('Brief del día')
  })

  test('rechaza sin auth cuando BACKEND_SECRET está configurado', async () => {
    process.env.BACKEND_SECRET = 'mi-secreto'
    const req = createMockReq({
      method: 'POST',
      url: '/api/cerebro',
      body: JSON.stringify({ prompt: 'test' }),
    })
    const res = createMockRes()
    await handleCerebroRequest(req, res)
    expect(res._status).toBe(401)
    delete process.env.BACKEND_SECRET
  })

  test('acepta con Bearer correcto', async () => {
    process.env.BACKEND_SECRET = 'mi-secreto'
    const req = createMockReq({
      method: 'POST',
      url: '/api/cerebro',
      headers: { authorization: 'Bearer mi-secreto' },
      body: JSON.stringify({ prompt: 'test' }),
    })
    const res = createMockRes()
    await handleCerebroRequest(req, res)
    expect(res._status).toBe(200)
    delete process.env.BACKEND_SECRET
  })
})

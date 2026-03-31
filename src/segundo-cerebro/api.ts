/**
 * API HTTP del Segundo Cerebro
 *
 * POST /api/cerebro — Consulta al segundo cerebro
 * Auth: Bearer BACKEND_SECRET
 */

import { IncomingMessage, ServerResponse } from 'http'
import { processQuery, dailyBrief } from './brain.js'

const BACKEND_SECRET = process.env.BACKEND_SECRET || ''

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/**
 * Handler para POST /api/cerebro
 * Retorna true si manejó el request, false si no aplica
 */
export async function handleCerebroRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname !== '/api/cerebro') return false

  // Solo POST
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return true
  }

  // Auth check
  if (BACKEND_SECRET) {
    const auth = req.headers.authorization
    if (!auth || auth !== `Bearer ${BACKEND_SECRET}`) {
      sendJson(res, 401, { error: 'Unauthorized' })
      return true
    }
  }

  try {
    const rawBody = await parseBody(req)
    const body = JSON.parse(rawBody)
    const prompt = body.prompt?.trim()

    if (!prompt) {
      sendJson(res, 400, { error: 'Missing "prompt" in body' })
      return true
    }

    console.log(`[api/cerebro] Query: ${prompt.substring(0, 100)}...`)

    // "brief" como prompt especial
    const isBrief = prompt.toLowerCase() === 'brief' || prompt.toLowerCase() === '/brief'
    const response = isBrief
      ? await dailyBrief()
      : await processQuery(prompt)

    sendJson(res, 200, { response })
  } catch (error: any) {
    console.error('[api/cerebro] Error:', error)
    sendJson(res, 500, { error: error.message || 'Internal error' })
  }

  return true
}

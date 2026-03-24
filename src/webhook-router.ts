/**
 * Webhook Router — HTTP endpoints para Meta WhatsApp Cloud API
 *
 * Rutas:
 * - GET  /webhook  → Verificación Meta
 * - POST /webhook  → Mensajes entrantes → Super Yo (Nahuel) o forward Vittoria
 *
 * Features:
 * - Verificación HMAC de firma Meta
 * - Debounce de mensajes (5s primer mensaje, 3s siguientes)
 * - Deduplicación por message_id
 * - Detección automática: Nahuel → Super Yo, otros → forward a Vittoria (futuro)
 */

import { createHmac } from 'crypto'
import { IncomingMessage, ServerResponse } from 'http'
import { processSuperYoMessage, NAHUEL_WA_ID } from './super-yo/handler.js'
import { markAsRead, sendTypingIndicator } from './whatsapp-api.js'

// Debounce state: waId -> { messages, timer, lastMessageTime }
const debounceState = new Map<string, {
  messages: Array<{ tipo: string; contenido: string; message_id?: string }>
  timer: ReturnType<typeof setTimeout> | null
  lastMessageTime: number
}>()

// Deduplicación: set de message_ids recientes (limpia cada 5 min)
const processedMessageIds = new Set<string>()
setInterval(() => processedMessageIds.clear(), 5 * 60 * 1000)

/**
 * Verificar firma HMAC de Meta
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.warn('[webhook] META_APP_SECRET no configurado — sin verificación de firma')
    return true
  }

  if (!signatureHeader) {
    console.error('[webhook] No x-hub-signature-256 header')
    return false
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const isValid = signatureHeader === `sha256=${expected}`
  if (!isValid) {
    console.error('[webhook] Signature mismatch')
  }
  return isValid
}

/**
 * Parsear body de un IncomingMessage
 */
function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/**
 * Parsear URL y query params
 */
function parseUrl(req: IncomingMessage): { pathname: string; params: URLSearchParams } {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  return { pathname: url.pathname, params: url.searchParams }
}

/**
 * Debounced process: espera mensajes adicionales antes de procesar
 */
function scheduleProcess(waId: string) {
  const state = debounceState.get(waId)
  if (!state) return

  if (state.timer) clearTimeout(state.timer)

  const waitMs = state.messages.length > 1 ? 3000 : 5000

  state.timer = setTimeout(async () => {
    const currentState = debounceState.get(waId)
    if (!currentState || currentState.messages.length === 0) return

    // Claim messages
    const messages = [...currentState.messages]
    currentState.messages = []
    debounceState.delete(waId)

    console.log(`[webhook] Procesando batch de ${messages.length} mensaje(s) de ${waId}`)

    // Route: Nahuel → Super Yo, otros → log (Vittoria forward futuro)
    if (waId === NAHUEL_WA_ID) {
      await processSuperYoMessage(waId, messages)
    } else {
      // Por ahora solo logueamos mensajes de otros contactos
      // Vittoria forward se puede agregar después
      console.log(`[webhook] Mensaje de ${waId} (no es Nahuel) — ignorando por ahora`)
    }
  }, waitMs)
}

/**
 * Handler principal del webhook
 */
export async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const { pathname, params } = parseUrl(req)

  // Solo manejar /webhook
  if (pathname !== '/webhook') return false

  // GET → Verificación Meta
  if (req.method === 'GET') {
    const mode = params.get('hub.mode')
    const token = params.get('hub.verify_token')
    const challenge = params.get('hub.challenge')

    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN

    if (!VERIFY_TOKEN) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'WEBHOOK_VERIFY_TOKEN not configured' }))
      return true
    }

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[webhook] Verificado por Meta')
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(challenge || '')
    } else {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Forbidden' }))
    }
    return true
  }

  // POST → Mensajes entrantes
  if (req.method === 'POST') {
    try {
      const rawBody = await parseBody(req)

      // Verificar firma
      const signature = req.headers['x-hub-signature-256'] as string | null
      if (!verifySignature(rawBody, signature)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid signature' }))
        return true
      }

      const payload = JSON.parse(rawBody)
      const value = payload.entry?.[0]?.changes?.[0]?.value

      // Ignorar si no hay value o es status update
      if (!value || value.statuses || !value.messages?.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
        return true
      }

      const message = value.messages[0]
      const waId = message.from
      const messageId = message.id

      // Deduplicación
      if (messageId && processedMessageIds.has(messageId)) {
        console.log(`[webhook] Mensaje duplicado ignorado: ${messageId}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
        return true
      }
      if (messageId) processedMessageIds.add(messageId)

      console.log(`[webhook] Mensaje entrante de ${waId}`)

      // UX: Mark as read + typing
      try {
        await Promise.all([
          markAsRead(messageId),
          sendTypingIndicator(waId),
        ])
      } catch {}

      // Extraer contenido del mensaje
      let tipo = 'text'
      let contenido = ''

      if (message.type === 'text') {
        contenido = message.text?.body || ''
      } else if (message.type === 'image') {
        tipo = 'image'
        contenido = message.image?.caption || '[Imagen]'
      } else if (message.type === 'audio') {
        tipo = 'audio'
        contenido = '[Audio recibido]'
      } else if (message.type === 'document') {
        tipo = 'document'
        contenido = message.document?.caption || `[Documento: ${message.document?.filename || 'archivo'}]`
      } else if (message.type === 'video') {
        tipo = 'video'
        contenido = message.video?.caption || '[Video]'
      } else {
        contenido = `[${message.type || 'desconocido'}]`
      }

      // Agregar al debounce
      if (!debounceState.has(waId)) {
        debounceState.set(waId, { messages: [], timer: null, lastMessageTime: Date.now() })
      }
      const state = debounceState.get(waId)!
      state.messages.push({ tipo, contenido, message_id: messageId })
      state.lastMessageTime = Date.now()

      scheduleProcess(waId)

      // Responder 200 inmediatamente a Meta
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
    } catch (error) {
      console.error('[webhook] Error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal error' }))
    }
    return true
  }

  return false
}

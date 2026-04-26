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
import { CONFIG } from './config.js'

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
 * Verificar firma HMAC de Meta (path Meta directo)
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !signatureHeader) return false

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  return signatureHeader === `sha256=${expected}`
}

/**
 * Verificar Bearer token compartido con n8n bridge (path n8n).
 * FIX M3 reformulado: como Meta → n8n → super-yo es la arquitectura real, n8n
 * debe enviar `Authorization: Bearer <SUPERYO_WEBHOOK_TOKEN>` en el HTTP node.
 */
function verifyN8nBearer(authHeader: string | null): boolean {
  const token = process.env.SUPERYO_WEBHOOK_TOKEN
  if (!token || !authHeader) return false
  return authHeader === `Bearer ${token}`
}

/**
 * Auth combinada: acepta si pasa Meta signature O n8n Bearer.
 *
 * Modo compat (`SUPERYO_WEBHOOK_REQUIRE_AUTH != "true"`): warn y acepta si
 * ningún método matchea (no rompe deploy actual donde n8n todavía no envía
 * Bearer). Modo strict (`=true`): rechaza con 401.
 */
function verifyAuth(
  rawBody: string,
  signatureHeader: string | null,
  authHeader: string | null
): { ok: boolean; method: string } {
  if (verifyMetaSignature(rawBody, signatureHeader)) {
    return { ok: true, method: 'meta_signature' }
  }
  if (verifyN8nBearer(authHeader)) {
    return { ok: true, method: 'n8n_bearer' }
  }

  const strict = process.env.SUPERYO_WEBHOOK_REQUIRE_AUTH === 'true'
  if (strict) {
    console.error('[webhook] AUTH FAIL — ni Meta sig ni n8n Bearer válidos (strict mode)')
    return { ok: false, method: 'none' }
  }
  console.warn(
    '[webhook] AUTH WEAK — request sin Meta sig ni n8n Bearer válido. SUPERYO_WEBHOOK_REQUIRE_AUTH != "true", aceptando con warning.'
  )
  return { ok: true, method: 'unauth_compat' }
}

/**
 * Rate limit simple in-memory por IP. 100 req/min/IP por default
 * (override con SUPERYO_WEBHOOK_RATE_LIMIT). Defensa básica contra abuso
 * accidental — para defensa real usar reverse proxy / Cloudflare.
 */
const rateLimitState = new Map<string, { count: number; windowStart: number }>()
const WINDOW_MS = 60_000

function checkRateLimit(ip: string): { ok: boolean; remaining: number } {
  const limit = parseInt(process.env.SUPERYO_WEBHOOK_RATE_LIMIT || '100', 10)
  const now = Date.now()
  const state = rateLimitState.get(ip)
  if (!state || now - state.windowStart > WINDOW_MS) {
    rateLimitState.set(ip, { count: 1, windowStart: now })
    return { ok: true, remaining: limit - 1 }
  }
  state.count++
  if (state.count > limit) return { ok: false, remaining: 0 }
  return { ok: true, remaining: limit - state.count }
}

// Cleanup periódico de IPs viejas (cada 5 min)
setInterval(() => {
  const now = Date.now()
  for (const [ip, st] of rateLimitState.entries()) {
    if (now - st.windowStart > WINDOW_MS * 2) rateLimitState.delete(ip)
  }
}, 5 * 60_000)

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

    // Route: Nahuel → Super Yo, otros → pipeline yo (si flag ON), sino log
    if (waId === NAHUEL_WA_ID) {
      await processSuperYoMessage(waId, messages)
    } else if (CONFIG.YO_PIPELINE_ENABLED) {
      try {
        const { processIncomingForYo } = await import('./yo/pipeline.js')
        const {
          ensureContact,
          listProjectsForContact,
          insertTask,
          lookupContactByWaId,
        } = await import('./yo/supabase-client.js')
        const { classifyMessage } = await import('./yo/classifier.js')

        const combined = messages
          .map((m) => m.contenido)
          .join('\n')
          .trim()
        if (!combined) {
          console.log(`[webhook] mensaje vacío de ${waId}, ignorando`)
          return
        }

        const task = await processIncomingForYo(
          { waId, content: combined, source: 'whatsapp' },
          {
            lookupContact: lookupContactByWaId,
            ensureContact,
            listProjectsForContact,
            insertTask,
            classify: classifyMessage,
          },
          {
            activeProjects: CONFIG.YO_ACTIVE_PROJECTS
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        )
        console.log(
          `[webhook] yo task creada ${task.id} (project=${task.project_slug ?? 'untriaged'})`
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[webhook] yo pipeline error:', msg)
      }
    } else {
      console.log(`[webhook] Mensaje de ${waId} (no es Nahuel) — pipeline OFF, ignorando`)
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
      // Rate limit por IP (FIX M3 — defensa básica contra abuso)
      const ip =
        ((req.headers['x-forwarded-for'] as string | undefined) || '')
          .split(',')[0]
          .trim() ||
        req.socket.remoteAddress ||
        'unknown'
      const rl = checkRateLimit(ip)
      if (!rl.ok) {
        console.warn(`[webhook] RATE_LIMIT exceeded ip=${ip}`)
        res.writeHead(429, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
        return true
      }

      const rawBody = await parseBody(req)

      // Auth dual (FIX M3): Meta signature O n8n Bearer
      const signature = (req.headers['x-hub-signature-256'] as string | null) || null
      const authHeader = (req.headers.authorization as string | null) || null
      const auth = verifyAuth(rawBody, signature, authHeader)
      if (!auth.ok) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized', reason: 'missing_or_invalid_auth' }))
        return true
      }
      console.log(`[webhook] auth=${auth.method} ip=${ip}`)

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

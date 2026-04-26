/**
 * WhatsApp Business Cloud API — sender para Super Yo (Vittoria)
 * Funciones: sendTextMessage, sendTypingIndicator, markAsRead, prepareForWhatsApp
 */

const API_VERSION = 'v21.0'

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!id) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured')
  return id
}

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN not configured')
  return token
}

/**
 * Fetch wrapper con retry simple para WhatsApp API
 */
async function whatsappFetch(url: string, options: RequestInit): Promise<Response> {
  const maxRetries = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        const error = await response.json()
        const err = new Error(`WhatsApp API error (${response.status}): ${JSON.stringify(error)}`)
        // Retry on 429 or 5xx
        if (response.status === 429 || response.status >= 500) {
          lastError = err
          await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)))
          continue
        }
        throw err
      }
      return response
    } catch (err: any) {
      lastError = err
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)))
      }
    }
  }

  throw lastError || new Error('WhatsApp API failed after retries')
}

export interface WhatsAppTextMessage {
  to: string
  text: string
}

/**
 * Enviar mensaje de texto
 *
 * Si SUPERYO_SEND_WEBHOOK está seteado, delega el envío a un webhook n8n
 * (que mantiene la credencial WA Cloud API centralizada). Sino, fallback
 * a fetch directo a Meta Graph API usando WHATSAPP_ACCESS_TOKEN local.
 */
export async function sendTextMessage({ to, text }: WhatsAppTextMessage) {
  const bridgeUrl = process.env.SUPERYO_SEND_WEBHOOK
  if (bridgeUrl) {
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`SUPERYO_SEND_WEBHOOK ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json().catch(() => ({ status: 'sent' }))
  }

  const response = await whatsappFetch(
    `https://graph.facebook.com/${API_VERSION}/${getPhoneNumberId()}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  )

  return response.json()
}

/**
 * Mark as read (blue checkmarks)
 */
export async function markAsRead(messageId: string) {
  if (process.env.SUPERYO_SEND_WEBHOOK) return  // bridge mode: skip (n8n maneja UX read)
  await whatsappFetch(
    `https://graph.facebook.com/${API_VERSION}/${getPhoneNumberId()}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    }
  )
}

/**
 * Send typing indicator
 */
export async function sendTypingIndicator(to: string) {
  if (process.env.SUPERYO_SEND_WEBHOOK) return  // bridge mode: skip
  await whatsappFetch(
    `https://graph.facebook.com/${API_VERSION}/${getPhoneNumberId()}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'typing',
      }),
    }
  )
}

/**
 * Prepare text for WhatsApp: sanitize markdown, split long messages
 */
export function prepareForWhatsApp(text: string): string[] {
  if (!text?.trim()) return []

  const sanitized = text
    .replace(/^#{1,6}\s+/gm, '*')
    .replace(/\|.*\|/g, '')
    .replace(/^[-]{3,}$/gm, '')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (sanitized.length <= 4000) {
    return [sanitized]
  }

  const chunks: string[] = []
  const paragraphs = sanitized.split('\n\n')
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > 4000) {
      if (current.trim()) chunks.push(current.trim())
      if (para.length > 4000) {
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para]
        let sentChunk = ''
        for (const sent of sentences) {
          if (sentChunk.length + sent.length > 4000) {
            if (sentChunk.trim()) chunks.push(sentChunk.trim())
            sentChunk = sent
          } else {
            sentChunk += sent
          }
        }
        current = sentChunk
      } else {
        current = para
      }
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }
  if (current.trim()) chunks.push(current.trim())

  return chunks
}

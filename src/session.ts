import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  WAMessage,
  downloadMediaMessage,
  fetchLatestWaWebVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import { join } from 'path'
import { CONFIG } from './config.js'
import { extractSourceCode, extractPhoneNumber, extractContactName } from './parser.js'
import { upsertLead, logMessage } from './api-client.js'
import { transcribeAudio, describeImage } from './media.js'

const logger = pino({ level: 'warn' })

export type OnQRCallback = (sessionName: string, qr: string | null) => void

export async function startSession(sessionName: string, phoneNumber: string, onQR?: OnQRCallback) {
  const authDir = join(CONFIG.SESSIONS_DIR, sessionName)
  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  const { version, isLatest } = await fetchLatestWaWebVersion({})
  console.log(`[${sessionName}] WA version: ${version.join('.')}, latest: ${isLatest}`)

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: [`TRAID-CRM-${sessionName}`, 'Chrome', '127.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(`[${sessionName}] QR generado`)
      if (onQR) onQR(sessionName, qr)
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
      const shouldReconnect = reason !== DisconnectReason.loggedOut
      console.log(`[${sessionName}] Conexión cerrada. Razón: ${reason}.`)
      if (shouldReconnect) {
        setTimeout(() => startSession(sessionName, phoneNumber, onQR), 5000)
      }
    } else if (connection === 'open') {
      console.log(`[${sessionName}] ✓ Conectado a WhatsApp`)
      if (onQR) onQR(sessionName, null)
    }
  })

  // Escuchar mensajes (SOLO LECTURA - nunca envía mensajes)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return // solo mensajes en tiempo real

    for (const msg of messages) {
      if (msg.key.fromMe) continue // ignorar mensajes salientes

      try {
        await handleMessage(msg, sessionName)
      } catch (err) {
        console.error(`[${sessionName}] Error procesando mensaje:`, err)
      }
    }
  })

  return sock
}

async function handleMessage(msg: WAMessage, sessionName: string) {
  const phone = extractPhoneNumber(msg.key.remoteJid || '')
  if (!phone || phone === 'status') return // ignorar broadcasts de estado

  const pushName = extractContactName(msg.pushName)
  const messageContent = msg.message

  if (!messageContent) return

  let textContent = ''
  let messageType = 'text'
  let mediaUrl: string | undefined

  // Extraer texto
  if (messageContent.conversation) {
    textContent = messageContent.conversation
  } else if (messageContent.extendedTextMessage?.text) {
    textContent = messageContent.extendedTextMessage.text
  }
  // Mensaje de audio
  else if (messageContent.audioMessage) {
    messageType = 'audio'
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer
      textContent = await transcribeAudio(buffer)
    } catch {
      textContent = '[Audio - no se pudo descargar]'
    }
  }
  // Mensaje de imagen
  else if (messageContent.imageMessage) {
    messageType = 'image'
    const caption = messageContent.imageMessage.caption || ''
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer
      const description = await describeImage(buffer, messageContent.imageMessage.mimetype || 'image/jpeg')
      textContent = caption ? `${caption}\n[Imagen: ${description}]` : `[Imagen: ${description}]`
    } catch {
      textContent = caption || '[Imagen - no se pudo procesar]'
    }
  }
  // Mensaje de video
  else if (messageContent.videoMessage) {
    messageType = 'video'
    textContent = messageContent.videoMessage.caption || '[Video]'
  }
  // Mensaje de documento
  else if (messageContent.documentMessage) {
    messageType = 'document'
    textContent = `[Documento: ${messageContent.documentMessage.fileName || 'sin nombre'}]`
  }
  // Otros tipos - ignorar
  else {
    return
  }

  // Verificar código de fuente
  const sourceCode = extractSourceCode(textContent)
  const hasSourceCode = !!sourceCode

  console.log(`[${sessionName}] ${pushName} (${phone}): ${textContent.substring(0, 80)}${textContent.length > 80 ? '...' : ''}${sourceCode ? ` [${sourceCode}]` : ''}`)

  // Upsert lead
  try {
    await upsertLead({
      phone,
      name: pushName,
      first_message: textContent,
      source_code: sourceCode || undefined,
      owner: sessionName, // 'nacho' o 'nahuel'
    })
  } catch (err) {
    console.error(`[${sessionName}] Error upserting lead:`, err)
  }

  // Log message
  try {
    await logMessage({
      contact_phone: phone,
      direction: 'inbound',
      message_type: messageType,
      content: textContent,
      media_url: mediaUrl,
      has_source_code: hasSourceCode,
    })
  } catch (err) {
    console.error(`[${sessionName}] Error logging message:`, err)
  }
}

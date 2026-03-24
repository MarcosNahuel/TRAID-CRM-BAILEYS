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
import { analyzeMessage, extractEntities, sendTelegram, bufferMessage } from './brain.js'
import { embedAndStore } from './embeddings.js'
import { persistExtractedData, getContactStatus } from './graph-client.js'

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
    browser: ['Chrome (Linux)', 'Chrome', '127.0.0'],
    syncFullHistory: true,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
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
  // Acepta 'notify' (tiempo real) y 'append' (sync histórico)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const isHistorySync = type === 'append'

    for (const msg of messages) {
      try {
        await handleMessage(msg, sessionName, isHistorySync)
      } catch (err) {
        console.error(`[${sessionName}] Error procesando mensaje:`, err)
      }
    }
  })

  return sock
}

async function handleMessage(msg: WAMessage, sessionName: string, isHistorySync: boolean = false) {
  const jid = msg.key.remoteJid || ''
  if (!jid || jid === 'status@broadcast') return // ignorar broadcasts de estado

  // Detectar si es grupo
  const isGroup = jid.endsWith('@g.us')
  const fromMe = !!msg.key.fromMe

  // Extraer phone: en grupos, el participante; en chats, el remoteJid
  let phone: string
  let senderName: string

  if (isGroup) {
    // Grupos: extraer participante (quién envió) + ID del grupo
    const participant = msg.key.participant || ''
    phone = extractPhoneNumber(participant || jid)
    senderName = fromMe ? 'Nahuel Albornoz' : extractContactName(msg.pushName)
  } else {
    phone = extractPhoneNumber(jid)
    senderName = fromMe ? 'Nahuel Albornoz' : extractContactName(msg.pushName)
  }

  if (!phone) return

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
  // En sync histórico, no descargar media (URLs expiradas)
  else if (messageContent.audioMessage) {
    messageType = 'audio'
    if (isHistorySync) {
      textContent = '[Audio]'
    } else {
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer
        textContent = await transcribeAudio(buffer)
      } catch {
        textContent = '[Audio - no se pudo descargar]'
      }
    }
  }
  else if (messageContent.imageMessage) {
    messageType = 'image'
    const caption = messageContent.imageMessage.caption || ''
    if (isHistorySync) {
      textContent = caption || '[Imagen]'
    } else {
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer
        const description = await describeImage(buffer, messageContent.imageMessage.mimetype || 'image/jpeg')
        textContent = caption ? `${caption}\n[Imagen: ${description}]` : `[Imagen: ${description}]`
      } catch {
        textContent = caption || '[Imagen - no se pudo procesar]'
      }
    }
  }
  else if (messageContent.videoMessage) {
    messageType = 'video'
    textContent = messageContent.videoMessage.caption || '[Video]'
  }
  else if (messageContent.documentMessage) {
    messageType = 'document'
    textContent = `[Documento: ${messageContent.documentMessage.fileName || 'sin nombre'}]`
  }
  else {
    return
  }

  // Verificar código de fuente
  const sourceCode = extractSourceCode(textContent)
  const hasSourceCode = !!sourceCode
  const direction = fromMe ? 'outbound' : 'inbound'
  const groupTag = isGroup ? ` [GRUPO]` : ''
  const syncTag = isHistorySync ? ` [SYNC]` : ''

  console.log(`[${sessionName}]${syncTag}${groupTag} ${senderName} (${phone}): ${textContent.substring(0, 80)}${textContent.length > 80 ? '...' : ''}`)

  // Upsert lead (solo para chats individuales, no grupos)
  if (!isGroup) {
    try {
      await upsertLead({
        phone,
        name: senderName === 'Nahuel Albornoz' ? undefined : senderName,
        first_message: textContent,
        source_code: sourceCode || undefined,
        owner: sessionName,
      })
    } catch (err) {
      console.error(`[${sessionName}] Error upserting lead:`, err)
    }
  }

  // Log message (chats + grupos)
  try {
    await logMessage({
      contact_phone: isGroup ? jid : phone, // para grupos, guardar el JID del grupo
      direction,
      message_type: messageType,
      content: isGroup ? `[${senderName}] ${textContent}` : textContent,
      media_url: mediaUrl,
      has_source_code: hasSourceCode,
    })

    // Generar embedding async (fire-and-forget) — no para sync masivo
    if (!isHistorySync) {
      embedAndStore(phone, textContent, senderName).catch(err =>
        console.error(`[${sessionName}] Error embedding:`, err)
      )
    }
  } catch (err) {
    console.error(`[${sessionName}] Error logging message:`, err)
  }

  // Segundo cerebro: solo para contactos ACTIVE, mensajes en tiempo real
  if (!isHistorySync && !fromMe) {
    try {
      const contactStatus = await getContactStatus(phone)

      if (contactStatus === 'active') {
        // Buffer de 30 seg: acumula mensajes y analiza con contexto del hilo
        bufferMessage(senderName, phone, textContent, sessionName, isGroup, async (analysis, bufPhone, bufContent) => {
          if (analysis) {
            const telegramMsg = `<b>📱 ${sessionName.toUpperCase()}</b>${groupTag}\n<b>${senderName}</b> (${bufPhone})\n<i>${bufContent.substring(0, 100)}</i>\n\n🧠 ${analysis}`
            await sendTelegram(telegramMsg)
          }
        })
      }
      // muted / ignored: no análisis, solo almacenamiento (ya se guardó arriba)
    } catch (err) {
      console.error(`[${sessionName}] Error brain:`, err)
    }
  }

  // Extracción de entidades → Knowledge Graph (fire-and-forget, no para sync masivo)
  if (!isHistorySync) {
    extractEntities(senderName, phone, textContent)
      .then(extraction => {
        if (extraction) {
          return persistExtractedData(phone, senderName, extraction)
        }
      })
      .catch(err => console.error(`[${sessionName}] Error graph extraction:`, err))
  }
}

/**
 * Parser de exports WhatsApp (.txt)
 *
 * Formato estándar de export (sin media):
 * 22/3/2026, 14:30 - Juan Pérez: Hola, necesito el presupuesto
 * 22/3/2026, 14:35 - Nahuel Albornoz: Dale, te lo mando mañana
 *
 * También soporta:
 * [22/3/2026, 14:30:45] Juan Pérez: Hola
 * 3/22/26, 2:30 PM - Juan Pérez: Hola
 */

export interface ParsedMessage {
  timestamp: Date
  sender: string
  content: string
  isNahuel: boolean
}

export interface ParsedChat {
  contactName: string
  messages: ParsedMessage[]
  messageCount: number
  firstMessage: Date | null
  lastMessage: Date | null
}

// Variantes del nombre de Nahuel para detectar mensajes propios
const NAHUEL_NAMES = [
  'nahuel', 'nahuel albornoz', 'nacho', 'vos', 'you', 'tú',
]

// Regex para detectar líneas de mensaje (múltiples formatos de export)
const MESSAGE_PATTERNS = [
  // Formato: DD/MM/YYYY, HH:MM - Nombre: Mensaje
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)\s*[-–]\s*(.+?):\s(.+)/i,
  // Formato: [DD/MM/YYYY, HH:MM:SS] Nombre: Mensaje
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)\]\s*(.+?):\s(.+)/i,
  // Formato: MM/DD/YY, HH:MM AM/PM - Nombre: Mensaje
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\s*[-–]\s*(.+?):\s(.+)/i,
]

// Líneas de sistema a ignorar
const SYSTEM_PATTERNS = [
  /los mensajes y las llamadas están cifrados/i,
  /messages and calls are end-to-end encrypted/i,
  /se unió usando/i,
  /joined using/i,
  /creó el grupo/i,
  /created group/i,
  /cambió el asunto/i,
  /changed the subject/i,
  /añadió a/i,
  /added/i,
  /se fue|left/i,
  /eliminó este mensaje/i,
  /this message was deleted/i,
  /imagen omitida|image omitted/i,
  /video omitido|video omitted/i,
  /audio omitido|audio omitted/i,
  /documento omitido|document omitted/i,
  /sticker omitido|sticker omitted/i,
  /GIF omitido|GIF omitted/i,
  /contacto omitido|contact omitted/i,
  /ubicación omitida|location omitted/i,
]

function isSystemMessage(content: string): boolean {
  return SYSTEM_PATTERNS.some(p => p.test(content))
}

function isNahuelSender(sender: string): boolean {
  const normalized = sender.toLowerCase().trim()
  return NAHUEL_NAMES.some(n => normalized.includes(n))
}

function parseDate(dateStr: string, timeStr: string): Date {
  // Intentar DD/MM/YYYY o DD/MM/YY
  const dateParts = dateStr.split('/')
  if (dateParts.length !== 3) return new Date()

  let day = parseInt(dateParts[0])
  let month = parseInt(dateParts[1])
  let year = parseInt(dateParts[2])

  // Si el año es de 2 dígitos
  if (year < 100) year += 2000

  // Normalizar hora
  let hours = 0
  let minutes = 0
  const timeParts = timeStr.replace(/\s*[ap]\.?\s*m\.?/i, '').split(':')
  hours = parseInt(timeParts[0])
  minutes = parseInt(timeParts[1] || '0')

  // AM/PM
  if (/p\.?\s*m\.?/i.test(timeStr) && hours < 12) hours += 12
  if (/a\.?\s*m\.?/i.test(timeStr) && hours === 12) hours = 0

  return new Date(year, month - 1, day, hours, minutes)
}

function parseLine(line: string): { date: string; time: string; sender: string; content: string } | null {
  for (const pattern of MESSAGE_PATTERNS) {
    const match = line.match(pattern)
    if (match) {
      return {
        date: match[1],
        time: match[2],
        sender: match[3].trim(),
        content: match[4].trim(),
      }
    }
  }
  return null
}

/**
 * Parsea un archivo de export de WhatsApp
 */
export function parseWhatsAppExport(text: string, fileName?: string): ParsedChat {
  const lines = text.split('\n')
  const messages: ParsedMessage[] = []
  let currentMessage: { date: string; time: string; sender: string; content: string } | null = null
  const senders = new Map<string, number>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parsed = parseLine(trimmed)

    if (parsed) {
      // Guardar mensaje anterior si existe
      if (currentMessage && !isSystemMessage(currentMessage.content)) {
        const sender = currentMessage.sender
        senders.set(sender, (senders.get(sender) || 0) + 1)
        messages.push({
          timestamp: parseDate(currentMessage.date, currentMessage.time),
          sender,
          content: currentMessage.content,
          isNahuel: isNahuelSender(sender),
        })
      }
      currentMessage = parsed
    } else if (currentMessage) {
      // Línea de continuación (mensaje multilínea)
      currentMessage.content += '\n' + trimmed
    }
  }

  // Último mensaje
  if (currentMessage && !isSystemMessage(currentMessage.content)) {
    const sender = currentMessage.sender
    senders.set(sender, (senders.get(sender) || 0) + 1)
    messages.push({
      timestamp: parseDate(currentMessage.date, currentMessage.time),
      sender,
      content: currentMessage.content,
      isNahuel: isNahuelSender(sender),
    })
  }

  // Determinar el nombre del contacto (el sender que NO es Nahuel con más mensajes)
  let contactName = 'Desconocido'
  let maxCount = 0
  for (const [sender, count] of senders) {
    if (!isNahuelSender(sender) && count > maxCount) {
      contactName = sender
      maxCount = count
    }
  }

  // Fallback: usar nombre del archivo si no se pudo determinar
  if (contactName === 'Desconocido' && fileName) {
    const nameFromFile = fileName
      .replace(/\.txt$/i, '')
      .replace(/^Chat de WhatsApp con /i, '')
      .replace(/^WhatsApp Chat with /i, '')
      .trim()
    if (nameFromFile) contactName = nameFromFile
  }

  return {
    contactName,
    messages,
    messageCount: messages.length,
    firstMessage: messages.length > 0 ? messages[0].timestamp : null,
    lastMessage: messages.length > 0 ? messages[messages.length - 1].timestamp : null,
  }
}

/**
 * Parsea múltiples archivos de export
 */
export function parseMultipleExports(files: { name: string; content: string }[]): ParsedChat[] {
  return files.map(f => parseWhatsAppExport(f.content, f.name))
}

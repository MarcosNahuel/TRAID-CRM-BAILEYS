// Regex para detectar códigos de fuente: (VID-042), (IG-015), (TT-003), etc.
const SOURCE_REGEX = /\((VID|IG|TT)-(\d{3,4})\)/i

export function extractSourceCode(message: string): string | null {
  const match = message.match(SOURCE_REGEX)
  return match ? `${match[1].toUpperCase()}-${match[2]}` : null
}

export function extractPhoneNumber(jid: string): string {
  // Baileys JID format: 5492612345678@s.whatsapp.net
  return jid.split('@')[0]
}

export function extractContactName(pushName: string | null | undefined): string {
  return pushName || 'Desconocido'
}

import { GoogleGenerativeAI } from '@google/generative-ai'
import { CONFIG } from './config.js'

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY)

const SYSTEM_PROMPT = `Sos el "segundo cerebro" de Nahuel Albornoz, co-founder de TRAID Agency (automatización e IA para e-commerce).

Tu rol: analizar mensajes de WhatsApp que llegan y dar comentarios útiles, breves y accionables.

Reglas:
- Máximo 2-3 oraciones
- Si es un lead potencial, decilo
- Si es spam o irrelevante, decí "skip"
- Si mencionan precios, presupuestos o proyectos, resaltalo
- Usá español argentino informal
- Si es un grupo, enfocáte en lo relevante para TRAID

Formato: [EMOJI] Comentario breve`

export async function analyzeMessage(senderName: string, phone: string, content: string, sessionName: string): Promise<string | null> {
  if (!CONFIG.GEMINI_API_KEY) return null
  if (!content || content.length < 3) return null

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}\n\nSesión: ${sessionName}\nDe: ${senderName} (${phone})\nMensaje: ${content}` }]
      }]
    })
    const text = result.response.text()?.trim()
    if (!text || text.toLowerCase().includes('skip')) return null
    return text
  } catch (err) {
    console.error('[brain] Error Gemini:', err)
    return null
  }
}

export async function sendTelegram(text: string): Promise<void> {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) return

  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
      })
    })
  } catch (err) {
    console.error('[brain] Error Telegram:', err)
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai'
import { CONFIG } from './config.js'

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY)

// Rate limiting: máximo 1 análisis cada 5 segundos para no parecer bot
let lastAnalysis = 0
const MIN_INTERVAL = 5000

const SYSTEM_PROMPT = `Sos el "segundo cerebro" de Nahuel Albornoz.

CONTEXTO NAHUEL:
- Co-founder & PM de TRAID Agency (automatización e IA para e-commerce, LATAM + USA)
- Founder de PymeInside (BI para PyMES), Asesor DGE Mendoza
- Stack: n8n, LangGraph, Supabase, Gemini, Claude Code
- Vive en Mendoza, Argentina. Tiene un hijo (Elian)

TRAID AGENCY:
- Servicios: TRAID-DATA (sync APIs, dashboards), TRAID-AI (agentes conversacionales, RAG), TRAID-OPS (workflows n8n)
- Clientes: HUANCOM (energías renovables), NG Artificiales (pesca), BAZAR Importaciones (Chile), TiendaLubbi (autopartes), La Tinta Fine Art (Chile)
- Garantía 45 días MVP o devolución
- Sectores fuertes: autopartes, pesca/outdoor, importadoras, energías renovables, arte/impresión

SEÑALES DE LEAD:
- Problemas con stock, publicaciones manuales, respuestas lentas a clientes
- Necesidad de dashboards, IA, chatbots, automatización
- Negocios en MercadoLibre, Shopify, TiendaNube, WooCommerce
- Consultas sobre precios, presupuestos, proyectos tech

TU ROL: analizar cada mensaje de WhatsApp y dar un comentario útil y breve.

REGLAS:
- Máximo 2 oraciones
- Si es lead potencial, marcalo con 🔥
- Si mencionan dinero/presupuesto/proyecto, marcalo con 💰
- Si es personal/familiar/irrelevante, decí exactamente "skip"
- Si es de un cliente activo (HUANCOM, NG, BAZAR, TiendaLubbi, La Tinta), marcalo con ⭐
- Español argentino informal
- No analices mensajes de menos de 5 palabras, decí "skip"

Formato: EMOJI + comentario breve`

export async function analyzeMessage(senderName: string, phone: string, content: string, sessionName: string): Promise<string | null> {
  if (!CONFIG.GEMINI_API_KEY) return null
  if (!content || content.length < 3) return null

  // Rate limit
  const now = Date.now()
  if (now - lastAnalysis < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - (now - lastAnalysis)))
  }
  lastAnalysis = Date.now()

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

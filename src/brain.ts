import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY)
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)

// Rate limiting: máximo 1 análisis cada 5 segundos para no parecer bot
let lastAnalysis = 0
const MIN_INTERVAL = 5000

// --- Conversation Buffer (30-seg debounce por contacto) ---

interface BufferedMessage {
  senderName: string
  phone: string
  content: string
  sessionName: string
  isGroup: boolean
  timestamp: number
}

interface ConversationBuffer {
  messages: BufferedMessage[]
  timer: ReturnType<typeof setTimeout>
}

const conversationBuffers = new Map<string, ConversationBuffer>()
const BUFFER_TIMEOUT = 30_000 // 30 segundos

// --- Whitelist: solo analizar contactos/grupos importantes ---
// Teléfonos individuales que importan
const IMPORTANT_PHONES = new Set([
  CONFIG.NACHO_PHONE,        // Nacho (socio)
  CONFIG.NAHUEL_PHONE,       // Nahuel mismo
  '5492615181225',           // Nahuel wa_id
])

// Patrones de nombre de grupo que importan (case insensitive)
const IMPORTANT_GROUP_PATTERNS = [
  'traid', 'dev', 'desarrollo', 'proyecto',
  'diego', 'alex', 'lubbi', 'herman', 'italicia',
]

// Contactos del graph que son clientes/socios (se carga 1 vez)
let importantPhonesLoaded = false
async function loadImportantPhones() {
  if (importantPhonesLoaded) return
  try {
    const { data } = await supabase
      .from('graph_entities')
      .select('properties')
      .eq('entity_type', 'person')
      .in('business_relevance', ['high', 'critical'])
      .not('properties->phone', 'is', null)
    for (const e of data || []) {
      if (e.properties?.phone) IMPORTANT_PHONES.add(e.properties.phone)
    }
    importantPhonesLoaded = true
    console.log(`[brain] Whitelist cargada: ${IMPORTANT_PHONES.size} contactos importantes`)
  } catch {}
}

function isImportantContact(phone: string, sessionName: string, isGroup: boolean): boolean {
  // Contactos individuales en whitelist
  if (IMPORTANT_PHONES.has(phone)) return true

  // Grupos con nombre relevante
  if (isGroup) {
    const lower = sessionName.toLowerCase()
    return IMPORTANT_GROUP_PATTERNS.some(p => lower.includes(p))
  }

  return false
}

/**
 * Agrega un mensaje al buffer del contacto.
 * Después de 30 seg sin mensajes nuevos, dispara análisis con contexto completo del hilo.
 * SOLO analiza contactos/grupos en la whitelist — el resto se ignora.
 */
export function bufferMessage(
  senderName: string,
  phone: string,
  content: string,
  sessionName: string,
  isGroup: boolean,
  onAnalysis: (result: string | null, phone: string, bufferedContent: string) => void
) {
  // Cargar whitelist la primera vez
  loadImportantPhones()

  // Skip si no es contacto/grupo importante
  if (!isImportantContact(phone, sessionName, isGroup)) return

  const existing = conversationBuffers.get(phone)

  if (existing) {
    clearTimeout(existing.timer)
    existing.messages.push({ senderName, phone, content, sessionName, isGroup, timestamp: Date.now() })
  } else {
    conversationBuffers.set(phone, {
      messages: [{ senderName, phone, content, sessionName, isGroup, timestamp: Date.now() }],
      timer: null as any,
    })
  }

  const buffer = conversationBuffers.get(phone)!
  buffer.timer = setTimeout(async () => {
    const msgs = buffer.messages
    conversationBuffers.delete(phone)

    if (msgs.length === 0) return

    const combinedContent = msgs.map(m => m.content).join('\n')
    const lastMsg = msgs[msgs.length - 1]

    console.log(`[brain] Buffer flush: ${msgs.length} msgs de ${lastMsg.senderName} (${phone})`)

    const result = await analyzeConversation(
      lastMsg.senderName,
      lastMsg.phone,
      combinedContent,
      lastMsg.sessionName
    )

    onAnalysis(result, phone, combinedContent)
  }, BUFFER_TIMEOUT)
}

// --- Clasificación 3 capas + agent_memory ---

interface MessageClassification {
  layer: 0 | 1 | 2
  project_tag: string | null
  type: 'decision' | 'action_item' | 'info' | 'blocker' | 'payment' | 'noise'
  summary: string
  entities: string[]
  urgency: 'low' | 'medium' | 'high'
  noise_category: 'confirmation' | 'reaction' | 'filler' | 'off_topic' | null
}

const PROJECT_TAGS = [
  { tag: 'diego-erp', keywords: ['diego', 'motos', 'repuestos', 'postventa diego'] },
  { tag: 'alex-saas', keywords: ['alex', 'ML México', 'Chile', 'rentabilidad', 'OAuth'] },
  { tag: 'super-yo', keywords: ['super yo', 'baileys', 'CRM', 'knowledge graph'] },
  { tag: 'italicia', keywords: ['vittoria', 'italicia', 'italiano', 'alumnos'] },
  { tag: 'traid-web', keywords: ['landing', 'web traid', 'página'] },
  { tag: 'agus', keywords: ['agus', 'cost sync', 'tareas empleados'] },
  { tag: 'miguel', keywords: ['miguel', 'postventa demo'] },
  { tag: 'eze', keywords: ['eze', 'bot errores'] },
  { tag: 'lubbi', keywords: ['lubbi', 'tienda lubbi', 'autopartes'] },
  { tag: 'herman', keywords: ['herman', 'sync stock'] },
]

const STRATEGIC_KEYWORDS = [
  'partnership', 'porcentaje', 'modelo de negocio', 'facturación',
  'cobrar', 'pago', 'cliente nuevo', 'pivot', 'estrategia',
  'YouTube', 'contenido', 'Shopify', 'canal de venta',
]

const CLASSIFICATION_PROMPT = `Sos el clasificador de memoria del sistema Super Yo de Nahuel Albornoz.

CONTEXTO:
- Nahuel es Co-founder & PM de TRAID Agency (automatización e IA para e-commerce)
- Su socio es Nacho (comercial/operativo)
- Clientes: Alex (ML México/Chile), Diego (motos), Agus (cost sync), Miguel, Eze, Lubbi, Herman, Fabio

PROJECT TAGS DISPONIBLES:
${PROJECT_TAGS.map(p => `- "${p.tag}": ${p.keywords.join(', ')}`).join('\n')}

KEYWORDS ESTRATÉGICAS (siempre layer 0):
${STRATEGIC_KEYWORDS.join(', ')}

TU TAREA: Clasificar el mensaje en una de 3 capas y extraer metadata.

CAPAS:
- layer 0 (ESTRATÉGICA): Decisiones de negocio, financiero, pivotes, modelo de negocio, partnerships. Afecta a toda la empresa.
- layer 1 (PROYECTO): Decisiones técnicas, bugs, features, estado de un cliente específico. Afecta a un proyecto.
- layer 2 (CONVERSACIONAL): "jaja", "dale", "ok", saludos, reacciones, confirmaciones cortas. Ruido.

REGLAS:
- Si contiene keywords estratégicas → layer 0, project_tag null
- Si menciona un cliente/proyecto específico con info sustancial → layer 1 con su project_tag
- Si es confirmación, reacción, filler, o menos de 5 palabras → layer 2
- type "noise" SOLO para layer 2
- urgency "high" si hay plata pendiente, deadline, o blocker

Respondé SOLO JSON válido:
{
  "layer": 0|1|2,
  "project_tag": "string o null",
  "type": "decision|action_item|info|blocker|payment|noise",
  "summary": "resumen conciso para Claude Code",
  "entities": ["nombres mencionados"],
  "urgency": "low|medium|high",
  "noise_category": "confirmation|reaction|filler|off_topic|null"
}`

/**
 * Analiza un lote de mensajes con clasificación 3 capas.
 * Escribe en agent_memory (layer 0/1) y communication_metrics (siempre).
 */
export async function analyzeConversation(
  senderName: string,
  phone: string,
  newContent: string,
  sessionName: string
): Promise<string | null> {
  if (!CONFIG.GEMINI_API_KEY) return null
  if (!newContent || newContent.length < 3) return null

  // Rate limit
  const now = Date.now()
  if (now - lastAnalysis < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - (now - lastAnalysis)))
  }
  lastAnalysis = Date.now()

  try {
    // Cargar últimos 20 mensajes del hilo desde crm_messages
    const { data: threadMessages } = await supabase
      .from('crm_messages')
      .select('content, direction, received_at')
      .eq('contact_phone', phone)
      .order('received_at', { ascending: false })
      .limit(20)

    const threadContext = (threadMessages || [])
      .reverse()
      .map(m => `[${m.direction === 'outbound' ? 'Nahuel' : senderName}]: ${m.content?.substring(0, 200)}`)
      .join('\n')

    // Paso 1: Clasificar con structured output (Gemini → OpenAI fallback)
    const classPrompt = `${CLASSIFICATION_PROMPT}\n\nDe: ${senderName} (${phone})\nSesión: ${sessionName}\n\n--- HILO RECIENTE ---\n${threadContext}\n\n--- MENSAJES NUEVOS ---\n${newContent}`
    let classText: string | null = null

    try {
      const classifierModel = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json' },
      })
      const classResult = await classifierModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: classPrompt }] }],
      })
      classText = classResult.response.text()?.trim() || null
    } catch (geminiErr: any) {
      // Fallback a OpenAI si Gemini falla (429, etc.)
      if (process.env.OPENAI_API_KEY) {
        console.log(`[brain] Gemini falló (${geminiErr.message?.substring(0, 50)}), usando OpenAI fallback`)
        const { generateText } = await import('ai')
        const { createOpenAI } = await import('@ai-sdk/openai')
        const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const fallback = await generateText({
          model: openai('gpt-4o-mini'),
          system: 'Respondé SOLO JSON válido, sin markdown ni backticks.',
          prompt: classPrompt,
        })
        classText = fallback.text?.trim() || null
      } else {
        throw geminiErr
      }
    }
    if (!classText) return null

    const classification: MessageClassification = JSON.parse(classText)
    console.log(`[brain] Clasificación: layer=${classification.layer} type=${classification.type} project=${classification.project_tag} urgency=${classification.urgency}`)

    // Paso 2: Escribir en agent_memory si es señal (layer 0 o 1)
    if (classification.layer <= 1 && classification.type !== 'noise') {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
      const key = `${senderName.toLowerCase().replace(/\s+/g, '-')}/${classification.type}-${timestamp}`

      const { error: memError } = await supabase
        .from('agent_memory')
        .insert({
          source: 'super_yo',
          direction: 'to_claude',
          layer: classification.layer,
          project_tag: classification.project_tag,
          memory_type: classification.type,
          scope: classification.project_tag ? [classification.project_tag] : ['traid'],
          key,
          content: classification.summary,
          synced_to_engram: false,
        })

      if (memError) {
        console.error('[brain] Error writing agent_memory:', memError.message)
      } else {
        console.log(`[brain] Memoria guardada: ${key} (layer ${classification.layer})`)
      }
    }

    // Paso 3: Upsert communication_metrics
    try {
      const today = new Date().toISOString().split('T')[0]
      const isSignal = classification.layer <= 1
      const noiseCategory = classification.noise_category || 'other'

      // Intentar update primero (más común)
      const { data: existing } = await supabase
        .from('communication_metrics')
        .select('id, total_messages, signal_count, noise_count, noise_categories, top_topics')
        .eq('contact_phone', phone)
        .eq('date', today)
        .eq('direction', 'received')
        .single()

      if (existing) {
        const noiseCats = (existing.noise_categories as Record<string, number>) || {}
        if (!isSignal) {
          noiseCats[noiseCategory] = (noiseCats[noiseCategory] || 0) + 1
        }

        const topics = (existing.top_topics as string[]) || []
        if (isSignal && classification.summary) {
          const shortTopic = classification.summary.slice(0, 50)
          if (!topics.includes(shortTopic)) topics.push(shortTopic)
          if (topics.length > 5) topics.shift()
        }

        await supabase
          .from('communication_metrics')
          .update({
            total_messages: (existing.total_messages || 0) + 1,
            signal_count: (existing.signal_count || 0) + (isSignal ? 1 : 0),
            noise_count: (existing.noise_count || 0) + (isSignal ? 0 : 1),
            noise_categories: noiseCats,
            top_topics: topics,
          })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('communication_metrics')
          .insert({
            contact_phone: phone,
            contact_name: senderName,
            date: today,
            direction: 'received',
            total_messages: 1,
            signal_count: isSignal ? 1 : 0,
            noise_count: isSignal ? 0 : 1,
            noise_categories: isSignal ? {} : { [noiseCategory]: 1 },
            top_topics: isSignal && classification.summary ? [classification.summary.slice(0, 50)] : [],
          })
      }
    } catch (metricsErr) {
      console.error('[brain] Error communication_metrics:', metricsErr)
    }

    // Paso 4: Telegram SOLO para señales realmente importantes
    // Filtro estricto: solo urgencia alta, blockers, pagos o decisiones estratégicas
    if (classification.layer === 2) return null
    if (classification.type === 'info' && classification.urgency !== 'high') return null
    if (classification.type === 'action_item' && classification.urgency === 'low') return null

    // Solo notificar de Nacho o grupos dev, no de cualquier contacto
    const isNacho = phone === CONFIG.NACHO_PHONE
    const isDevGroup = sessionName.toLowerCase().includes('dev') || sessionName.toLowerCase().includes('traid')
    const isStrategic = classification.layer === 0
    const isCritical = classification.urgency === 'high' || classification.type === 'blocker' || classification.type === 'payment'

    if (!isNacho && !isDevGroup && !isStrategic && !isCritical) return null

    const emoji = classification.urgency === 'high' ? '🚨'
      : classification.type === 'payment' ? '💰'
      : classification.type === 'blocker' ? '🔴'
      : classification.type === 'decision' ? '📋'
      : '📌'

    const layerLabel = classification.layer === 0 ? '[ESTRATÉGICA]' : `[${classification.project_tag || 'PROYECTO'}]`
    return `${emoji} ${layerLabel} ${classification.summary}`
  } catch (err) {
    console.error('[brain] Error Gemini conversation:', err)
    return null
  }
}

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

// --- Extracción de entidades para el knowledge graph ---

const EXTRACTION_PROMPT = `Sos un sistema de extracción de entidades del WhatsApp de Nahuel Albornoz.

CONTEXTO NAHUEL:
- Co-founder & PM de TRAID Agency (automatización e IA para e-commerce)
- Scopes conocidos: "traid" (trabajo TRAID), "pymeinside" (PymeInside), "dge" (DGE Mendoza), "family" (familia), "personal" (personal), "health" (salud)
- Clientes TRAID: HUANCOM, NG Artificiales, BAZAR, TiendaLubbi, La Tinta
- Familia: Elian (hijo)

EXTRAÉ entidades y relaciones del mensaje. Respondé SOLO JSON válido, sin markdown.

Schema:
{
  "entities": [{"name": "string", "type": "person|organization|topic|event|task|project|location|goal|decision|commitment|reminder", "scope": ["string"]}],
  "relationships": [{"from": "string", "to": "string", "type": "string", "scope": ["string"]}],
  "emotional_charge": "low|medium|high",
  "detected_events": [{"title": "string", "datetime": "ISO string o null", "scope": "string"}],
  "detected_tasks": [{"title": "string", "for_person": "string o null", "priority": "low|medium|high"}]
}

REGLAS:
- Si no hay entidades relevantes, devolvé arrays vacíos
- "type" de relationship: "knows", "works_at", "discussed", "mentioned", "assigned_to", "related_to", "requested", "promised"
- Siempre incluir al sender como entidad person
- Detectar eventos con fecha/hora (turnos, reuniones, deadlines)
- Detectar tareas/compromisos ("te lo mando", "hacelo", "necesito que")
- emotional_charge: "high" si hay frustración, urgencia, enojo o emoción fuerte`

export interface MessageExtraction {
  entities: Array<{ name: string; type: string; scope: string[] }>
  relationships: Array<{ from: string; to: string; type: string; scope?: string[] }>
  emotional_charge: 'low' | 'medium' | 'high'
  detected_events: Array<{ title: string; datetime?: string; scope?: string }>
  detected_tasks: Array<{ title: string; for_person?: string; priority?: string }>
}

export async function extractEntities(
  senderName: string,
  phone: string,
  content: string
): Promise<MessageExtraction | null> {
  if (!CONFIG.GEMINI_API_KEY) return null
  if (!content || content.length < 15) return null // necesitamos contenido sustancial

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { responseMimeType: 'application/json' },
    })
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `${EXTRACTION_PROMPT}\n\nDe: ${senderName} (${phone})\nMensaje: ${content}` }]
      }]
    })

    const text = result.response.text()?.trim()
    if (!text) return null

    const parsed = JSON.parse(text) as MessageExtraction
    return parsed
  } catch (err) {
    console.error('[brain] Error extraction:', err)
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

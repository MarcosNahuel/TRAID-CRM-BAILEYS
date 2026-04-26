/**
 * Bootstrap del Knowledge Graph
 *
 * Procesa exports WhatsApp (.txt) + crm_messages de Supabase
 * y genera el graph de contactos con 5 pasadas por contacto.
 *
 * Uso: npx tsx src/bootstrap-graph.ts ./exports/
 *
 * El script guarda progreso en ./bootstrap-progress.json
 * para resumir si se interrumpe.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { CONFIG } from './config.js'
import { parseWhatsAppExport, type ParsedChat } from './whatsapp-parser.js'
import { upsertEntity, upsertLink } from './graph-client.js'
import { embedText } from './embeddings.js'

const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY })
let _supabase: SupabaseClient | null = null
function supabase(): SupabaseClient {
  if (_supabase) return _supabase
  _supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
  return _supabase
}

const MODEL = 'gemini-2.0-flash'
const PROGRESS_FILE = './bootstrap-progress.json'
const RATE_LIMIT_MS = 150

// --- Tipos ---

interface ContactData {
  contactName: string
  phone?: string
  messages: Array<{ timestamp: Date | string; sender: string; content: string; isNahuel: boolean }>
  source: 'export' | 'crm' | 'merged'
}

interface ProgressState {
  processedContacts: string[] // normalized names
  totalContacts: number
  startedAt: string
  lastUpdate: string
}

// --- Helpers ---

function loadProgress(): ProgressState {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
  }
  return {
    processedContacts: [],
    totalContacts: 0,
    startedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
  }
}

function saveProgress(state: ProgressState) {
  state.lastUpdate = new Date().toISOString()
  writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2))
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function geminiCall(prompt: string): Promise<string> {
  const model = ai.models
  const result = await model.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  })
  return result.text || ''
}

const NAHUEL_PROFILE = `PERFIL NAHUEL ALBORNOZ:
- Co-founder & PM de TRAID Agency (automatización e IA para e-commerce, LATAM + USA)
- AI Generative Engineer (Agentic Systems)
- Founder PymeInside (BI para PyMES), Asesor DGE Mendoza
- Stack: n8n, LangGraph, Supabase, Gemini, Claude Code
- Vive en Mendoza, Argentina. Tiene un hijo (Elian)
- TRAID: TRAID-DATA + TRAID-AI + TRAID-OPS
- Clientes: HUANCOM (energías renovables), NG Artificiales (pesca), BAZAR (Chile), TiendaLubbi (autopartes), La Tinta (Chile)
- Scopes: "traid", "pymeinside", "dge", "family", "personal", "health", "friends"`

// --- 5 pasadas por contacto ---

async function pass1_classify(contactName: string, messages: string): Promise<any> {
  const prompt = `${NAHUEL_PROFILE}

Analiza el historial de chat entre Nahuel y "${contactName}".

Clasificá al contacto:
- scopes: array de strings (los ámbitos de la relación: "traid", "pymeinside", "dge", "family", "personal", "health", "friends", "client", "supplier", "lead")
- relationship: string (tipo de relación: "client", "prospect", "colleague", "friend", "family", "supplier", "mentor", "student", "acquaintance", "professional")
- organization: string o null (empresa/org a la que pertenece)

Respondé SOLO JSON válido:
{"scopes": [...], "relationship": "...", "organization": "..."}

HISTORIAL:
${messages}`
  return JSON.parse(await geminiCall(prompt))
}

async function pass2_extract(contactName: string, messages: string): Promise<any> {
  const prompt = `${NAHUEL_PROFILE}

Extraé información clave del historial con "${contactName}".

- topics: temas principales discutidos
- key_facts: datos importantes del contacto o la relación
- dates: fechas/eventos importantes mencionados

Respondé SOLO JSON:
{"topics": ["string"], "key_facts": ["string"], "dates": [{"date": "YYYY-MM-DD o aproximado", "description": "string"}]}

HISTORIAL:
${messages}`
  return JSON.parse(await geminiCall(prompt))
}

async function pass3_scoring(contactName: string, messages: string): Promise<any> {
  const prompt = `${NAHUEL_PROFILE}

Evaluá la relevancia de "${contactName}" para Nahuel.

- relevance: 0-100 (cuán importante es para la vida/trabajo de Nahuel)
- sentiment: "positive", "neutral", "negative" (tono general de la relación)
- frequency: "daily", "weekly", "monthly", "sporadic", "one-time"

Respondé SOLO JSON:
{"relevance": 0, "sentiment": "neutral", "frequency": "sporadic"}

HISTORIAL:
${messages}`
  return JSON.parse(await geminiCall(prompt))
}

async function pass4_relationships(contactName: string, messages: string, allContacts: string[]): Promise<any> {
  const prompt = `${NAHUEL_PROFILE}

Buscá menciones a OTRAS personas en el historial con "${contactName}".
Contactos conocidos: ${allContacts.join(', ')}

Para cada mención, indicá:
- target: nombre de la persona mencionada
- type: tipo de relación con el contacto ("knows", "works_with", "referred_by", "family_of", "friend_of")
- confidence: 0.0-1.0

Respondé SOLO JSON:
{"relationships": [{"target": "...", "type": "...", "confidence": 0.0}]}

HISTORIAL:
${messages}`
  return JSON.parse(await geminiCall(prompt))
}

async function pass5_summary(contactName: string, messages: string, prevResults: any): Promise<any> {
  const prompt = `${NAHUEL_PROFILE}

Generá un resumen de "${contactName}" para Nahuel.
Datos previos: ${JSON.stringify(prevResults)}

- summary: 2-3 oraciones describiendo quién es y la relación con Nahuel
- corrections: lista de inconsistencias encontradas en datos previos (si hay)

Respondé SOLO JSON:
{"summary": "...", "corrections": []}

HISTORIAL:
${messages}`
  return JSON.parse(await geminiCall(prompt))
}

// --- Carga de datos ---

function loadExports(dir: string): ParsedChat[] {
  if (!existsSync(dir)) {
    console.log(`Directorio de exports no encontrado: ${dir}`)
    return []
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.txt'))
  console.log(`Encontrados ${files.length} archivos de export`)

  return files.map(f => {
    const content = readFileSync(join(dir, f), 'utf-8')
    return parseWhatsAppExport(content, f)
  })
}

async function loadCrmMessages(): Promise<Map<string, ContactData>> {
  const contacts = new Map<string, ContactData>()

  // Cargar todos los mensajes agrupados por contacto
  const { data: messages, error } = await supabase()
    .from('crm_messages')
    .select('contact_phone, content, received_at, direction')
    .order('received_at', { ascending: true })

  if (error || !messages) {
    console.error('Error cargando crm_messages:', error?.message)
    return contacts
  }

  // Cargar nombres de leads
  const { data: leads } = await supabase()
    .from('crm_leads')
    .select('phone, name')

  const phoneToName = new Map<string, string>()
  for (const lead of leads || []) {
    if (lead.phone && lead.name) phoneToName.set(lead.phone, lead.name)
  }

  for (const msg of messages) {
    if (!msg.contact_phone || !msg.content) continue

    const name = phoneToName.get(msg.contact_phone) || msg.contact_phone
    const key = msg.contact_phone

    if (!contacts.has(key)) {
      contacts.set(key, {
        contactName: name,
        phone: msg.contact_phone,
        messages: [],
        source: 'crm',
      })
    }

    contacts.get(key)!.messages.push({
      timestamp: msg.received_at,
      sender: msg.direction === 'inbound' ? name : 'Nahuel Albornoz',
      content: msg.content,
      isNahuel: msg.direction !== 'inbound',
    })
  }

  return contacts
}

// --- Main ---

async function main() {
  const exportDir = process.argv[2] || './exports'
  console.log('=== BOOTSTRAP GRAPH ===')
  console.log(`Export dir: ${exportDir}`)

  // 1. Cargar exports + CRM
  const exports = loadExports(exportDir)
  const crmContacts = await loadCrmMessages()

  // 2. Merge: combinar datos por contacto
  const allContacts = new Map<string, ContactData>()

  for (const chat of exports) {
    if (chat.messageCount === 0) continue
    const key = chat.contactName.toLowerCase().trim()
    allContacts.set(key, {
      contactName: chat.contactName,
      messages: chat.messages.map(m => ({
        ...m,
        timestamp: m.timestamp,
      })),
      source: 'export',
    })
  }

  for (const [phone, data] of crmContacts) {
    const key = data.contactName.toLowerCase().trim()
    if (allContacts.has(key)) {
      // Merge: agregar mensajes de CRM a los existentes
      const existing = allContacts.get(key)!
      existing.messages.push(...data.messages)
      existing.phone = data.phone
      existing.source = 'merged'
    } else {
      allContacts.set(key, data)
    }
  }

  console.log(`Total contactos a procesar: ${allContacts.size}`)

  // 3. Cargar progreso
  const progress = loadProgress()
  progress.totalContacts = allContacts.size
  saveProgress(progress)

  const allContactNames = [...allContacts.values()].map(c => c.contactName)

  // 4. Procesar cada contacto
  let processed = 0
  for (const [key, contact] of allContacts) {
    if (progress.processedContacts.includes(key)) {
      processed++
      console.log(`[${processed}/${allContacts.size}] SKIP (ya procesado): ${contact.contactName}`)
      continue
    }

    processed++
    console.log(`\n[${processed}/${allContacts.size}] Procesando: ${contact.contactName} (${contact.messages.length} msgs)`)

    // Preparar historial como texto (truncar a 500K chars para seguridad)
    const messagesText = contact.messages
      .map(m => {
        const ts = m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp
        return `[${ts}] ${m.sender}: ${m.content}`
      })
      .join('\n')
      .substring(0, 500_000)

    try {
      // 5 pasadas
      console.log('  Pasada 1: Clasificación...')
      const classification = await pass1_classify(contact.contactName, messagesText)
      await sleep(RATE_LIMIT_MS)

      console.log('  Pasada 2: Extracción...')
      const extraction = await pass2_extract(contact.contactName, messagesText)
      await sleep(RATE_LIMIT_MS)

      console.log('  Pasada 3: Scoring...')
      const scoring = await pass3_scoring(contact.contactName, messagesText)
      await sleep(RATE_LIMIT_MS)

      console.log('  Pasada 4: Relaciones...')
      const relationships = await pass4_relationships(contact.contactName, messagesText, allContactNames)
      await sleep(RATE_LIMIT_MS)

      console.log('  Pasada 5: Resumen...')
      const summary = await pass5_summary(contact.contactName, messagesText, {
        classification, extraction, scoring,
      })
      await sleep(RATE_LIMIT_MS)

      // UPSERT persona en graph
      console.log('  Guardando en graph...')
      const personId = await upsertEntity({
        entity_type: 'person',
        name: contact.contactName,
        scope: classification.scopes || [],
        properties: {
          phone: contact.phone || null,
          relationship: classification.relationship,
          organization: classification.organization,
          topics: extraction.topics || [],
          key_facts: extraction.key_facts || [],
          dates: extraction.dates || [],
          frequency: scoring.frequency,
          message_count: contact.messages.length,
        },
        summary: summary.summary,
        business_relevance: scoring.relevance || 0,
        sentiment: scoring.sentiment || 'neutral',
      })

      // UPSERT organización si existe
      if (classification.organization) {
        const orgId = await upsertEntity({
          entity_type: 'organization',
          name: classification.organization,
          scope: classification.scopes || [],
        })
        await upsertLink({
          source_id: personId,
          target_id: orgId,
          relationship: 'works_at',
          scope: classification.scopes || [],
        })
      }

      // UPSERT topics como nodos
      for (const topic of (extraction.topics || []).slice(0, 5)) {
        const topicId = await upsertEntity({
          entity_type: 'topic',
          name: topic,
          scope: classification.scopes || [],
        })
        await upsertLink({
          source_id: personId,
          target_id: topicId,
          relationship: 'discussed',
          scope: classification.scopes || [],
        })
      }

      // UPSERT relaciones inter-contacto
      for (const rel of relationships.relationships || []) {
        if (rel.confidence < 0.5) continue
        try {
          const targetId = await upsertEntity({
            entity_type: 'person',
            name: rel.target,
            scope: [],
          })
          await upsertLink({
            source_id: personId,
            target_id: targetId,
            relationship: rel.type,
            scope: classification.scopes || [],
            confidence: rel.confidence,
          })
        } catch (err) {
          // Ignorar errores de relaciones (pueden ser nombres ambiguos)
        }
      }

      // Embed resumen del contacto
      try {
        const embedding = await embedText(
          `${contact.contactName}: ${summary.summary}`,
          'RETRIEVAL_DOCUMENT'
        )
        if (embedding.length) {
          await supabase()
            .from('graph_entities')
            .update({ embedding: `[${embedding.join(',')}]` })
            .eq('id', personId)
        }
      } catch (err) {
        console.error('  Error embedding:', err)
      }

      console.log(`  ✓ ${contact.contactName}: ${scoring.relevance}/100, ${classification.scopes?.join(',')}`)

      // Guardar progreso
      progress.processedContacts.push(key)
      saveProgress(progress)

    } catch (err) {
      console.error(`  ✗ Error procesando ${contact.contactName}:`, err)
      // Continuar con el siguiente contacto
    }
  }

  console.log(`\n=== BOOTSTRAP COMPLETO ===`)
  console.log(`Procesados: ${progress.processedContacts.length}/${allContacts.size}`)

  // Stats finales
  const { data: entityCount } = await supabase()
    .from('graph_entities')
    .select('entity_type', { count: 'exact', head: true })

  const { data: linkCount } = await supabase()
    .from('entity_links')
    .select('id', { count: 'exact', head: true })

  console.log(`Graph: entidades creadas, links creados`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

// @ts-nocheck — AI SDK v6 tool() overloads no infieren tipos con Zod v3 en strict mode
// Los tipos se validan en runtime por Zod. Este archivo solo define herramientas del agente.
/**
 * Tools del Super Yo — 16 herramientas para el asistente personal de Nahuel
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  getCrmSupabase,
  hybridSearchMessages,
  searchGraphEntity,
  queryGraphEntities,
  getEntityNeighbors,
  getMessagesByPhone,
  updateEntityProperties,
} from './crm-client.js'

// Embedding helper — reutiliza embedText() que usa @google/genai (v1, no v1beta)
async function embedQuery(text: string): Promise<number[]> {
  const { embedText } = await import('../embeddings.js')
  return embedText(text, 'RETRIEVAL_QUERY')
}

/**
 * 1. consultar_crm — Búsqueda híbrida en mensajes
 */
export const consultarCrmTool = tool({
  description:
    'Busca mensajes en el CRM de WhatsApp usando búsqueda semántica + texto. Útil para encontrar qué dijo alguien, cuándo, sobre qué tema.',
  parameters: z.object({
    query: z.string().describe('Texto de búsqueda (semántico + keyword)'),
    phone: z.string().optional().describe('Filtrar por teléfono del contacto'),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe('Cantidad de resultados'),
  }),
  execute: async ({ query, phone, limit }) => {
    try {
      if (phone) {
        const messages = await getMessagesByPhone(phone, limit)
        return { success: true, results: messages, count: messages.length, method: 'by_phone' }
      }

      // Extraer keywords significativas
      const stopWords = new Set(['busca', 'buscar', 'mensajes', 'conversaciones', 'con', 'de', 'del', 'la', 'el', 'los', 'las', 'que', 'en', 'por', 'para', 'un', 'una', 'es', 'y', 'o', 'a', 'mi', 'mis', 'me', 'se', 'le', 'lo', 'su', 'sus', 'como', 'qué', 'cual', 'sobre', 'entre', 'tiene', 'hay', 'fue', 'son', 'era', 'ser', 'al', 'más', 'últimas', 'últimos', 'dame', 'dime', 'muestra', 'ver', 'dice', 'dijo', 'habla', 'hablo', 'último', 'última'])
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w))
      const searchTerm = keywords.length > 0 ? keywords[0] : query

      // Paso 1: intentar resolver keyword como nombre de contacto → teléfono
      // Apodos comunes argentinos
      const nicknames: Record<string, string[]> = {
        'nacho': ['nacho', 'ignacio'],
        'seba': ['seba', 'sebastian', 'sebastián'],
        'fede': ['fede', 'federico'],
        'gabi': ['gabi', 'gabriel'],
        'ale': ['ale', 'alejandro', 'alejandra'],
        'mati': ['mati', 'matias', 'matías'],
        'nico': ['nico', 'nicolas', 'nicolás'],
        'pato': ['pato', 'patricio', 'patricia'],
        'agus': ['agus', 'agustin', 'agustín', 'agustina'],
      }
      const searchNames = nicknames[searchTerm] || [searchTerm]
      let leads: any[] = []
      for (const sn of searchNames) {
        const { data } = await getCrmSupabase()
          .from('crm_leads')
          .select('name, phone')
          .ilike('name', `%${sn}%`)
          .limit(3)
        if (data?.length) { leads = data; break }
      }

      if (leads && leads.length > 0) {
        // Encontró contacto(s) — buscar mensajes por teléfono(s)
        const phones = leads.map(l => l.phone)
        const { data: msgs } = await getCrmSupabase()
          .from('crm_messages')
          .select('id, content, contact_phone, direction, received_at')
          .in('contact_phone', phones)
          .order('received_at', { ascending: false })
          .limit(limit || 10)
        return {
          success: true,
          contact: leads[0].name,
          phones,
          results: msgs || [],
          count: msgs?.length || 0,
          method: 'by_contact_name',
        }
      }

      // Paso 2: fallback a ILIKE por contenido
      console.log(`[consultar_crm] Buscando ILIKE '%${searchTerm}%' en crm_messages`)
      const { data, error: dbErr } = await getCrmSupabase()
        .from('crm_messages')
        .select('id, content, contact_phone, received_at')
        .ilike('content', `%${searchTerm}%`)
        .order('received_at', { ascending: false })
        .limit(limit || 10)
      if (dbErr) console.error('[consultar_crm] DB error:', dbErr.message)
      console.log(`[consultar_crm] Resultados: ${data?.length || 0}`)
      return { success: true, results: data || [], count: data?.length || 0, keyword: searchTerm, method: 'by_content' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 2. buscar_contacto — Buscar persona en graph + vecinos
 */
export const buscarContactoTool = tool({
  description:
    'Busca un contacto en el knowledge graph. Devuelve datos del contacto, resumen, scope, y sus relaciones.',
  parameters: z.object({
    name: z.string().describe('Nombre del contacto a buscar'),
    scope: z.string().optional().describe('Filtrar por scope: traid, family, personal, dge, etc.'),
  }),
  execute: async ({ name, scope }) => {
    try {
      const entity = await searchGraphEntity(name, 'person')
      if (!entity) {
        return { success: false, message: `No encontré a "${name}" en el graph` }
      }

      const neighbors = await getEntityNeighbors(entity.id, scope)

      return {
        success: true,
        contact: {
          id: entity.id,
          name: entity.name,
          scope: entity.scope,
          properties: entity.properties,
          summary: entity.summary,
          business_relevance: entity.business_relevance,
          sentiment: entity.sentiment,
          last_interaction: entity.last_interaction,
        },
        relationships: neighbors.map((n: any) => ({
          name: n.name,
          type: n.entity_type,
          relationship: n.relationship,
          direction: n.direction,
        })),
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 3. sugerir_respuesta — Ghost writer con 3 voces
 */
export const sugerirRespuestaTool = tool({
  description:
    'Genera un draft de respuesta para que Nahuel copie/adapte. Usa la voz correcta del contacto (ejecutor/visionario/natural).',
  parameters: z.object({
    contact_phone: z.string().optional().describe('Teléfono del contacto para contexto'),
    contact_name: z.string().optional().describe('Nombre del contacto'),
    context: z.string().describe('Descripción de la situación y qué necesita responder'),
    voice: z
      .enum(['ejecutor', 'visionario', 'natural'])
      .optional()
      .describe('Override de voz'),
  }),
  execute: async ({ contact_phone, contact_name, context, voice }) => {
    let contactContext = ''
    let configuredVoice = voice || 'visionario'
    let contactRules: string[] = []
    let contactObjective = ''

    if (contact_phone || contact_name) {
      try {
        let entity: any = null
        if (contact_phone) {
          const crm = getCrmSupabase()
          const { data } = await crm
            .from('graph_entities')
            .select('id, name, properties')
            .eq('entity_type', 'person')
            .contains('properties', { phone: contact_phone })
            .single()
          entity = data
        } else if (contact_name) {
          entity = await searchGraphEntity(contact_name, 'person')
        }

        if (entity?.properties) {
          if (entity.properties.voice_config && !voice) {
            configuredVoice = entity.properties.voice_config
          }
          if (entity.properties.nahuel_rules) {
            contactRules = entity.properties.nahuel_rules.map((r: any) => r.rule || r)
          }
          if (entity.properties.objective) {
            contactObjective = entity.properties.objective
          }
        }
      } catch {}

      if (contact_phone) {
        const messages = await getMessagesByPhone(contact_phone, 5)
        if (messages.length > 0) {
          contactContext = `\nÚltimos mensajes:\n${messages.map((m: any) => `- [${m.direction}] ${m.content?.substring(0, 100)}`).join('\n')}`
        }
      }
    }

    const voiceGuide: Record<string, string> = {
      ejecutor: 'Directo, 1-2 oraciones, acción pura. Sin contexto innecesario.',
      visionario: 'Conecta lo técnico con impacto de negocio. Seguro y estratégico.',
      natural: 'Familia, sin filtro de marca. Cariñoso, informal, argentino puro.',
    }

    const rulesContext = contactRules.length > 0
      ? `\nReglas de trato: ${contactRules.join('; ')}`
      : ''

    const objectiveContext = contactObjective
      ? `\nObjetivo activo: ${contactObjective}`
      : ''

    return {
      success: true,
      message: `Draft con voz "${configuredVoice}"${contactRules.length > 0 ? ` (${contactRules.length} reglas)` : ''}`,
      draft_instructions: `Genera una respuesta para WhatsApp con voz ${configuredVoice}. ${voiceGuide[configuredVoice]}\n\nContexto: ${context}${contactContext}${rulesContext}${objectiveContext}\n\nIMPORTANTE: Corta (1-3 oraciones), natural para WhatsApp, suena como Nahuel.`,
      voice_used: configuredVoice,
      rules_applied: contactRules,
      objective: contactObjective || null,
    }
  },
})

/**
 * 4. graph_query — Explorar knowledge graph
 */
export const graphQueryTool = tool({
  description:
    'Explora el knowledge graph. Busca entidades por tipo, scope, o nombre.',
  parameters: z.object({
    entity_name: z.string().optional().describe('Nombre de entidad a buscar'),
    type: z.string().optional().describe('Tipo: person, organization, topic, event, task, project, goal, principle'),
    scope: z.string().optional().describe('Scope: traid, family, personal, dge, health, etc.'),
    depth: z.number().optional().default(1).describe('Profundidad de vecinos'),
  }),
  execute: async ({ entity_name, type, scope }) => {
    try {
      if (entity_name) {
        const entity = await searchGraphEntity(entity_name, type)
        if (!entity) {
          return { success: false, message: `No encontré "${entity_name}" en el graph` }
        }

        const neighbors = await getEntityNeighbors(entity.id, scope)
        return {
          success: true,
          entity: {
            id: entity.id,
            name: entity.name,
            type: entity.entity_type,
            scope: entity.scope,
            summary: entity.summary,
            properties: entity.properties,
          },
          neighbors: neighbors.map((n: any) => ({
            name: n.name,
            type: n.entity_type,
            relationship: n.relationship,
            direction: n.direction,
          })),
        }
      }

      const entities = await queryGraphEntities({
        entity_type: type,
        scope,
        limit: 20,
      })

      return {
        success: true,
        entities: entities.map((e: any) => ({
          id: e.id,
          name: e.name,
          type: e.entity_type,
          scope: e.scope,
          summary: e.summary,
          relevance: e.business_relevance,
        })),
        count: entities.length,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 5. planificar_dia — Tareas, eventos, compromisos pendientes
 */
export const planificarDiaTool = tool({
  description:
    'Obtiene tareas, eventos y compromisos pendientes para planificar el día.',
  parameters: z.object({
    date: z.string().optional().describe('Fecha en formato YYYY-MM-DD (default: hoy)'),
  }),
  execute: async ({ date }) => {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0]

      const tasks = await queryGraphEntities({ entity_type: 'task', limit: 20 })
      const pendingTasks = tasks.filter((t: any) => t.properties?.status === 'pending')

      const events = await queryGraphEntities({ entity_type: 'event', limit: 10 })
      const commitments = await queryGraphEntities({ entity_type: 'commitment', limit: 10 })
      const reminders = await queryGraphEntities({ entity_type: 'reminder', limit: 10 })

      return {
        success: true,
        date: targetDate,
        tasks: pendingTasks.map((t: any) => ({
          name: t.name,
          scope: t.scope,
          priority: t.properties?.priority || 'medium',
          for_person: t.properties?.for_person,
        })),
        events: events.map((e: any) => ({
          name: e.name,
          scope: e.scope,
          datetime: e.properties?.datetime,
        })),
        commitments: commitments.map((c: any) => ({
          name: c.name,
          scope: c.scope,
        })),
        reminders: reminders.map((r: any) => ({
          name: r.name,
          scope: r.scope,
        })),
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 6. analizar_sentimiento — Tendencia emocional de un contacto
 */
export const analizarSentimientoTool = tool({
  description:
    'Analiza la tendencia emocional de la relación con un contacto.',
  parameters: z.object({
    contact_phone: z.string().describe('Teléfono del contacto a analizar'),
    last_n: z.number().optional().default(20).describe('Cantidad de mensajes a analizar'),
  }),
  execute: async ({ contact_phone, last_n }) => {
    try {
      const messages = await getMessagesByPhone(contact_phone, last_n)

      if (messages.length === 0) {
        return { success: false, message: 'No hay mensajes de este contacto' }
      }

      return {
        success: true,
        message_count: messages.length,
        recent_messages: messages.slice(0, 10).map((m: any) => ({
          content: m.content?.substring(0, 150),
          direction: m.direction,
          date: m.received_at,
        })),
        instruction:
          'Analiza el tono emocional. Detecta patrones: frustrado, contento, distante, urgente. Da recomendación concreta.',
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 7. guardar_regla_contacto — Persistir regla de trato
 */
export const guardarReglaContactoTool = tool({
  description:
    'Guarda una regla de trato para un contacto. Se aplica automáticamente en futuras interacciones.',
  parameters: z.object({
    contact_phone: z.string().describe('Teléfono del contacto'),
    rule: z.string().describe('La regla a aplicar'),
  }),
  execute: async ({ contact_phone, rule }) => {
    try {
      const crm = getCrmSupabase()
      const { data: entity } = await crm
        .from('graph_entities')
        .select('id, properties')
        .eq('entity_type', 'person')
        .contains('properties', { phone: contact_phone })
        .single()

      if (!entity) {
        return { success: false, message: `No encontré contacto con teléfono ${contact_phone}` }
      }

      const props = entity.properties || {}
      const rules = props.nahuel_rules || []
      rules.push({ rule, created_at: new Date().toISOString() })

      await updateEntityProperties(entity.id, { nahuel_rules: rules })

      return {
        success: true,
        message: `Regla guardada: "${rule}"`,
        total_rules: rules.length,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 8. guardar_principio — Crear/reforzar principio estoico
 */
export const guardarPrincipioTool = tool({
  description:
    'Guarda un principio o aprendizaje personal en el knowledge graph.',
  parameters: z.object({
    principle: z.string().describe('El principio o aprendizaje'),
    context: z.string().describe('Contexto de por qué se guarda'),
  }),
  execute: async ({ principle, context }) => {
    try {
      const crm = getCrmSupabase()

      const normalized = principle
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

      const { data: existing } = await crm
        .from('graph_entities')
        .select('id, properties')
        .eq('entity_type', 'principle')
        .eq('normalized_name', normalized)
        .single()

      if (existing) {
        const props = existing.properties || {}
        const reinforcements = props.reinforcements || []
        reinforcements.push({ context, date: new Date().toISOString() })

        await updateEntityProperties(existing.id, {
          reinforcements,
          times_reinforced: reinforcements.length,
        })

        return {
          success: true,
          message: `Principio reforzado (${reinforcements.length} veces): "${principle}"`,
          is_new: false,
        }
      }

      const { error } = await crm.from('graph_entities').insert({
        entity_type: 'principle',
        name: principle,
        normalized_name: normalized,
        scope: ['personal'],
        properties: {
          original_context: context,
          reinforcements: [],
          times_reinforced: 0,
        },
        summary: `Principio: ${principle}. Origen: ${context}`,
      })

      if (error) throw new Error(error.message)

      return {
        success: true,
        message: `Nuevo principio guardado: "${principle}"`,
        is_new: true,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 9. crear_evento_calendario — Google Calendar
 */
export const crearEventoCalendarioTool = tool({
  description:
    'Crea un evento en Google Calendar con alarma. Cada scope tiene su calendar.',
  parameters: z.object({
    scope: z.enum(['traid', 'family', 'personal', 'dge', 'health']).describe('Scope del evento'),
    title: z.string().describe('Título del evento'),
    datetime: z.string().describe('Fecha y hora ISO 8601'),
    duration_minutes: z.number().optional().default(60).describe('Duración en minutos'),
    description: z.string().optional().describe('Descripción'),
  }),
  execute: async ({ scope, title, datetime, duration_minutes, description }) => {
    try {
      const { createEvent, isCalendarConfigured } = await import('../google/calendar.js')

      if (!isCalendarConfigured()) {
        return { success: false, message: 'Google Calendar no está configurado.' }
      }

      const result = await createEvent(scope, title, datetime, duration_minutes, description)
      return result
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 10. ver_agenda — Listar eventos del día
 */
export const verAgendaTool = tool({
  description:
    'Lista los eventos del día de todos los calendarios o de un scope.',
  parameters: z.object({
    date: z.string().optional().describe('Fecha en formato YYYY-MM-DD (default: hoy)'),
    scope: z.string().optional().describe('Filtrar por scope'),
  }),
  execute: async ({ date, scope }) => {
    try {
      const { listEvents, isCalendarConfigured } = await import('../google/calendar.js')

      if (!isCalendarConfigured()) {
        return { success: false, message: 'Google Calendar no está configurado.' }
      }

      const result = await listEvents(date, scope)
      return result
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 11. configurar_voz_contacto — Setear voz default
 */
export const configurarVozContactoTool = tool({
  description:
    'Configura la voz default de un contacto para el ghost writer.',
  parameters: z.object({
    contact_phone: z.string().describe('Teléfono del contacto'),
    voice: z.enum(['ejecutor', 'visionario', 'natural']).describe('Voz default'),
    override_rule: z.string().optional().describe('Regla de override'),
  }),
  execute: async ({ contact_phone, voice, override_rule }) => {
    try {
      const crm = getCrmSupabase()
      const { data: entity } = await crm
        .from('graph_entities')
        .select('id, name, properties')
        .eq('entity_type', 'person')
        .contains('properties', { phone: contact_phone })
        .single()

      if (!entity) {
        return { success: false, message: `No encontré contacto con teléfono ${contact_phone}` }
      }

      const updates: Record<string, any> = { voice_config: voice }
      if (override_rule) {
        updates.voice_override_rule = override_rule
      }

      await updateEntityProperties(entity.id, updates)

      return {
        success: true,
        message: `Voz de ${entity.name} configurada: "${voice}"${override_rule ? ` (override: ${override_rule})` : ''}`,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 12. configurar_objetivo_contacto — Setear objetivo activo
 */
export const configurarObjetivoContactoTool = tool({
  description:
    'Configura un objetivo activo para un contacto. Guía las sugerencias del ghost writer.',
  parameters: z.object({
    contact_phone: z.string().describe('Teléfono del contacto'),
    objective: z.string().describe('El objetivo activo'),
    strategy: z.string().optional().describe('Estrategia sugerida'),
  }),
  execute: async ({ contact_phone, objective, strategy }) => {
    try {
      const crm = getCrmSupabase()
      const { data: entity } = await crm
        .from('graph_entities')
        .select('id, name, properties')
        .eq('entity_type', 'person')
        .contains('properties', { phone: contact_phone })
        .single()

      if (!entity) {
        return { success: false, message: `No encontré contacto con teléfono ${contact_phone}` }
      }

      const updates: Record<string, any> = {
        objective,
        objective_set_at: new Date().toISOString(),
      }
      if (strategy) {
        updates.objective_strategy = strategy
      }

      await updateEntityProperties(entity.id, updates)

      return {
        success: true,
        message: `Objetivo configurado para ${entity.name}: "${objective}"${strategy ? ` | Estrategia: ${strategy}` : ''}`,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 13. configurar_status_contacto — Activar/mutear/ignorar
 */
export const configurarStatusContactoTool = tool({
  description:
    'Configura el status de un contacto: active, muted, ignored.',
  parameters: z.object({
    contact_phone: z.string().describe('Teléfono del contacto'),
    status: z.enum(['active', 'muted', 'ignored']).describe('Estado del contacto'),
  }),
  execute: async ({ contact_phone, status }) => {
    try {
      const crm = getCrmSupabase()
      const { data: entity } = await crm
        .from('graph_entities')
        .select('id, name, properties')
        .eq('entity_type', 'person')
        .contains('properties', { phone: contact_phone })
        .single()

      if (!entity) {
        return { success: false, message: `No encontré contacto con teléfono ${contact_phone}` }
      }

      await updateEntityProperties(entity.id, { contact_status: status })

      return {
        success: true,
        message: `${entity.name} ahora está ${status}`,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 14. buscar_emails — Buscar emails en Gmail
 */
export const buscarEmailsTool = tool({
  description:
    'Busca emails en Gmail. Usa sintaxis de búsqueda Gmail.',
  parameters: z.object({
    query: z.string().describe('Query de búsqueda Gmail'),
    max_results: z.number().optional().default(5).describe('Cantidad máxima de resultados'),
  }),
  execute: async ({ query, max_results }) => {
    try {
      const { searchEmails, isGmailConfigured } = await import('../google/gmail.js')

      if (!isGmailConfigured()) {
        return { success: false, message: 'Gmail no está configurado.' }
      }

      const result = await searchEmails(query, max_results)
      return result
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 15. leer_email — Leer contenido completo de un email
 */
export const leerEmailTool = tool({
  description:
    'Lee el contenido completo de un email por ID.',
  parameters: z.object({
    message_id: z.string().describe('ID del mensaje'),
  }),
  execute: async ({ message_id }) => {
    try {
      const { readEmail, isGmailConfigured } = await import('../google/gmail.js')

      if (!isGmailConfigured()) {
        return { success: false, message: 'Gmail no está configurado.' }
      }

      const result = await readEmail(message_id)
      return result
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 16. crear_borrador_email — Crear draft de email
 */
export const crearBorradorEmailTool = tool({
  description:
    'Crea un borrador de email en Gmail.',
  parameters: z.object({
    to: z.string().describe('Email del destinatario'),
    subject: z.string().describe('Asunto del email'),
    body: z.string().describe('Contenido del email'),
    reply_to_id: z.string().optional().describe('ID del mensaje al que responde'),
  }),
  execute: async ({ to, subject, body, reply_to_id }) => {
    try {
      const { createDraft, isGmailConfigured } = await import('../google/gmail.js')

      if (!isGmailConfigured()) {
        return { success: false, message: 'Gmail no está configurado.' }
      }

      const result = await createDraft(to, subject, body, reply_to_id)
      return result
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 17. buscar_memoria — Buscar en agent_memory (puente bidireccional)
 */
export const buscarMemoriaTool = tool({
  description:
    'Busca en la memoria compartida entre Super Yo y Claude Code. Encuentra decisiones, action items, info de proyectos.',
  parameters: z.object({
    query: z.string().describe('Texto de búsqueda (busca en content y key)'),
    project_tag: z.string().optional().describe('Filtrar por proyecto: diego-erp, alex-saas, super-yo, etc.'),
    layer: z.number().optional().describe('Filtrar por capa: 0=estratégica, 1=proyecto'),
    memory_type: z.string().optional().describe('Filtrar por tipo: decision, action_item, info, blocker, payment'),
    limit: z.number().optional().default(10).describe('Cantidad de resultados'),
  }),
  execute: async ({ query, project_tag, layer, memory_type, limit }) => {
    try {
      const crm = getCrmSupabase()
      let q = crm
        .from('agent_memory')
        .select('*')
        .or(`content.ilike.%${query}%,key.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (project_tag) q = q.eq('project_tag', project_tag)
      if (layer !== undefined) q = q.eq('layer', layer)
      if (memory_type) q = q.eq('memory_type', memory_type)

      const { data, error } = await q
      if (error) throw new Error(error.message)

      return {
        success: true,
        results: (data || []).map((m: any) => ({
          id: m.id,
          key: m.key,
          content: m.content,
          layer: m.layer,
          project_tag: m.project_tag,
          memory_type: m.memory_type,
          source: m.source,
          direction: m.direction,
          created_at: m.created_at,
        })),
        count: (data || []).length,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * 18. guardar_memoria — Escribir en agent_memory (dedup por key)
 */
export const guardarMemoriaTool = tool({
  description:
    'Guarda una observación, decisión o action item en la memoria compartida. Si ya existe la key, actualiza en vez de duplicar.',
  parameters: z.object({
    content: z.string().describe('Contenido de la memoria'),
    layer: z.number().describe('Capa: 0=estratégica (negocio), 1=proyecto (técnica)'),
    memory_type: z.enum(['decision', 'action_item', 'info', 'blocker', 'payment']).describe('Tipo de memoria'),
    key: z.string().describe('Key human-readable, ej: nacho/pivot-partnership'),
    project_tag: z.string().optional().describe('Tag del proyecto (null=global)'),
    direction: z.enum(['to_agent', 'to_claude', 'both']).optional().default('both').describe('Dirección de la memoria'),
  }),
  execute: async ({ content, layer, memory_type, key, project_tag, direction }) => {
    try {
      const crm = getCrmSupabase()

      // Dedup: si ya existe key, UPDATE
      const { data: existing } = await crm
        .from('agent_memory')
        .select('id')
        .eq('key', key)
        .limit(1)
        .single()

      if (existing) {
        const { error } = await crm
          .from('agent_memory')
          .update({
            content,
            layer,
            memory_type,
            project_tag: project_tag || null,
            direction: direction || 'both',
            synced_to_engram: false,
            synced_at: null,
          })
          .eq('id', existing.id)

        if (error) throw new Error(error.message)

        return {
          success: true,
          action: 'updated',
          message: `Memoria actualizada: "${key}"`,
          id: existing.id,
        }
      }

      const { data: inserted, error } = await crm
        .from('agent_memory')
        .insert({
          source: 'super_yo',
          direction: direction || 'both',
          layer,
          project_tag: project_tag || null,
          memory_type,
          key,
          content,
          synced_to_engram: false,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      return {
        success: true,
        action: 'created',
        message: `Memoria guardada: "${key}"`,
        id: inserted?.id,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

/**
 * Export de todos los tools (18)
 */
export const superYoTools = {
  consultar_crm: consultarCrmTool,
  buscar_contacto: buscarContactoTool,
  sugerir_respuesta: sugerirRespuestaTool,
  graph_query: graphQueryTool,
  planificar_dia: planificarDiaTool,
  analizar_sentimiento: analizarSentimientoTool,
  guardar_regla_contacto: guardarReglaContactoTool,
  guardar_principio: guardarPrincipioTool,
  crear_evento_calendario: crearEventoCalendarioTool,
  ver_agenda: verAgendaTool,
  configurar_voz_contacto: configurarVozContactoTool,
  configurar_objetivo_contacto: configurarObjetivoContactoTool,
  configurar_status_contacto: configurarStatusContactoTool,
  buscar_emails: buscarEmailsTool,
  leer_email: leerEmailTool,
  crear_borrador_email: crearBorradorEmailTool,
  buscar_memoria: buscarMemoriaTool,
  guardar_memoria: guardarMemoriaTool,
}

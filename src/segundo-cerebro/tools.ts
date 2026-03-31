/**
 * Tools MCP in-process para el Segundo Cerebro
 *
 * 5 herramientas que leen Supabase via REST API (fetch directo):
 * 1. read_whatsapp_messages — mensajes de crm_messages
 * 2. read_memories — agent_memory (layer 0=estratégica, 1=proyecto)
 * 3. read_contacts — graph_entities con relaciones
 * 4. search_knowledge — búsqueda texto en mensajes + memorias
 * 5. read_metrics — communication_metrics signal/noise
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod/v4'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''

/**
 * Helper: query Supabase REST API
 */
async function supabaseQuery(
  table: string,
  params: Record<string, string> = {},
  options?: { method?: string; body?: unknown }
): Promise<{ data: any; error: string | null }> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  try {
    const res = await fetch(url.toString(), {
      method: options?.method || 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text()
      return { data: null, error: `${res.status}: ${text}` }
    }

    const data = await res.json()
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

/**
 * Helper: query Supabase RPC function
 */
async function supabaseRpc(
  fn: string,
  params: Record<string, unknown>
): Promise<{ data: any; error: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const text = await res.text()
      return { data: null, error: `${res.status}: ${text}` }
    }

    const data = await res.json()
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

// --- Tool definitions ---

const readWhatsappMessages = tool(
  'read_whatsapp_messages',
  'Lee mensajes de WhatsApp del CRM filtrados por contacto y/o rango de días. Devuelve contenido, dirección, tipo y fecha.',
  {
    contact_phone: z.string().optional().describe('Teléfono del contacto (ej: 5492615181225). Si no se pasa, devuelve todos.'),
    days: z.number().optional().describe('Últimos N días (default: 7)'),
    limit: z.number().optional().describe('Máximo de mensajes (default: 50)'),
    search_text: z.string().optional().describe('Filtrar por texto contenido en el mensaje'),
  },
  async (args) => {
    const days = args.days ?? 7
    const limit = args.limit ?? 50
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const params: Record<string, string> = {
      select: 'id,content,direction,message_type,contact_phone,received_at',
      'received_at': `gte.${since}`,
      order: 'received_at.desc',
      limit: String(limit),
    }

    if (args.contact_phone) {
      params['contact_phone'] = `eq.${args.contact_phone}`
    }

    if (args.search_text) {
      params['content'] = `ilike.*${args.search_text}*`
    }

    const { data, error } = await supabaseQuery('crm_messages', params)

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    }
  }
)

const readMemories = tool(
  'read_memories',
  'Lee memorias del agente desde agent_memory. Layer 0 = estratégica (decisiones de negocio), Layer 1 = proyecto (técnico). Incluye scope, tags y contenido.',
  {
    layer: z.number().optional().describe('0=estratégica, 1=proyecto. Si no se pasa, ambas.'),
    scope: z.string().optional().describe('Scope: traid, pymeinside, dge, personal, etc.'),
    project_tag: z.string().optional().describe('Tag de proyecto: diego-erp, alex-saas, super-yo, etc.'),
    search: z.string().optional().describe('Buscar en content o key'),
    limit: z.number().optional().describe('Máximo (default: 30)'),
  },
  async (args) => {
    const limit = args.limit ?? 30
    const params: Record<string, string> = {
      select: 'id,source,layer,project_tag,memory_type,scope,key,content,created_at',
      order: 'created_at.desc',
      limit: String(limit),
    }

    if (args.layer !== undefined) {
      params['layer'] = `eq.${args.layer}`
    }
    if (args.scope) {
      params['scope'] = `eq.${args.scope}`
    }
    if (args.project_tag) {
      params['project_tag'] = `eq.${args.project_tag}`
    }
    if (args.search) {
      params['or'] = `(content.ilike.*${args.search}*,key.ilike.*${args.search}*)`
    }

    const { data, error } = await supabaseQuery('agent_memory', params)

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    }
  }
)

const readContacts = tool(
  'read_contacts',
  'Lee contactos y entidades del knowledge graph (personas, organizaciones, proyectos). Incluye propiedades, scope, relevancia de negocio y sentimiento.',
  {
    entity_type: z.string().optional().describe('Tipo: person, organization, project, event, task, decision'),
    scope: z.string().optional().describe('Scope: traid, pymeinside, dge, family, personal'),
    name: z.string().optional().describe('Buscar por nombre'),
    limit: z.number().optional().describe('Máximo (default: 20)'),
    include_neighbors: z.boolean().optional().describe('Incluir relaciones/vecinos (default: false)'),
  },
  async (args) => {
    const limit = args.limit ?? 20
    const params: Record<string, string> = {
      select: 'id,entity_type,name,scope,properties,summary,business_relevance,sentiment,last_interaction',
      order: 'last_interaction.desc.nullslast',
      limit: String(limit),
    }

    if (args.entity_type) {
      params['entity_type'] = `eq.${args.entity_type}`
    }
    if (args.scope) {
      params['scope'] = `cs.{${args.scope}}`
    }
    if (args.name) {
      const normalized = args.name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      params['normalized_name'] = `ilike.*${normalized}*`
    }

    const { data, error } = await supabaseQuery('graph_entities', params)

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true }
    }

    // Si pidió vecinos y hay resultados, obtenerlos
    if (args.include_neighbors && data?.length > 0) {
      for (const entity of data) {
        const { data: neighbors } = await supabaseRpc('get_entity_neighbors', {
          p_entity_id: entity.id,
          p_scope: args.scope || null,
        })
        entity.neighbors = neighbors || []
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    }
  }
)

const searchKnowledge = tool(
  'search_knowledge',
  'Búsqueda de texto libre en mensajes de WhatsApp Y memorias del agente. Combina resultados de ambas fuentes. Ideal para preguntas como "¿qué hablé con X sobre Y?".',
  {
    query: z.string().describe('Texto a buscar'),
    days: z.number().optional().describe('Últimos N días para mensajes (default: 30)'),
    limit: z.number().optional().describe('Máximo por fuente (default: 15)'),
  },
  async (args) => {
    const days = args.days ?? 30
    const limit = args.limit ?? 15
    const since = new Date(Date.now() - days * 86400000).toISOString()

    // Buscar en mensajes
    const msgParams: Record<string, string> = {
      select: 'content,contact_phone,direction,received_at',
      'content': `ilike.*${args.query}*`,
      'received_at': `gte.${since}`,
      order: 'received_at.desc',
      limit: String(limit),
    }
    const msgResult = await supabaseQuery('crm_messages', msgParams)

    // Buscar en memorias
    const memParams: Record<string, string> = {
      select: 'layer,scope,project_tag,key,content,created_at',
      'or': `(content.ilike.*${args.query}*,key.ilike.*${args.query}*)`,
      order: 'created_at.desc',
      limit: String(limit),
    }
    const memResult = await supabaseQuery('agent_memory', memParams)

    const results = {
      messages: msgResult.data || [],
      memories: memResult.data || [],
      messages_count: msgResult.data?.length || 0,
      memories_count: memResult.data?.length || 0,
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    }
  }
)

const readMetrics = tool(
  'read_metrics',
  'Lee métricas de comunicación: señal vs ruido por contacto, temas principales, tendencias. Útil para saber con quién hablás más, de qué, y cuánto es ruido.',
  {
    contact_phone: z.string().optional().describe('Teléfono específico. Si no se pasa, todos los contactos.'),
    days: z.number().optional().describe('Últimos N días (default: 7)'),
    limit: z.number().optional().describe('Máximo registros (default: 20)'),
  },
  async (args) => {
    const days = args.days ?? 7
    const limit = args.limit ?? 20
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const params: Record<string, string> = {
      select: 'contact_phone,date,direction,total_messages,signal_count,noise_count,noise_categories,top_topics',
      'date': `gte.${since.split('T')[0]}`,
      order: 'date.desc',
      limit: String(limit),
    }

    if (args.contact_phone) {
      params['contact_phone'] = `eq.${args.contact_phone}`
    }

    const { data, error } = await supabaseQuery('communication_metrics', params)

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    }
  }
)

// --- MCP Server export ---

export function createSuperyoDataServer() {
  return createSdkMcpServer({
    name: 'superyo-data',
    version: '1.0.0',
    tools: [
      readWhatsappMessages,
      readMemories,
      readContacts,
      searchKnowledge,
      readMetrics,
    ],
  })
}

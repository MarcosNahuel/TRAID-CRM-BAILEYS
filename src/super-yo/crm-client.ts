/**
 * Cliente Supabase para Super Yo
 * Reutiliza la conexión Supabase del proyecto (misma DB)
 * Tablas: crm_messages, crm_leads, graph_entities, entity_links, super_yo_chat
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { CONFIG } from '../config.js'

let crmClient: SupabaseClient | null = null

export function getCrmSupabase(): SupabaseClient {
  if (crmClient) return crmClient

  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL y SUPABASE_KEY deben estar configurados')
  }

  crmClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
  return crmClient
}

// --- Helpers para Super Yo ---

/**
 * Guardar mensaje en super_yo_chat
 */
export async function saveSuperYoMessage(
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  options?: {
    tools_used?: string[]
    model?: string
    tokens_used?: number
    scope?: string
  }
) {
  const { error } = await getCrmSupabase()
    .from('super_yo_chat')
    .insert({
      role,
      content,
      tools_used: options?.tools_used || null,
      model: options?.model || null,
      tokens_used: options?.tokens_used || null,
      scope: options?.scope || null,
    })

  if (error) console.error('[crm-client] Error guardando chat:', error.message)
}

/**
 * Obtener historial reciente del Super Yo
 */
export async function getSuperYoChatHistory(
  limit: number = 20
): Promise<Array<{ role: string; content: string }>> {
  const { data, error } = await getCrmSupabase()
    .from('super_yo_chat')
    .select('role, content')
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[crm-client] Error cargando historial:', error.message)
    return []
  }

  return (data || []).reverse()
}

/**
 * Búsqueda híbrida en crm_messages (vector + texto)
 */
export async function hybridSearchMessages(
  queryEmbedding: number[],
  queryText: string,
  matchCount: number = 10
): Promise<
  Array<{
    id: string
    content: string
    contact_phone: string
    received_at: string
    combined_score: number
  }>
> {
  const vectorStr = `[${queryEmbedding.join(',')}]`

  const { data, error } = await getCrmSupabase().rpc(
    'hybrid_search_messages',
    {
      query_embedding: vectorStr,
      query_text: queryText,
      scope_filter: null,
      match_count: matchCount,
    }
  )

  if (error) {
    console.error('[crm-client] Error hybrid search:', error.message)
    return []
  }

  return data || []
}

/**
 * Buscar entidad en graph por nombre
 */
export async function searchGraphEntity(
  name: string,
  entityType?: string
): Promise<any | null> {
  const normalized = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  let query = getCrmSupabase()
    .from('graph_entities')
    .select('*')
    .eq('normalized_name', normalized)

  if (entityType) query = query.eq('entity_type', entityType)

  const { data } = await query.limit(1).single()
  return data || null
}

/**
 * Buscar entidades por tipo y scope
 */
export async function queryGraphEntities(
  filters: {
    entity_type?: string
    scope?: string
    limit?: number
  } = {}
): Promise<any[]> {
  let query = getCrmSupabase()
    .from('graph_entities')
    .select('id, entity_type, name, scope, properties, summary, business_relevance, sentiment, last_interaction')

  if (filters.entity_type) query = query.eq('entity_type', filters.entity_type)
  if (filters.scope) query = query.contains('scope', [filters.scope])

  query = query.order('last_interaction', { ascending: false, nullsFirst: false })
  query = query.limit(filters.limit || 20)

  const { data, error } = await query
  if (error) {
    console.error('[crm-client] Error query graph:', error.message)
    return []
  }

  return data || []
}

/**
 * Obtener vecinos de una entidad
 */
export async function getEntityNeighbors(
  entityId: string,
  scope?: string
): Promise<any[]> {
  const { data, error } = await getCrmSupabase().rpc('get_entity_neighbors', {
    p_entity_id: entityId,
    p_scope: scope || null,
  })

  if (error) {
    console.error('[crm-client] Error neighbors:', error.message)
    return []
  }

  return data || []
}

/**
 * Buscar mensajes por teléfono
 */
export async function getMessagesByPhone(
  phone: string,
  limit: number = 20
): Promise<any[]> {
  const { data, error } = await getCrmSupabase()
    .from('crm_messages')
    .select('id, content, direction, message_type, received_at')
    .eq('contact_phone', phone)
    .order('received_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[crm-client] Error messages by phone:', error.message)
    return []
  }

  return data || []
}

/**
 * Actualizar propiedades de una entidad
 */
export async function updateEntityProperties(
  entityId: string,
  properties: Record<string, any>
): Promise<void> {
  const { data: existing } = await getCrmSupabase()
    .from('graph_entities')
    .select('properties')
    .eq('id', entityId)
    .single()

  const merged = { ...(existing?.properties || {}), ...properties }

  const { error } = await getCrmSupabase()
    .from('graph_entities')
    .update({
      properties: merged,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entityId)

  if (error) console.error('[crm-client] Error update entity:', error.message)
}

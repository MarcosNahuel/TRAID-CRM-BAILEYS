import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)

// --- Status de contactos (active / muted / ignored) ---

export type ContactStatus = 'active' | 'muted' | 'ignored'

/**
 * Obtener status de un contacto. Default: 'active' (analiza siempre salvo muted/ignored explícito)
 */
export async function getContactStatus(phone: string): Promise<ContactStatus> {
  const entity = await findEntityByPhone(phone)
  if (!entity) return 'active'
  return (entity.properties?.contact_status as ContactStatus) || 'active'
}

/**
 * Setear status de un contacto (active/muted/ignored)
 */
export async function setContactStatus(phone: string, status: ContactStatus): Promise<boolean> {
  const entity = await findEntityByPhone(phone)
  if (!entity) {
    console.warn(`[graph] No se encontró entidad para phone ${phone}`)
    return false
  }

  const mergedProps = { ...(entity.properties || {}), contact_status: status }

  const { error } = await supabase
    .from('graph_entities')
    .update({
      properties: mergedProps,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entity.id)

  if (error) {
    console.error(`[graph] Error seteando status:`, error.message)
    return false
  }

  console.log(`[graph] Status de ${entity.name} (${phone}) → ${status}`)
  return true
}

export interface EntityInput {
  entity_type: string
  name: string
  scope: string[]
  properties?: Record<string, any>
  summary?: string
  business_relevance?: number
  sentiment?: 'positive' | 'neutral' | 'negative'
  embedding?: number[]
}

export interface LinkInput {
  source_id: string
  target_id: string
  relationship: string
  scope: string[]
  link_type?: string
  confidence?: number
  weight?: number
  properties?: Record<string, any>
}

function normalize(name: string): string {
  return name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * UPSERT entidad por normalized_name + entity_type
 * Si existe, mergea properties y actualiza summary
 */
export async function upsertEntity(input: EntityInput): Promise<string> {
  const normalizedName = normalize(input.name)

  // Buscar existente
  const { data: existing } = await supabase
    .from('graph_entities')
    .select('id, properties, scope')
    .eq('normalized_name', normalizedName)
    .eq('entity_type', input.entity_type)
    .single()

  if (existing) {
    // Mergear properties y scopes
    const mergedProps = { ...(existing.properties || {}), ...(input.properties || {}) }
    const mergedScopes = [...new Set([...(existing.scope || []), ...(input.scope || [])])]

    const updateData: Record<string, any> = {
      properties: mergedProps,
      scope: mergedScopes,
      updated_at: new Date().toISOString(),
    }

    if (input.summary) updateData.summary = input.summary
    if (input.business_relevance !== undefined) updateData.business_relevance = input.business_relevance
    if (input.sentiment) updateData.sentiment = input.sentiment
    if (input.name) updateData.name = input.name // mantener la versión más legible

    if (input.embedding?.length) {
      updateData.embedding = `[${input.embedding.join(',')}]`
    }

    await supabase
      .from('graph_entities')
      .update(updateData)
      .eq('id', existing.id)

    return existing.id
  }

  // Crear nuevo
  const insertData: Record<string, any> = {
    entity_type: input.entity_type,
    name: input.name,
    normalized_name: normalizedName,
    scope: input.scope || [],
    properties: input.properties || {},
    summary: input.summary || null,
    business_relevance: input.business_relevance || 0,
    sentiment: input.sentiment || 'neutral',
    last_interaction: new Date().toISOString(),
  }

  if (input.embedding?.length) {
    insertData.embedding = `[${input.embedding.join(',')}]`
  }

  const { data, error } = await supabase
    .from('graph_entities')
    .insert(insertData)
    .select('id')
    .single()

  if (error) throw new Error(`upsertEntity failed: ${error.message}`)
  return data!.id
}

/**
 * UPSERT link entre dos entidades
 */
export async function upsertLink(input: LinkInput): Promise<string> {
  // Buscar link existente
  const { data: existing } = await supabase
    .from('entity_links')
    .select('id, weight')
    .eq('source_id', input.source_id)
    .eq('target_id', input.target_id)
    .eq('relationship', input.relationship)
    .single()

  if (existing) {
    const mergedScopes = [...new Set([...(input.scope || [])])]
    await supabase
      .from('entity_links')
      .update({
        scope: mergedScopes,
        weight: (existing.weight || 1) + 0.1, // incrementar weight por repetición
        confidence: input.confidence || 1.0,
        properties: input.properties || {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    return existing.id
  }

  const { data, error } = await supabase
    .from('entity_links')
    .insert({
      source_id: input.source_id,
      target_id: input.target_id,
      relationship: input.relationship,
      scope: input.scope || [],
      link_type: input.link_type || 'extracted',
      confidence: input.confidence || 1.0,
      weight: input.weight || 1.0,
      properties: input.properties || {},
    })
    .select('id')
    .single()

  if (error) throw new Error(`upsertLink failed: ${error.message}`)
  return data!.id
}

/**
 * Buscar persona por teléfono
 */
export async function findEntityByPhone(phone: string): Promise<{ id: string; name: string; properties: Record<string, any> } | null> {
  const { data } = await supabase
    .from('graph_entities')
    .select('id, name, properties')
    .eq('entity_type', 'person')
    .contains('properties', { phone })
    .single()

  return data || null
}

/**
 * Buscar entidad por nombre normalizado
 */
export async function findEntityByName(name: string, entityType?: string): Promise<{ id: string; name: string; entity_type: string } | null> {
  const normalizedName = normalize(name)

  let query = supabase
    .from('graph_entities')
    .select('id, name, entity_type')
    .eq('normalized_name', normalizedName)

  if (entityType) query = query.eq('entity_type', entityType)

  const { data } = await query.limit(1).single()
  return data || null
}

/**
 * Actualizar last_interaction e incrementar weight de links
 */
export async function updateEntityInteraction(entityId: string): Promise<void> {
  await supabase
    .from('graph_entities')
    .update({
      last_interaction: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', entityId)
}

/**
 * Obtener vecinos de una entidad (para context enrichment)
 */
export async function getEntityNeighbors(
  entityId: string,
  scope?: string
): Promise<Array<{ id: string; entity_type: string; name: string; relationship: string; direction: string }>> {
  const { data, error } = await supabase.rpc('get_entity_neighbors', {
    p_entity_id: entityId,
    p_scope: scope || null,
  })

  if (error) {
    console.error('[graph] Error getting neighbors:', error.message)
    return []
  }

  return data || []
}

/**
 * Persistir entidades y relaciones extraídas de un mensaje
 */
export async function persistExtractedData(
  senderPhone: string,
  senderName: string,
  extraction: {
    entities?: Array<{ name: string; type: string; scope: string[] }>
    relationships?: Array<{ from: string; to: string; type: string; scope?: string[] }>
    detected_events?: Array<{ title: string; datetime?: string; scope?: string }>
    detected_tasks?: Array<{ title: string; for_person?: string; priority?: string }>
  }
): Promise<void> {
  try {
    // Asegurar que el sender existe como persona
    const senderId = await upsertEntity({
      entity_type: 'person',
      name: senderName,
      scope: [],
      properties: { phone: senderPhone },
    })
    await updateEntityInteraction(senderId)

    // Crear entidades extraídas
    const entityMap = new Map<string, string>() // name → id
    entityMap.set(normalize(senderName), senderId)

    for (const entity of extraction.entities || []) {
      try {
        const id = await upsertEntity({
          entity_type: entity.type,
          name: entity.name,
          scope: entity.scope || [],
        })
        entityMap.set(normalize(entity.name), id)
      } catch (err) {
        console.error(`[graph] Error upserting entity ${entity.name}:`, err)
      }
    }

    // Crear links
    for (const rel of extraction.relationships || []) {
      try {
        const fromId = entityMap.get(normalize(rel.from))
        const toId = entityMap.get(normalize(rel.to))
        if (fromId && toId) {
          await upsertLink({
            source_id: fromId,
            target_id: toId,
            relationship: rel.type,
            scope: rel.scope || [],
          })
        }
      } catch (err) {
        console.error(`[graph] Error upserting link ${rel.from} → ${rel.to}:`, err)
      }
    }

    // Crear eventos detectados
    for (const event of extraction.detected_events || []) {
      try {
        const eventId = await upsertEntity({
          entity_type: 'event',
          name: event.title,
          scope: event.scope ? [event.scope] : [],
          properties: { datetime: event.datetime },
        })
        // Link: sender → evento
        await upsertLink({
          source_id: senderId,
          target_id: eventId,
          relationship: 'mentioned_event',
          scope: event.scope ? [event.scope] : [],
        })
      } catch (err) {
        console.error(`[graph] Error creating event ${event.title}:`, err)
      }
    }

    // Crear tareas detectadas
    for (const task of extraction.detected_tasks || []) {
      try {
        const taskId = await upsertEntity({
          entity_type: 'task',
          name: task.title,
          scope: [],
          properties: {
            for_person: task.for_person,
            priority: task.priority || 'medium',
            status: 'pending',
          },
        })
        await upsertLink({
          source_id: senderId,
          target_id: taskId,
          relationship: 'assigned_task',
          scope: [],
        })
      } catch (err) {
        console.error(`[graph] Error creating task ${task.title}:`, err)
      }
    }
  } catch (err) {
    console.error('[graph] Error en persistExtractedData:', err)
  }
}

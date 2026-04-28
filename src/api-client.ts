import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

// Lazy init: el cliente del CRM legacy solo se necesita en el flujo Baileys
// (upsertLead, logMessage). Si SUPABASE_URL falta (deploy minimal sin CRM),
// el módulo se puede importar sin crash; las funciones lanzan al ser invocadas.
let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (supabase) return supabase
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
    throw new Error(
      '[api-client] SUPABASE_URL y SUPABASE_KEY requeridos para CRM legacy ops',
    )
  }
  supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
  return supabase
}

export async function upsertLead(data: {
  phone: string
  name?: string
  first_message?: string
  source_code?: string
  owner?: string
}) {
  // Verificar si el lead ya existe
  const { data: existing } = await getSupabase()
    .from('crm_leads')
    .select('id')
    .eq('phone', data.phone)
    .single()

  if (existing) {
    if (data.name) {
      await getSupabase()
        .from('crm_leads')
        .update({ name: data.name })
        .eq('phone', data.phone)
    }
    return existing
  }

  const { data: newLead, error } = await getSupabase()
    .from('crm_leads')
    .insert({
      phone: data.phone,
      name: data.name || null,
      first_message: data.first_message || null,
      source_code: data.source_code || null,
      owner: data.owner || 'nahuel',
    })
    .select()
    .single()

  if (error) throw new Error(`upsertLead failed: ${error.message}`)
  return newLead
}

export async function logMessage(data: {
  contact_phone: string
  direction?: string
  message_type?: string
  content?: string
  media_url?: string
  has_source_code?: boolean
  wa_message_id?: string
  transcription_failed?: boolean
}) {
  // Buscar lead_id por phone
  const { data: lead } = await getSupabase()
    .from('crm_leads')
    .select('id')
    .eq('phone', data.contact_phone)
    .single()

  const { error } = await getSupabase()
    .from('crm_messages')
    .insert({
      lead_id: lead?.id || null,
      contact_phone: data.contact_phone,
      direction: data.direction || 'inbound',
      message_type: data.message_type || 'text',
      content: data.content || null,
      media_url: data.media_url || null,
      has_source_code: data.has_source_code || false,
      wa_message_id: data.wa_message_id || null,
      transcription_failed: data.transcription_failed || false,
    })

  if (error) throw new Error(`logMessage failed: ${error.message}`)
}

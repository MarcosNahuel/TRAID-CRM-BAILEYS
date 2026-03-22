import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)

export async function upsertLead(data: {
  phone: string
  name?: string
  first_message?: string
  source_code?: string
  owner?: string
}) {
  // Verificar si el lead ya existe
  const { data: existing } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('phone', data.phone)
    .single()

  if (existing) {
    // Actualizar nombre si cambió
    if (data.name) {
      await supabase
        .from('crm_leads')
        .update({ name: data.name })
        .eq('phone', data.phone)
    }
    return existing
  }

  // Crear nuevo lead
  const { data: newLead, error } = await supabase
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
}) {
  const { error } = await supabase
    .from('crm_messages')
    .insert({
      contact_phone: data.contact_phone,
      direction: data.direction || 'inbound',
      message_type: data.message_type || 'text',
      content: data.content || null,
      media_url: data.media_url || null,
      has_source_code: data.has_source_code || false,
    })

  if (error) throw new Error(`logMessage failed: ${error.message}`)
}

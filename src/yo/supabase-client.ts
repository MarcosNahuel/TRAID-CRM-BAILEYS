/**
 * Cliente Supabase para sistema yo (separate del CRM existente).
 * Apunta al project Supabase nuevo dedicado al sistema yo.
 * Schema: yo
 */

import { createClient } from '@supabase/supabase-js'
import { CONFIG } from '../config.js'
import type {
  YoContact,
  YoTask,
  InsertTaskInput,
} from './types.js'

function createYoClient() {
  return createClient(CONFIG.YO_SUPABASE_URL, CONFIG.YO_SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'yo' },
  })
}

type YoClient = ReturnType<typeof createYoClient>

let client: YoClient | null = null

export function getYoSupabase(): YoClient {
  if (client) return client
  if (!CONFIG.YO_SUPABASE_URL || !CONFIG.YO_SUPABASE_SERVICE_KEY) {
    throw new Error(
      'YO_SUPABASE_URL y YO_SUPABASE_SERVICE_KEY deben estar configurados'
    )
  }
  client = createYoClient()
  return client
}

export async function lookupContactByWaId(
  waId: string
): Promise<YoContact | null> {
  const { data, error } = await getYoSupabase()
    .from('contacts')
    .select('*')
    .eq('whatsapp_number', waId)
    .maybeSingle()
  if (error) {
    console.error('[yo/supabase] lookupContact error:', error.message)
    return null
  }
  return (data as YoContact) || null
}

export async function ensureContact(
  waId: string,
  defaults: Partial<YoContact> = {}
): Promise<YoContact> {
  const existing = await lookupContactByWaId(waId)
  if (existing) return existing
  const { data, error } = await getYoSupabase()
    .from('contacts')
    .insert({
      whatsapp_number: waId,
      kind: defaults.kind ?? 'unknown',
      name: defaults.name ?? null,
      requires_llm_classification: defaults.requires_llm_classification ?? false,
      notes: defaults.notes ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`ensureContact failed: ${error.message}`)
  return data as YoContact
}

export async function listProjectsForContact(
  contactId: string
): Promise<string[]> {
  const { data, error } = await getYoSupabase()
    .from('contact_projects')
    .select('project_slug')
    .eq('contact_id', contactId)
  if (error) {
    console.error('[yo/supabase] listProjects error:', error.message)
    return []
  }
  return (data || []).map((r: { project_slug: string }) => r.project_slug)
}

export async function insertTask(input: InsertTaskInput): Promise<YoTask> {
  const { data, error } = await getYoSupabase()
    .from('tasks')
    .insert({
      project_slug: input.project_slug,
      content_md: input.content_md,
      source: input.source,
      priority: input.priority ?? 'medium',
      task_type: input.task_type ?? null,
      due_at: input.due_at ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      tags: input.tags ?? [],
      classification_confidence: input.classification_confidence ?? null,
      assigned_to: input.assigned_to ?? null,
      created_by_contact_id: input.created_by_contact_id ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single()
  if (error) throw new Error(`insertTask failed: ${error.message}`)
  return data as YoTask
}

export async function checkGroupMuted(groupId: string): Promise<boolean> {
  const { data } = await getYoSupabase()
    .from('groups')
    .select('muted')
    .eq('id', groupId)
    .maybeSingle()
  return (data as { muted?: boolean } | null)?.muted === true
}

export async function listTasks(opts: {
  project?: string
  status?: YoTask['status']
  assignedTo?: string
  limit?: number
} = {}): Promise<YoTask[]> {
  let q = getYoSupabase()
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20)
  if (opts.project) q = q.eq('project_slug', opts.project)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.assignedTo) q = q.eq('assigned_to', opts.assignedTo)
  const { data, error } = await q
  if (error) throw new Error(`listTasks failed: ${error.message}`)
  return (data || []) as YoTask[]
}

export async function closeTask(
  id: string,
  resolution?: string
): Promise<YoTask> {
  const update: Record<string, unknown> = {
    status: 'done',
    closed_at: new Date().toISOString(),
  }
  if (resolution) update.metadata = { resolution }
  const { data, error } = await getYoSupabase()
    .from('tasks')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`closeTask failed: ${error.message}`)
  return data as YoTask
}

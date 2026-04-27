/**
 * Pipeline orquestador del sistema yo.
 * Lookup contacto → mute/is_personal check → classify multimodal → INSERT task + audit.
 */

import type { PipelineDeps, YoTask, InsertTaskInput } from './types.js'
import { recordClassification } from './audit.js'
import { getYoSupabase } from './supabase-client.js'

export interface IncomingForYo {
  waId: string
  content: string
  source: YoTask['source']
  audioBase64?: string
  audioMimeType?: string
  groupId?: string
}

export interface ProcessOpts {
  confidenceThreshold?: number
  activeProjects?: string[]
}

export type SkippedResult = { skipped: true; reason: 'contact_is_personal' | 'group_muted' }
export type ProcessResult = YoTask | SkippedResult

const CONF_HIGH = 0.8

export async function processIncomingForYo(
  msg: IncomingForYo,
  deps: PipelineDeps,
  opts: ProcessOpts = {},
): Promise<ProcessResult> {
  const contact = await deps.ensureContact(msg.waId, { kind: 'unknown' })

  // Skip: contacto personal del teléfono
  if (contact.is_personal === true) {
    console.log(`[yo/pipeline] contact ${contact.id} is_personal — skip`)
    return { skipped: true, reason: 'contact_is_personal' }
  }

  // Skip: grupo silenciado
  if (msg.groupId) {
    const groupMuted = deps.checkGroupMuted
      ? await deps.checkGroupMuted(msg.groupId)
      : await checkGroupMutedDirect(msg.groupId)
    if (groupMuted) {
      console.log(`[yo/pipeline] group ${msg.groupId} muted — skip`)
      return { skipped: true, reason: 'group_muted' }
    }
  }

  const projects = await deps.listProjectsForContact(contact.id)
  const metadata: Record<string, unknown> = { wa_id: msg.waId }
  let project_slug: string | null = null

  if (!contact.requires_llm_classification) {
    if (projects.length === 1) {
      project_slug = projects[0]
    } else if (projects.length > 1) {
      metadata.untriaged_reason = 'multiple_projects_no_llm'
      metadata.candidate_projects = projects
    } else {
      metadata.untriaged_reason = 'unknown_contact'
    }

    const input: InsertTaskInput = {
      project_slug,
      content_md: msg.content,
      source: msg.source,
      created_by_contact_id: contact.id,
      metadata,
    }
    return deps.insertTask(input)
  }

  // LLM classify path
  const candidates = projects.length ? projects : (opts.activeProjects ?? [])
  const t0 = Date.now()
  let classifyError: string | null = null
  let classifyResult = await (async () => {
    try {
      return await deps.classify({
        text: msg.content || undefined,
        audioBase64: msg.audioBase64,
        audioMimeType: msg.audioMimeType,
        candidates,
      })
    } catch (err) {
      classifyError = (err as Error).message
      return { project_slug: 'personal' as string | null, confidence: 0 }
    }
  })()
  const latency_ms = Date.now() - t0

  // Threshold: ≥0.8 → asignar; <0.8 → personal
  if (
    classifyResult.project_slug &&
    classifyResult.project_slug !== 'personal' &&
    classifyResult.confidence >= CONF_HIGH
  ) {
    project_slug = classifyResult.project_slug
  } else {
    project_slug = 'personal'
  }

  metadata.classification = {
    model: 'gemini-2.5-flash',
    candidates,
    decision_slug: classifyResult.project_slug,
    confidence: classifyResult.confidence,
    fallback: project_slug === 'personal' ? 'personal' : null,
    latency_ms,
  }

  const input: InsertTaskInput = {
    project_slug,
    content_md: msg.audioBase64 ? (msg.content || '[audio]') : msg.content,
    source: msg.source,
    priority: ('priority' in classifyResult ? classifyResult.priority : undefined) ?? 'medium',
    task_type: ('task_type' in classifyResult ? classifyResult.task_type : undefined) ?? 'task',
    due_at: ('due_at' in classifyResult ? classifyResult.due_at : undefined) ?? null,
    estimated_minutes: ('estimated_minutes' in classifyResult ? classifyResult.estimated_minutes : undefined) ?? null,
    tags: ('tags' in classifyResult ? classifyResult.tags : undefined) ?? [],
    classification_confidence: classifyResult.confidence,
    created_by_contact_id: contact.id,
    metadata,
  }
  const task = await deps.insertTask(input)

  // Audit row — fail-safe
  try {
    await recordClassification(getYoSupabase(), {
      task_id: task.id,
      contact_id: contact.id,
      source: msg.audioBase64 ? 'whatsapp_audio' : 'whatsapp_text',
      input_excerpt: (msg.content || '').slice(0, 500),
      candidates,
      model: 'gemini-2.5-flash',
      decision_slug: classifyResult.project_slug,
      confidence: classifyResult.confidence,
      fallback_used: project_slug === 'personal' ? 'personal' : null,
      latency_ms,
      error: classifyError,
    })
  } catch (err) {
    console.error('[yo/pipeline] audit failed:', (err as Error).message)
  }

  return task
}

async function checkGroupMutedDirect(groupId: string): Promise<boolean> {
  try {
    const { data } = await getYoSupabase()
      .from('groups')
      .select('muted')
      .eq('id', groupId)
      .maybeSingle()
    return (data as { muted?: boolean } | null)?.muted === true
  } catch {
    return false
  }
}

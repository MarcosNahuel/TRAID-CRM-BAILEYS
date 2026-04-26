/**
 * Pipeline orquestador del sistema yo.
 * Lookup contacto → regla simple → LLM si flag → INSERT task.
 * Plan: D:/Proyectos/CONOCIMIENTO-NAHUEL/plan/26-04/sistema-yo-session-1-plan.md (Task 5)
 */

import type {
  PipelineDeps,
  YoTask,
  InsertTaskInput,
} from './types.js'

export interface IncomingForYo {
  waId: string
  content: string
  source: YoTask['source']
}

export interface ProcessOpts {
  confidenceThreshold?: number
  activeProjects?: string[]
}

export async function processIncomingForYo(
  msg: IncomingForYo,
  deps: PipelineDeps,
  opts: ProcessOpts = {}
): Promise<YoTask> {
  const threshold = opts.confidenceThreshold ?? 0.8

  const contact = await deps.ensureContact(msg.waId, { kind: 'unknown' })
  const projects = await deps.listProjectsForContact(contact.id)

  let project_slug: string | null = null
  const metadata: Record<string, unknown> = { wa_id: msg.waId }

  if (!contact.requires_llm_classification) {
    if (projects.length === 1) {
      project_slug = projects[0]
    } else if (projects.length > 1) {
      metadata.untriaged_reason = 'multiple_projects_no_llm'
      metadata.candidate_projects = projects
    } else {
      metadata.untriaged_reason = 'unknown_contact'
    }
  } else {
    const candidates = projects.length
      ? projects
      : opts.activeProjects ?? []
    const result = await deps.classify(msg.content, candidates)
    metadata.classification_attempt = {
      project_slug: result.project_slug,
      confidence: result.confidence,
    }
    if (result.project_slug && result.confidence >= threshold) {
      project_slug = result.project_slug
    } else {
      metadata.untriaged_reason = 'llm_low_confidence'
    }
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

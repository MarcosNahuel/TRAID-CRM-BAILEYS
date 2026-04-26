/**
 * Sistema yo — types compartidos
 * Plan: D:/Proyectos/CONOCIMIENTO-NAHUEL/plan/26-04/sistema-yo-session-1-plan.md
 */

export interface YoContact {
  id: string
  whatsapp_number: string
  name: string | null
  kind: 'client' | 'internal' | 'unknown'
  requires_llm_classification: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface YoTask {
  id: string
  project_slug: string | null
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  source: 'whatsapp' | 'manual' | 'claude' | 'nacho' | 'intent'
  content_md: string
  created_by_contact_id: string | null
  assigned_to: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface ClassifyResult {
  project_slug: string | null
  confidence: number
  raw?: unknown
}

export interface InsertTaskInput {
  project_slug: string | null
  content_md: string
  source: YoTask['source']
  priority?: YoTask['priority']
  assigned_to?: string | null
  created_by_contact_id?: string | null
  metadata?: Record<string, unknown>
}

export interface PipelineDeps {
  lookupContact: (waId: string) => Promise<YoContact | null>
  ensureContact: (waId: string, defaults?: Partial<YoContact>) => Promise<YoContact>
  listProjectsForContact: (contactId: string) => Promise<string[]>
  insertTask: (input: InsertTaskInput) => Promise<YoTask>
  classify: (text: string, candidates: string[]) => Promise<ClassifyResult>
}

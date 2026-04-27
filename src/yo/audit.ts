// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export interface ClassificationAuditRow {
  task_id?: string | null
  contact_id?: string | null
  source: 'whatsapp_text' | 'whatsapp_audio' | 'manual'
  input_excerpt?: string | null
  candidates: string[]
  model: string
  decision_slug?: string | null
  confidence?: number | null
  fallback_used?: 'personal' | 'untriaged' | null
  latency_ms?: number | null
  error?: string | null
}

export async function recordClassification(
  client: AnySupabaseClient,
  row: ClassificationAuditRow,
): Promise<void> {
  try {
    const { error } = await client
      .schema('yo' as never)
      .from('classification_audit')
      .insert({
        task_id: row.task_id ?? null,
        contact_id: row.contact_id ?? null,
        source: row.source,
        input_excerpt: (row.input_excerpt ?? '').slice(0, 500),
        candidates: row.candidates ?? [],
        model: row.model,
        decision_slug: row.decision_slug ?? null,
        confidence: row.confidence ?? null,
        fallback_used: row.fallback_used ?? null,
        latency_ms: row.latency_ms ?? null,
        error: row.error ?? null,
      } as never)
    if (error) console.error('[yo/audit] insert failed:', error.message)
  } catch (err) {
    console.error('[yo/audit] exception:', (err as Error).message)
  }
}

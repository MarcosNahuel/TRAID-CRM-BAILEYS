import { describe, it, expect, vi } from 'vitest'
import { processIncomingForYo } from './pipeline.js'
import type { PipelineDeps, YoContact, YoTask } from './types.js'

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const defaultContact: YoContact = {
    id: 'c-1',
    whatsapp_number: '5491111',
    name: null,
    kind: 'unknown',
    requires_llm_classification: false,
    is_personal: false,
    notes: null,
    created_at: '',
    updated_at: '',
  }
  return {
    lookupContact: vi.fn(),
    ensureContact: vi.fn().mockResolvedValue(defaultContact),
    listProjectsForContact: vi.fn().mockResolvedValue([]),
    insertTask: vi.fn().mockImplementation(async (input) => ({
      id: 't-1',
      project_slug: input.project_slug,
      content_md: input.content_md,
      source: input.source,
      status: 'pending',
      priority: input.priority ?? 'medium',
      assigned_to: input.assigned_to ?? null,
      created_by_contact_id: input.created_by_contact_id ?? null,
      metadata: input.metadata ?? {},
      created_at: '',
      updated_at: '',
      closed_at: null,
    } as YoTask)),
    classify: vi.fn().mockResolvedValue({
      project_slug: null,
      confidence: 0,
    }),
    ...overrides,
  }
}

describe('yo/pipeline.processIncomingForYo', () => {
  it('1 proyecto sin LLM → asigna directo', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue(['diego-erp']),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'hola', source: 'whatsapp' },
      deps
    )
    const t = result as YoTask
    expect(t.project_slug).toBe('diego-erp')
    expect(deps.classify).not.toHaveBeenCalled()
  })

  it('N proyectos sin LLM → untriaged con candidates', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue(['a', 'b']),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'hola', source: 'whatsapp' },
      deps
    )
    const t = result as YoTask
    expect(t.project_slug).toBeNull()
    expect(t.metadata.untriaged_reason).toBe('multiple_projects_no_llm')
    expect(t.metadata.candidate_projects).toEqual(['a', 'b'])
  })

  it('contacto desconocido sin proyectos → untriaged', async () => {
    const deps = makeDeps()
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'hola', source: 'whatsapp' },
      deps
    )
    const t = result as YoTask
    expect(t.project_slug).toBeNull()
    expect(t.metadata.untriaged_reason).toBe('unknown_contact')
  })

  it('skip cuando is_personal=true', async () => {
    const deps = makeDeps({
      ensureContact: vi.fn().mockResolvedValue({
        id: 'c-1', whatsapp_number: '5491111', name: null,
        kind: 'unknown', requires_llm_classification: false,
        is_personal: true, notes: null, created_at: '', updated_at: '',
      } as YoContact),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'hola', source: 'whatsapp' },
      deps
    )
    expect(result).toEqual({ skipped: true, reason: 'contact_is_personal' })
    expect(deps.classify).not.toHaveBeenCalled()
  })

  it('flag LLM activo + confidence alta → asigna sugerido', async () => {
    const deps = makeDeps({
      ensureContact: vi.fn().mockResolvedValue({
        id: 'c-1', whatsapp_number: '5491111', name: 'Nahuel',
        kind: 'internal', requires_llm_classification: true,
        is_personal: false, notes: null, created_at: '', updated_at: '',
      } as YoContact),
      listProjectsForContact: vi.fn().mockResolvedValue([]),
      classify: vi.fn().mockResolvedValue({
        project_slug: 'super-yo',
        confidence: 0.92,
      }),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'agregar tool nueva en super-yo', source: 'whatsapp' },
      deps,
      { activeProjects: ['super-yo', 'diego-erp'] }
    )
    const t = result as YoTask
    expect(t.project_slug).toBe('super-yo')
    expect((t.metadata.classification as { confidence: number }).confidence).toBe(0.92)
  })

  it('flag LLM activo + confidence baja → asigna a personal', async () => {
    const deps = makeDeps({
      ensureContact: vi.fn().mockResolvedValue({
        id: 'c-1', whatsapp_number: '5491111', name: 'Nahuel',
        kind: 'internal', requires_llm_classification: true,
        is_personal: false, notes: null, created_at: '', updated_at: '',
      } as YoContact),
      classify: vi.fn().mockResolvedValue({
        project_slug: 'a',
        confidence: 0.3,
      }),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'qué onda', source: 'whatsapp' },
      deps,
      { activeProjects: ['a', 'b'] }
    )
    const t = result as YoTask
    expect(t.project_slug).toBe('personal')
    expect((t.metadata.classification as { fallback: string }).fallback).toBe('personal')
  })
})

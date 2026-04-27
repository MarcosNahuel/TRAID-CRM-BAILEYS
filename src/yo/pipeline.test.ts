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
      project_slug: 'personal',
      confidence: 0.2,
      priority: 'medium',
      task_type: 'task',
      tags: [],
    }),
    ...overrides,
  }
}

describe('yo/pipeline.processIncomingForYo — siempre clasifica', () => {
  it('skip cuando is_personal=true (antes de clasificar)', async () => {
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

  it('skip cuando grupo muted', async () => {
    const deps = makeDeps({
      checkGroupMuted: vi.fn().mockResolvedValue(true),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'hola', source: 'whatsapp', groupId: 'g-1' },
      deps
    )
    expect(result).toEqual({ skipped: true, reason: 'group_muted' })
    expect(deps.classify).not.toHaveBeenCalled()
  })

  it('1 proyecto asignado → classify llamado, alta confianza → asigna proyecto', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue(['diego-erp']),
      classify: vi.fn().mockResolvedValue({
        project_slug: 'diego-erp',
        confidence: 0.92,
        priority: 'high',
        task_type: 'task',
        tags: ['factura'],
      }),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'necesito la factura del mes', source: 'whatsapp' },
      deps
    )
    const t = result as YoTask
    expect(t.project_slug).toBe('diego-erp')
    expect(deps.classify).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: ['diego-erp'] })
    )
    expect(t.priority).toBe('high')
    expect(t.metadata.classification).toMatchObject({
      model: 'gemini-3.1-flash-lite-preview',
      confidence: 0.92,
    })
  })

  it('múltiples proyectos, confidence alta → asigna el sugerido', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue(['a', 'b', 'c']),
      classify: vi.fn().mockResolvedValue({
        project_slug: 'b',
        confidence: 0.88,
        priority: 'medium',
        task_type: 'task',
        tags: [],
      }),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'update en proyecto b', source: 'whatsapp' },
      deps
    )
    const t = result as YoTask
    expect(t.project_slug).toBe('b')
    expect(deps.classify).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: ['a', 'b', 'c'] })
    )
  })

  it('confidence baja → project_slug = personal (inbox)', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue(['super-yo']),
      classify: vi.fn().mockResolvedValue({
        project_slug: 'super-yo',
        confidence: 0.3,
        priority: 'low',
        task_type: 'info',
        tags: [],
      }),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'qué onda', source: 'whatsapp' },
      deps
    )
    const t = result as YoTask
    expect(t.project_slug).toBe('personal')
    expect((t.metadata.classification as { fallback: string }).fallback).toBe('personal')
  })

  it('sin proyectos asignados → usa activeProjects como candidates', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue([]),
      classify: vi.fn().mockResolvedValue({
        project_slug: 'traid-crm',
        confidence: 0.95,
        priority: 'urgent',
        task_type: 'blocker',
        tags: ['crm', 'urgente'],
      }),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'traid-crm está caído', source: 'whatsapp' },
      deps,
      { activeProjects: ['traid-crm', 'traid-erp'] }
    )
    const t = result as YoTask
    expect(t.project_slug).toBe('traid-crm')
    expect(deps.classify).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: ['traid-crm', 'traid-erp'] })
    )
  })

  it('mensaje de grupo → pasa group_candidates al clasificador', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue(['super-yo']),
      classify: vi.fn().mockResolvedValue({
        project_slug: 'super-yo',
        group_slug: 'g-abc',
        confidence: 0.9,
        priority: 'medium',
        task_type: 'task',
        tags: [],
      }),
      checkGroupMuted: vi.fn().mockResolvedValue(false),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'aviso del grupo', source: 'whatsapp', groupId: 'g-abc' },
      deps
    )
    const t = result as YoTask
    expect(deps.classify).toHaveBeenCalledWith(
      expect.objectContaining({ group_candidates: ['g-abc'] })
    )
    expect((t.metadata.classification as { group_slug: string }).group_slug).toBe('g-abc')
  })

  it('classify falla → fallback graceful sin crash', async () => {
    const deps = makeDeps({
      listProjectsForContact: vi.fn().mockResolvedValue(['super-yo']),
      classify: vi.fn().mockRejectedValue(new Error('Vertex timeout')),
    })
    const result = await processIncomingForYo(
      { waId: '5491111', content: 'hola', source: 'whatsapp' },
      deps
    )
    const t = result as YoTask
    // Con 1 candidato y error, fallback = ese candidato
    expect(t.project_slug).toBe('super-yo')
    expect((t.metadata.classification as { error: string }).error).toMatch(/Vertex timeout/)
  })
})

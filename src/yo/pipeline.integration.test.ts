/**
 * E2E integration test del pipeline yo.
 * Real Supabase. Mock classify (Vertex se testea separado).
 * Run con: YO_INTEGRATION=true npx vitest run src/yo/pipeline.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { processIncomingForYo } from './pipeline.js'
import type { ProcessResult } from './pipeline.js'
import {
  ensureContact,
  listProjectsForContact,
  insertTask,
  lookupContactByWaId,
  listTasks,
  closeTask,
  getYoSupabase,
} from './supabase-client.js'

const RUN_INTEGRATION = process.env.YO_INTEGRATION === 'true'
const TEST_WA_INTERNAL = '5499900000001' // contacto interno con flag LLM
const TEST_WA_CLIENT_1PROJ = '5499900000002' // cliente 1 proyecto
const TEST_WA_CLIENT_NPROJ = '5499900000003' // cliente N proyectos
const TEST_WA_UNKNOWN = '5499900000004' // sin contacto pre-existente
const TEST_WA_PERSONAL = '5499900000005' // contacto personal (is_personal=true)

describe.runIf(RUN_INTEGRATION)('yo/pipeline (E2E con Supabase real)', () => {
  beforeAll(async () => {
    const sb = getYoSupabase()
    // Sembrar contactos de prueba
    await ensureContact(TEST_WA_INTERNAL, {
      kind: 'internal',
      name: 'Test Nahuel',
      requires_llm_classification: true,
    })
    await sb
      .from('contacts')
      .update({ requires_llm_classification: true, kind: 'internal' })
      .eq('whatsapp_number', TEST_WA_INTERNAL)

    const client1 = await ensureContact(TEST_WA_CLIENT_1PROJ, {
      kind: 'client',
      name: 'Test Client 1Proj',
    })
    const clientN = await ensureContact(TEST_WA_CLIENT_NPROJ, {
      kind: 'client',
      name: 'Test Client NProj',
    })

    // Contacto personal para test mute
    await ensureContact(TEST_WA_PERSONAL, { kind: 'unknown', name: 'Test Personal' })
    await sb
      .from('contacts')
      .update({ is_personal: true })
      .eq('whatsapp_number', TEST_WA_PERSONAL)

    await sb.from('contact_projects').upsert([
      { contact_id: client1.id, project_slug: 'test-1proj' },
      { contact_id: clientN.id, project_slug: 'test-a' },
      { contact_id: clientN.id, project_slug: 'test-b' },
    ])
  })

  afterAll(async () => {
    const sb = getYoSupabase()
    for (const wa of [TEST_WA_INTERNAL, TEST_WA_CLIENT_1PROJ, TEST_WA_CLIENT_NPROJ, TEST_WA_UNKNOWN, TEST_WA_PERSONAL]) {
      const c = await lookupContactByWaId(wa)
      if (c) {
        await sb.from('tasks').delete().eq('created_by_contact_id', c.id)
        await sb.from('contacts').delete().eq('id', c.id)
      }
    }
  })

  const deps = {
    lookupContact: lookupContactByWaId,
    ensureContact,
    listProjectsForContact,
    insertTask,
    classify: vi.fn(),
  }

  it('cliente 1 proyecto sin LLM → asigna directo a ese proyecto', async () => {
    const result = await processIncomingForYo(
      { waId: TEST_WA_CLIENT_1PROJ, content: 'hola, consulta del proyecto', source: 'whatsapp' },
      deps
    )
    expect('skipped' in result).toBe(false)
    const t = result as import('./types.js').YoTask
    expect(t.project_slug).toBe('test-1proj')
    expect(t.source).toBe('whatsapp')
    expect(t.status).toBe('pending')
  })

  it('cliente N proyectos sin LLM → untriaged con candidates', async () => {
    const result = await processIncomingForYo(
      { waId: TEST_WA_CLIENT_NPROJ, content: 'hola', source: 'whatsapp' },
      deps
    )
    expect('skipped' in result).toBe(false)
    const t = result as import('./types.js').YoTask
    expect(t.project_slug).toBeNull()
    expect(t.metadata.untriaged_reason).toBe('multiple_projects_no_llm')
    expect(t.metadata.candidate_projects).toEqual(
      expect.arrayContaining(['test-a', 'test-b'])
    )
  })

  it('contacto desconocido → untriaged unknown_contact + crea contacto', async () => {
    const result = await processIncomingForYo(
      { waId: TEST_WA_UNKNOWN, content: 'mensaje desde wa nuevo', source: 'whatsapp' },
      deps
    )
    expect('skipped' in result).toBe(false)
    const t = result as import('./types.js').YoTask
    expect(t.project_slug).toBeNull()
    expect(t.metadata.untriaged_reason).toBe('unknown_contact')
    const c = await lookupContactByWaId(TEST_WA_UNKNOWN)
    expect(c).not.toBeNull()
    expect(c!.kind).toBe('unknown')
  })

  it('contacto interno con flag LLM + classifier mock alta confidence', async () => {
    deps.classify = vi.fn().mockResolvedValue({
      project_slug: 'super-yo',
      confidence: 0.95,
      priority: 'medium',
      task_type: 'task',
      tags: [],
    })
    const result = await processIncomingForYo(
      {
        waId: TEST_WA_INTERNAL,
        content: 'agregar tool nueva en super-yo agent',
        source: 'whatsapp',
      },
      deps,
      { activeProjects: ['super-yo', 'diego-erp', 'conocimiento-nahuel'] }
    )
    expect('skipped' in result).toBe(false)
    const t = result as import('./types.js').YoTask
    expect(t.project_slug).toBe('super-yo')
    expect(deps.classify).toHaveBeenCalledTimes(1)
  })

  it('skip cuando contact is_personal=true', async () => {
    deps.classify = vi.fn()
    const result = await processIncomingForYo(
      { waId: TEST_WA_PERSONAL, content: 'mensaje personal', source: 'whatsapp' },
      deps,
    )
    expect(result).toEqual({ skipped: true, reason: 'contact_is_personal' })
    expect(deps.classify).not.toHaveBeenCalled()
  })

  it('classifier mock audio → task con source whatsapp + audit row', async () => {
    deps.classify = vi.fn().mockResolvedValue({
      project_slug: 'personal',
      confidence: 0.3,
      priority: 'low',
      task_type: 'info',
      tags: [],
    })
    const sb = getYoSupabase()
    const countBefore = await sb.from('classification_audit').select('id', { count: 'exact', head: true })
    const result = await processIncomingForYo(
      {
        waId: TEST_WA_INTERNAL,
        content: '',
        source: 'whatsapp',
        audioBase64: 'dGVzdA==', // base64 de 'test'
        audioMimeType: 'audio/ogg',
      },
      deps,
      { activeProjects: ['super-yo'] },
    )
    expect('skipped' in result).toBe(false)
    const t = result as import('./types.js').YoTask
    expect(t.project_slug).toBe('personal')
    const countAfter = await sb.from('classification_audit').select('id', { count: 'exact', head: true })
    expect((countAfter.count ?? 0)).toBeGreaterThan(countBefore.count ?? 0)
  })

  it('listTasks ve las tasks creadas, closeTask las cierra', async () => {
    const tasks = await listTasks({ status: 'pending', limit: 50 })
    const ours = tasks.filter((t) =>
      ['test-1proj', null].includes(t.project_slug ?? null) ||
      (t.metadata.untriaged_reason !== undefined)
    )
    expect(ours.length).toBeGreaterThan(0)

    const toClose = ours[0]
    const closed = await closeTask(toClose.id, 'verified by integration test')
    expect(closed.status).toBe('done')
    expect(closed.closed_at).toBeTruthy()
    expect((closed.metadata as { resolution?: string }).resolution).toBe(
      'verified by integration test'
    )
  })
})

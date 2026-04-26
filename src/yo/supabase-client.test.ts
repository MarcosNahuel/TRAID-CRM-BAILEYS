import { describe, it, expect } from 'vitest'
import {
  ensureContact,
  insertTask,
  listTasks,
  closeTask,
  lookupContactByWaId,
} from './supabase-client.js'

const RUN_INTEGRATION = process.env.YO_INTEGRATION === 'true'

describe.runIf(RUN_INTEGRATION)('yo/supabase-client (integration)', () => {
  const TEST_WA = '5499999999998'

  it('ensureContact crea contacto si no existe y lo retorna si existe', async () => {
    const c1 = await ensureContact(TEST_WA, { kind: 'internal', name: 'Test Suite' })
    expect(c1.whatsapp_number).toBe(TEST_WA)
    expect(c1.id).toBeDefined()
    const c2 = await ensureContact(TEST_WA)
    expect(c2.id).toBe(c1.id)
  })

  it('insertTask + listTasks + closeTask roundtrip', async () => {
    const t = await insertTask({
      project_slug: 'test-project-yo',
      content_md: '## Test task\n- Probar pipeline\n',
      source: 'manual',
    })
    expect(t.status).toBe('pending')
    expect(t.priority).toBe('medium')

    const list = await listTasks({ project: 'test-project-yo', limit: 5 })
    expect(list.find((x) => x.id === t.id)).toBeTruthy()

    const closed = await closeTask(t.id, 'verified')
    expect(closed.status).toBe('done')
    expect(closed.closed_at).toBeTruthy()
  })

  it('lookupContactByWaId retorna null para wa inexistente', async () => {
    const c = await lookupContactByWaId('5499999999997')
    expect(c).toBeNull()
  })
})

import { NextResponse } from 'next/server'
import { sql } from '@/lib/supabase/client'

export async function GET() {
  try {
    const tasks = await sql<any>(
      `SELECT id, name, scope, properties, created_at
       FROM graph_entities
       WHERE entity_type = 'task' AND (properties->>'status') = 'pending'
       ORDER BY created_at DESC
       LIMIT 20`
    )

    const events = await sql<any>(
      `SELECT id, name, scope, properties, created_at
       FROM graph_entities
       WHERE entity_type = 'event'
       ORDER BY created_at DESC
       LIMIT 20`
    )

    const commitments = await sql<any>(
      `SELECT id, name, scope, properties, created_at
       FROM graph_entities
       WHERE entity_type IN ('commitment', 'reminder')
       ORDER BY created_at DESC
       LIMIT 20`
    )

    return NextResponse.json({ tasks, events, commitments })
  } catch (error) {
    console.error('[/api/crm/daily]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

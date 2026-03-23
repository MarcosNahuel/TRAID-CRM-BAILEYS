import { NextResponse } from 'next/server'
import { sql } from '@/lib/supabase/client'

export async function GET() {
  try {
    const triggers = await sql<any>(
      `SELECT id, name, scope, properties, summary, created_at
       FROM graph_entities
       WHERE entity_type = 'emotional_trigger'
       ORDER BY created_at DESC
       LIMIT 30`
    )

    const growthLogs = await sql<any>(
      `SELECT id, name, scope, properties, summary, created_at
       FROM graph_entities
       WHERE entity_type = 'growth_log'
       ORDER BY created_at DESC
       LIMIT 30`
    )

    const principles = await sql<any>(
      `SELECT id, name, scope, properties, summary, created_at
       FROM graph_entities
       WHERE entity_type = 'principle'
       ORDER BY created_at DESC
       LIMIT 30`
    )

    const decisions = await sql<any>(
      `SELECT id, name, scope, properties, summary, created_at
       FROM graph_entities
       WHERE entity_type = 'decision'
       ORDER BY created_at DESC
       LIMIT 20`
    )

    return NextResponse.json({ triggers, growthLogs, principles, decisions })
  } catch (error) {
    console.error('[/api/crm/growth]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

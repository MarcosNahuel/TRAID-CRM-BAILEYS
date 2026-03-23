import { NextResponse } from 'next/server'
import { sql, esc } from '@/lib/supabase/client'

export async function GET() {
  try {
    const principles = await sql<any>(
      `SELECT id, name, properties, summary
       FROM graph_entities
       WHERE entity_type = 'principle'
       ORDER BY created_at DESC`
    )

    const stats = await sql<{ entity_type: string; count: number }>(
      `SELECT entity_type, COUNT(*)::int as count
       FROM graph_entities
       GROUP BY entity_type
       ORDER BY count DESC`
    )

    const linkCount = await sql<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM entity_links`
    )

    return NextResponse.json({
      principles,
      stats,
      totalLinks: linkCount[0]?.count ?? 0,
    })
  } catch (error) {
    console.error('[/api/crm/settings]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

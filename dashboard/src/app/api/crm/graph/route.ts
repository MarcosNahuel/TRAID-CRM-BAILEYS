import { NextResponse } from 'next/server'
import { sql, esc } from '@/lib/supabase/client'

interface GraphEntity {
  id: string
  entity_type: string
  name: string
  scope: string[]
  summary: string | null
  business_relevance: number
  sentiment: string
  last_interaction: string | null
  properties: Record<string, any>
}

interface EntityLink {
  id: string
  source_id: string
  target_id: string
  relationship: string
  scope: string[]
  weight: number
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') ?? ''
    const scope = searchParams.get('scope') ?? ''
    const search = searchParams.get('q') ?? ''
    const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500)

    const where: string[] = []
    if (type) where.push(`entity_type = '${esc(type)}'`)
    if (scope) where.push(`'${esc(scope)}' = ANY(scope)`)
    if (search) where.push(`(name ILIKE '%${esc(search)}%' OR summary ILIKE '%${esc(search)}%')`)
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const entities = await sql<GraphEntity>(
      `SELECT id, entity_type, name, scope, summary, business_relevance, sentiment, last_interaction, properties
       FROM graph_entities ${whereClause}
       ORDER BY last_interaction DESC NULLS LAST, business_relevance DESC
       LIMIT ${limit}`
    )

    const links = await sql<EntityLink>(
      `SELECT id, source_id, target_id, relationship, scope, weight
       FROM entity_links
       ORDER BY weight DESC
       LIMIT 500`
    )

    return NextResponse.json({ entities, links })
  } catch (error) {
    console.error('[/api/crm/graph]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { sql, esc } from '@/lib/supabase/client'

interface Contact {
  id: string
  name: string
  scope: string[]
  properties: Record<string, any>
  summary: string | null
  business_relevance: number
  sentiment: string
  last_interaction: string | null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') ?? ''
    const search = searchParams.get('q') ?? ''
    const sort = searchParams.get('sort') ?? 'interaction'
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200)

    const where: string[] = ["entity_type = 'person'"]
    if (scope) where.push(`'${esc(scope)}' = ANY(scope)`)
    if (search) where.push(`(name ILIKE '%${esc(search)}%' OR summary ILIKE '%${esc(search)}%')`)
    const whereClause = `WHERE ${where.join(' AND ')}`

    const orderBy = sort === 'relevance'
      ? 'ORDER BY business_relevance DESC, last_interaction DESC NULLS LAST'
      : 'ORDER BY last_interaction DESC NULLS LAST, business_relevance DESC'

    const contacts = await sql<Contact>(
      `SELECT id, name, scope, properties, summary, business_relevance, sentiment, last_interaction
       FROM graph_entities ${whereClause} ${orderBy}
       LIMIT ${limit}`
    )

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('[/api/crm/contacts]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * Supabase Management API — helper sql<T>()
 * Usa PAT (Personal Access Token) directamente desde API routes.
 * No usar en el cliente (browser) — solo en server components / API routes.
 */

const PAT = process.env.SUPABASE_PAT!
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF!

export async function sql<T = Record<string, unknown>>(
  query: string
): Promise<T[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SQL ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Escapa strings para prevenir SQL injection en queries manuales.
 */
export function esc(value: string): string {
  return value.replace(/'/g, "''")
}

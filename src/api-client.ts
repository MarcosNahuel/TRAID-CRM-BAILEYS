import { CONFIG } from './config.js'

const BASE = CONFIG.API_BASE_URL

export async function upsertLead(data: {
  phone: string
  name?: string
  first_message?: string
  source_code?: string
  owner?: string
}) {
  const res = await fetch(`${BASE}/api/crm/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`upsertLead failed: ${res.status}`)
  return res.json()
}

export async function logMessage(data: {
  contact_phone: string
  direction?: string
  message_type?: string
  content?: string
  media_url?: string
  has_source_code?: boolean
}) {
  const res = await fetch(`${BASE}/api/crm/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`logMessage failed: ${res.status}`)
  return res.json()
}

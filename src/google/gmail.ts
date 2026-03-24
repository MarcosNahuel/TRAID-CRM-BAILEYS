/**
 * Google Gmail Integration para Super Yo
 *
 * SETUP:
 * 1. Crear OAuth 2.0 Client ID en Google Cloud Console
 * 2. Habilitar Gmail API
 * 3. Setear GOOGLE_GMAIL_CREDENTIALS (base64 JSON con client_id, client_secret, refresh_token)
 */

async function loadGoogleApis(): Promise<any | null> {
  try {
    const mod = await Function('return import("googleapis")')()
    return mod.google
  } catch {
    return null
  }
}

export function isGmailConfigured(): boolean {
  return !!process.env.GOOGLE_GMAIL_CREDENTIALS
}

function getCredentials(): {
  client_id: string
  client_secret: string
  refresh_token: string
} | null {
  const raw = process.env.GOOGLE_GMAIL_CREDENTIALS
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString())
  } catch {
    console.error('[gmail] Invalid GOOGLE_GMAIL_CREDENTIALS')
    return null
  }
}

async function getGmailClient(): Promise<any | null> {
  const google = await loadGoogleApis()
  if (!google) return null

  const creds = getCredentials()
  if (!creds) return null

  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret
  )
  oauth2Client.setCredentials({ refresh_token: creds.refresh_token })

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

export async function searchEmails(
  query: string,
  maxResults: number = 10
): Promise<{
  success: boolean
  emails?: Array<{
    id: string
    threadId: string
    from: string
    subject: string
    snippet: string
    date: string
    isUnread: boolean
  }>
  error?: string
}> {
  if (!isGmailConfigured()) {
    return { success: false, error: 'Gmail no configurado.' }
  }

  const gmail = await getGmailClient()
  if (!gmail) {
    return { success: false, error: 'googleapis no disponible.' }
  }

  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    })

    const messages = listRes.data.messages || []
    if (messages.length === 0) {
      return { success: true, emails: [] }
    }

    const emails = await Promise.all(
      messages.map(async (msg: any) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        })

        const headers = detail.data.payload?.headers || []
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name === name)?.value || ''

        return {
          id: msg.id,
          threadId: msg.threadId || '',
          from: getHeader('From'),
          subject: getHeader('Subject'),
          snippet: detail.data.snippet || '',
          date: getHeader('Date'),
          isUnread: (detail.data.labelIds || []).includes('UNREAD'),
        }
      })
    )

    return { success: true, emails }
  } catch (err: any) {
    console.error('[gmail] Error buscando emails:', err.message)
    return { success: false, error: err.message }
  }
}

export async function readEmail(messageId: string): Promise<{
  success: boolean
  email?: {
    id: string
    from: string
    to: string
    subject: string
    date: string
    body: string
    labels: string[]
  }
  error?: string
}> {
  if (!isGmailConfigured()) {
    return { success: false, error: 'Gmail no configurado.' }
  }

  const gmail = await getGmailClient()
  if (!gmail) {
    return { success: false, error: 'googleapis no disponible.' }
  }

  try {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const headers = detail.data.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name === name)?.value || ''

    let body = ''
    const payload = detail.data.payload

    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8')
    } else if (payload?.parts) {
      const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain')
      const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html')
      const part = textPart || htmlPart
      if (part?.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }

    if (body.includes('<html') || body.includes('<div')) {
      body = body
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 2000)
    }

    return {
      success: true,
      email: {
        id: messageId,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        body: body.substring(0, 2000),
        labels: detail.data.labelIds || [],
      },
    }
  } catch (err: any) {
    console.error('[gmail] Error leyendo email:', err.message)
    return { success: false, error: err.message }
  }
}

export async function createDraft(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string
): Promise<{
  success: boolean
  draftId?: string
  error?: string
}> {
  if (!isGmailConfigured()) {
    return { success: false, error: 'Gmail no configurado.' }
  }

  const gmail = await getGmailClient()
  if (!gmail) {
    return { success: false, error: 'googleapis no disponible.' }
  }

  try {
    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
    ]

    if (inReplyTo) {
      headers.push(`In-Reply-To: ${inReplyTo}`)
      headers.push(`References: ${inReplyTo}`)
    }

    const rawEmail = [...headers, '', body].join('\r\n')
    const encodedEmail = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const draftBody: any = {
      message: { raw: encodedEmail },
    }

    if (inReplyTo) {
      try {
        const original = await gmail.users.messages.get({
          userId: 'me',
          id: inReplyTo,
          format: 'minimal',
        })
        if (original.data.threadId) {
          draftBody.message.threadId = original.data.threadId
        }
      } catch {}
    }

    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: draftBody,
    })

    return {
      success: true,
      draftId: response.data.id || undefined,
    }
  } catch (err: any) {
    console.error('[gmail] Error creando draft:', err.message)
    return { success: false, error: err.message }
  }
}

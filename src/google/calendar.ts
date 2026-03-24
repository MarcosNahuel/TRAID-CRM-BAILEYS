/**
 * Google Calendar Integration para Super Yo
 *
 * SETUP:
 * 1. npm install googleapis (ya instalado)
 * 2. Crear service account en Google Cloud Console
 * 3. Compartir cada calendar con el email del service account
 * 4. Setear env vars:
 *    - GOOGLE_CALENDAR_CREDENTIALS: JSON base64 del service account
 *    - GOOGLE_CALENDAR_IDS: JSON con mapping scope -> calendar ID
 */

function getCalendarIds(): Record<string, string> {
  const raw = process.env.GOOGLE_CALENDAR_IDS
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    console.error('[calendar] Invalid GOOGLE_CALENDAR_IDS JSON')
    return {}
  }
}

function getCalendarId(scope: string): string | null {
  const ids = getCalendarIds()
  return ids[scope] || ids['personal'] || null
}

async function loadGoogleApis(): Promise<any | null> {
  try {
    const mod = await Function('return import("googleapis")')()
    return mod.google
  } catch {
    return null
  }
}

export function isCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CALENDAR_CREDENTIALS &&
    process.env.GOOGLE_CALENDAR_IDS
  )
}

export async function createEvent(
  scope: string,
  title: string,
  datetime: string,
  durationMinutes: number = 60,
  description?: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  if (!isCalendarConfigured()) {
    return {
      success: false,
      error: 'Google Calendar no configurado.',
    }
  }

  const calendarId = getCalendarId(scope)
  if (!calendarId) {
    return {
      success: false,
      error: `No hay calendar para scope "${scope}"`,
    }
  }

  const google = await loadGoogleApis()
  if (!google) {
    return { success: false, error: 'googleapis no instalado.' }
  }

  try {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CALENDAR_CREDENTIALS!, 'base64').toString()
    )

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    })

    const calendar = google.calendar({ version: 'v3', auth })

    const start = new Date(datetime)
    const end = new Date(start.getTime() + durationMinutes * 60000)

    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: description || `Creado por Super Yo — scope: ${scope}`,
        start: {
          dateTime: start.toISOString(),
          timeZone: 'America/Argentina/Mendoza',
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: 'America/Argentina/Mendoza',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 120 },
            { method: 'popup', minutes: 30 },
          ],
        },
      },
    })

    return {
      success: true,
      eventId: response.data.id || undefined,
    }
  } catch (err: any) {
    console.error('[calendar] Error creating event:', err.message)
    return { success: false, error: err.message }
  }
}

export async function listEvents(
  date?: string,
  scope?: string
): Promise<{
  success: boolean
  events?: Array<{
    id: string
    title: string
    start: string
    end: string
    calendar: string
  }>
  error?: string
}> {
  if (!isCalendarConfigured()) {
    return { success: false, error: 'Google Calendar no configurado.' }
  }

  const google = await loadGoogleApis()
  if (!google) {
    return { success: false, error: 'googleapis no instalado.' }
  }

  try {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CALENDAR_CREDENTIALS!, 'base64').toString()
    )

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    })

    const calendar = google.calendar({ version: 'v3', auth })

    const targetDate = date ? new Date(date) : new Date()
    const dayStart = new Date(targetDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(targetDate)
    dayEnd.setHours(23, 59, 59, 999)

    const calendarIds = getCalendarIds()
    const targetCalendars = scope
      ? { [scope]: calendarIds[scope] }
      : calendarIds

    const allEvents: Array<{
      id: string
      title: string
      start: string
      end: string
      calendar: string
    }> = []

    for (const [calScope, calId] of Object.entries(targetCalendars)) {
      if (!calId) continue

      try {
        const response = await calendar.events.list({
          calendarId: calId,
          timeMin: dayStart.toISOString(),
          timeMax: dayEnd.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        })

        for (const event of response.data.items || []) {
          allEvents.push({
            id: event.id || '',
            title: event.summary || 'Sin título',
            start: event.start?.dateTime || event.start?.date || '',
            end: event.end?.dateTime || event.end?.date || '',
            calendar: calScope,
          })
        }
      } catch (err: any) {
        console.warn(`[calendar] Error leyendo calendar ${calScope}:`, err.message)
      }
    }

    allEvents.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    )

    return { success: true, events: allEvents }
  } catch (err: any) {
    console.error('[calendar] Error listing events:', err.message)
    return { success: false, error: err.message }
  }
}

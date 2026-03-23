import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { password } = body

    const validPassword = process.env.CRM_PASSWORD ?? 'TRAID2026!'

    if (password !== validPassword) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const token = Buffer.from(`crm_${Date.now()}_${validPassword}`).toString('base64')

    const response = NextResponse.json({ ok: true })
    response.cookies.set('crm_session', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[/api/crm/auth]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createAuthToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  
  if (password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const { cookie } = createAuthToken()
  const response = NextResponse.json({ success: true })
  response.headers.set('Set-Cookie', cookie)
  return response
}

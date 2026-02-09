import { NextRequest, NextResponse } from 'next/server'

// Simple token-based auth for personal use
// The password is set via AUTH_PASSWORD env var
// A session token is stored in an httpOnly cookie

const TOKEN_COOKIE = 'sn_auth'
const TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000 // 30 days

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let token = ''
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

// In-memory token store (resets on deploy, which is fine for personal use)
const validTokens = new Set<string>()

export function createAuthToken(): { token: string; cookie: string } {
  const token = generateToken()
  validTokens.add(token)
  const cookie = `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TOKEN_EXPIRY / 1000}; Secure`
  return { token, cookie }
}

export function validateAuth(request: NextRequest): boolean {
  const cookie = request.cookies.get(TOKEN_COOKIE)
  if (!cookie?.value) return false
  return validTokens.has(cookie.value)
}

export function clearAuth(): string {
  return `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`
}

export function authError(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

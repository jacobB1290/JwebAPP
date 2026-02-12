import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

// ═══════════════════════════════════════════
// Stateless HMAC-signed token auth
//
// Why: Vercel serverless functions run across multiple isolated instances.
// An in-memory Set<token> only exists in the instance that created it.
// If /api/auth creates a token in Instance A, then /api/import/preview
// runs in Instance B, the token is unknown → "Unauthorized".
//
// Fix: The token IS its own proof of validity. It contains a timestamp
// signed with HMAC-SHA256 using AUTH_PASSWORD as the secret key.
// Any instance can verify the signature without shared state.
// ═══════════════════════════════════════════

const TOKEN_COOKIE = 'sn_auth'
const TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

function getSecret(): string {
  // Use AUTH_PASSWORD as the HMAC key. If not set, use a fallback
  // (but auth will still work — tokens are just less secure).
  return process.env.AUTH_PASSWORD || 'default-notebook-secret-key-2024'
}

/**
 * Create an HMAC-SHA256 signature of the given data.
 */
function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('hex')
}

/**
 * Create a signed auth token.
 * Format: <timestamp>.<signature>
 * The signature covers the timestamp, so it can't be forged or tampered with.
 */
export function createAuthToken(): { token: string; cookie: string } {
  const timestamp = Date.now().toString()
  const signature = sign(timestamp)
  const token = `${timestamp}.${signature}`

  const cookie = [
    `${TOKEN_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',  // Lax is fine for same-site API calls; Strict can block in some mobile browsers
    `Max-Age=${TOKEN_MAX_AGE_SECONDS}`,
    // Only add Secure flag in production (HTTPS)
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; ')

  return { token, cookie }
}

/**
 * Validate a signed auth token.
 * Checks: format is valid, signature matches, token hasn't expired.
 */
export function validateAuth(request: NextRequest): boolean {
  const cookie = request.cookies.get(TOKEN_COOKIE)
  if (!cookie?.value) return false

  const token = cookie.value
  const dotIndex = token.indexOf('.')
  if (dotIndex === -1) return false

  const timestamp = token.substring(0, dotIndex)
  const providedSignature = token.substring(dotIndex + 1)

  // Verify the timestamp is a valid number
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts)) return false

  // Check token hasn't expired (30 days)
  const age = Date.now() - ts
  if (age < 0 || age > TOKEN_MAX_AGE_SECONDS * 1000) return false

  // Verify HMAC signature using timing-safe comparison
  const expectedSignature = sign(timestamp)

  // Both signatures are hex strings of the same length (64 chars for SHA-256)
  if (providedSignature.length !== expectedSignature.length) return false

  try {
    return timingSafeEqual(
      Buffer.from(providedSignature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    )
  } catch {
    return false
  }
}

/**
 * Clear the auth cookie.
 */
export function clearAuth(): string {
  return `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

/**
 * Return a 401 Unauthorized response.
 */
export function authError(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

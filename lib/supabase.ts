import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy-init Supabase client — avoids crashing during build when env vars aren't available
// The client is created on first use (at runtime), not at module load time (build time)
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

// Backward-compatible export — getter that returns the lazy singleton
// This is a proxy that defers client creation to first property access
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase()
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-side client using service_role key — full DB access
// This is ONLY used in API routes, never exposed to the browser
export const supabase = createClient(supabaseUrl, supabaseServiceKey)

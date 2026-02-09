import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { data: entries } = await supabase
      .from('entries')
      .select('*, folders(name)')
      .order('updated_at', { ascending: false })
      .limit(50)

    const mapped = (entries || []).map((e: any) => ({
      ...e,
      folder_name: e.folders?.name || null,
      folders: undefined,
    }))

    return NextResponse.json({ entries: mapped })
  } catch (err: any) {
    console.error('Entries fetch error:', err?.message)
    return NextResponse.json({ entries: [] })
  }
}

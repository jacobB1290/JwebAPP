import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { data: folders } = await supabase
      .from('folders')
      .select('*')
      .order('name', { ascending: true })

    // Get entry counts per folder
    const foldersWithCounts = await Promise.all(
      (folders || []).map(async (f) => {
        const { count } = await supabase
          .from('entries')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', f.id)
        return { ...f, entry_count: count || 0 }
      })
    )

    const { count: uncategorizedCount } = await supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .is('folder_id', null)

    return NextResponse.json({
      folders: foldersWithCounts,
      uncategorizedCount: uncategorizedCount || 0,
    })
  } catch (err: any) {
    console.error('Folders fetch error:', err?.message)
    return NextResponse.json({ folders: [], uncategorizedCount: 0 })
  }
}

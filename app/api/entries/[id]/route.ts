import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAuth(request)) return authError()

  try {
    const { id } = await params

    const { data: entry } = await supabase
      .from('entries')
      .select('*, folders(name)')
      .eq('id', id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('entry_id', id)
      .order('position', { ascending: true })

    return NextResponse.json({
      entry: { ...entry, folder_name: (entry as any).folders?.name || null },
      messages: messages || [],
    })
  } catch (err: any) {
    console.error('Entry fetch error:', err?.message)
    return NextResponse.json({ error: 'Failed to load entry' }, { status: 500 })
  }
}

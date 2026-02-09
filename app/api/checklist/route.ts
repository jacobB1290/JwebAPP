import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateAuth, authError } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  const { messageId, itemIndex } = await request.json()

  const { data: msg } = await supabase
    .from('messages')
    .select('tool_call')
    .eq('id', messageId)
    .single()

  if (!msg?.tool_call) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const toolCall = msg.tool_call as any
  if (toolCall.data?.items?.[itemIndex] !== undefined) {
    toolCall.data.items[itemIndex].checked = !toolCall.data.items[itemIndex].checked
    await supabase
      .from('messages')
      .update({ tool_call: toolCall })
      .eq('id', messageId)
  }

  return NextResponse.json({ success: true, toolCall })
}

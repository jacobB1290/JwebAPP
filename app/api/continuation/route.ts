import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { callLLMSimple, CONTINUATION_PROMPT } from '@/lib/llm'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { text, model } = await request.json()

    // Get recent entries with their first message
    const { data: recentEntries } = await supabase
      .from('entries')
      .select('id, title, emotion_tags, topic_tags, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5)

    if (!recentEntries?.length) {
      return NextResponse.json({ isContinuation: false, entryId: null })
    }

    // Get first user message for each recent entry
    const entriesWithMessages = await Promise.all(
      recentEntries.map(async (entry) => {
        const { data: firstMsg } = await supabase
          .from('messages')
          .select('content')
          .eq('entry_id', entry.id)
          .eq('sender', 'user')
          .order('position', { ascending: true })
          .limit(1)
          .single()
        return { ...entry, first_message: firstMsg?.content || '' }
      })
    )

    const { data: memo } = await supabase
      .from('context_memo')
      .select('summary_text')
      .eq('id', 'singleton')
      .single()

    const checkInput = `Context memo: ${memo?.summary_text || '(empty)'}

Recent entries:
${entriesWithMessages.map(e => `- [${e.id}] "${e.title}" (${e.updated_at}) — "${e.first_message.slice(0, 200)}"`).join('\n')}

User's new text: "${text}"

Is this a continuation of one of the recent entries, or something new?`

    const result = await callLLMSimple(CONTINUATION_PROMPT, checkInput, model)

    if (result.is_continuation && result.confidence > 0.6 && result.continuation_entry_id) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('entry_id', result.continuation_entry_id)
        .order('position', { ascending: true })

      const { data: entry } = await supabase
        .from('entries')
        .select('*, folders(name)')
        .eq('id', result.continuation_entry_id)
        .single()

      return NextResponse.json({
        isContinuation: true,
        entryId: result.continuation_entry_id,
        entry: entry ? { ...entry, folder_name: (entry as any).folders?.name || null } : null,
        messages: msgs || [],
      })
    }

    return NextResponse.json({ isContinuation: false, entryId: null })
  } catch (err: any) {
    console.error('Continuation check error:', err?.message || err)
    // Non-critical — default to new entry on error
    return NextResponse.json({ isContinuation: false, entryId: null })
  }
}

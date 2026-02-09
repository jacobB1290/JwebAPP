import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { callLLM, GREETING_PROMPT } from '@/lib/openai'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    // Load context memo
    const { data: memo } = await supabase
      .from('context_memo')
      .select('*')
      .eq('id', 'singleton')
      .single()

    // Load recent entries
    const { data: recentEntries } = await supabase
      .from('entries')
      .select('id, title, emotion_tags, topic_tags, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10)

    // Count entries
    const { count: entryCount } = await supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })

    // Time of day (use UTC, Vercel will serve from edge)
    const hour = new Date().getUTCHours()
    let timeOfDay = 'morning'
    if (hour >= 12 && hour < 17) timeOfDay = 'afternoon'
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening'
    else if (hour >= 21 || hour < 5) timeOfDay = 'night'

    // Generate greeting via LLM
    const greetingContext = `Time of day: ${timeOfDay}
Total entries: ${entryCount || 0}
Context memo: ${memo?.summary_text || '(empty — this is likely a first-time user)'}
Recent entries: ${JSON.stringify((recentEntries || []).slice(0, 5).map(e => ({
  title: e.title,
  emotion_tags: e.emotion_tags,
  topic_tags: e.topic_tags,
  updated_at: e.updated_at,
  id: e.id,
})))}`

    const result = await callLLM(GREETING_PROMPT, greetingContext)

    return NextResponse.json({
      greeting: result.greeting || 'Hello. This is your space.',
      recentEntryId: result.recent_entry_id || null,
      recentEntryTopic: result.recent_entry_topic || null,
      contextMemo: memo?.summary_text || '',
      entryCount: entryCount || 0,
    })
  } catch (err: any) {
    console.error('Init error:', err?.message || err)
    return NextResponse.json(
      { error: 'Failed to initialize. Check your OpenAI API key.' },
      { status: 500 }
    )
  }
}

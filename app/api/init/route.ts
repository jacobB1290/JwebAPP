import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { callLLMSimple, GREETING_PROMPT } from '@/lib/llm'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  // Read model and timezone from query params
  const model = request.nextUrl.searchParams.get('model') || undefined
  const tz = request.nextUrl.searchParams.get('tz') || 'America/Boise'

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

    // Time of day — use the user's actual timezone
    let hour: number
    try {
      const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz })
      hour = parseInt(formatter.format(new Date()), 10)
    } catch {
      // Fallback if timezone string is invalid
      hour = new Date().getUTCHours()
    }
    let timeOfDay = 'morning'
    if (hour >= 12 && hour < 17) timeOfDay = 'afternoon'
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening'
    else if (hour >= 21 || hour < 5) timeOfDay = 'night'

    // Find most recent entry for fallback
    const mostRecent = (recentEntries || [])[0] || null

    // ─── Generate greeting via LLM (non-blocking — fallback if it fails) ───
    let greeting = ''
    let recentEntryId: string | null = null
    let recentEntryTopic: string | null = null

    try {
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

      const result = await callLLMSimple(GREETING_PROMPT, greetingContext, model)
      greeting = result.greeting || ''
      recentEntryId = result.recent_entry_id || null
      recentEntryTopic = result.recent_entry_topic || null
    } catch (llmErr: any) {
      console.error('Greeting LLM failed (non-fatal):', llmErr?.message || llmErr)
      // Fallback: build a simple greeting without LLM
      const greetings: Record<string, string> = {
        morning: 'Morning.',
        afternoon: 'Afternoon.',
        evening: 'Evening.',
        night: 'Late one.',
      }
      greeting = greetings[timeOfDay] || 'Hey.'
      if (mostRecent?.title) {
        greeting += ` You were last writing "${mostRecent.title}."`
        recentEntryId = mostRecent.id
        recentEntryTopic = mostRecent.title
      }
    }

    return NextResponse.json({
      greeting: greeting || 'This is your space. Write.',
      recentEntryId,
      recentEntryTopic,
      contextMemo: memo?.summary_text || '',
      entryCount: entryCount || 0,
    })
  } catch (err: any) {
    // Only Supabase failures reach here — still let the user in
    console.error('Init error:', err?.message || err)
    return NextResponse.json({
      greeting: 'Hey. Write something.',
      recentEntryId: null,
      recentEntryTopic: null,
      contextMemo: '',
      entryCount: 0,
    })
  }
}

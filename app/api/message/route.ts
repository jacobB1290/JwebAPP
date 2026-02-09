import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { callLLM, SYSTEM_PROMPT } from '@/lib/openai'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { text, entryId, sessionMessages, userRequestedResponse } = await request.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 })
    }

    // Load context memo
    const { data: memo } = await supabase
      .from('context_memo')
      .select('*')
      .eq('id', 'singleton')
      .single()

    // Load recent entries for context
    const { data: recentEntries } = await supabase
      .from('entries')
      .select('id, title, emotion_tags, topic_tags')
      .order('updated_at', { ascending: false })
      .limit(5)

    // Build LLM context
    const sessionContext = (sessionMessages || [])
      .slice(-20)
      .map((m: any) => `[${m.sender}]: ${m.content}`)
      .join('\n')

    const llmInput = `CONTEXT MEMO (Tier 2 — rolling summary):
${memo?.summary_text || '(empty)'}

RECENT ENTRIES (metadata only):
${JSON.stringify((recentEntries || []).map(e => ({ id: e.id, title: e.title, emotion_tags: e.emotion_tags, topic_tags: e.topic_tags })))}

CURRENT SESSION (Tier 1 — immediate context):
${sessionContext}

NEW USER TEXT (delta):
${text}

FLAGS:
user_requested_response: ${userRequestedResponse}
current_entry_id: ${entryId || '(new entry)'}
timestamp: ${new Date().toISOString()}`

    // Call LLM — no fallback
    const llmResponse = await callLLM(SYSTEM_PROMPT, llmInput)

    const responses = llmResponse.responses || []
    // CRITICAL: If entryId was provided, FORCE append — don't let LLM accidentally create a new entry
    let dbAction = llmResponse.database_action || { type: 'create_new_entry' }
    if (entryId && dbAction.type === 'create_new_entry') {
      dbAction = { type: 'append_to_entry', entry_id: entryId, folder_id: null }
    }

    // ─── Ensure folder exists ───
    let folderId: string | null = null
    if (llmResponse.folder_suggestion) {
      const { data: existingFolder } = await supabase
        .from('folders')
        .select('id')
        .eq('name', llmResponse.folder_suggestion)
        .single()

      if (existingFolder) {
        folderId = existingFolder.id
      } else {
        const { data: newFolder } = await supabase
          .from('folders')
          .insert({ name: llmResponse.folder_suggestion, description: '' })
          .select('id')
          .single()
        folderId = newFolder?.id || null
      }
    }

    // ─── Create or update entry ───
    let currentEntryId = entryId
    if (!currentEntryId || dbAction.type === 'create_new_entry') {
      const { data: newEntry } = await supabase
        .from('entries')
        .insert({
          title: llmResponse.entry_title_suggestion || 'Untitled',
          folder_id: folderId,
          emotion_tags: llmResponse.emotion_tags || [],
          topic_tags: llmResponse.topic_tags || [],
          context_memo_snapshot: memo?.summary_text || '',
        })
        .select('id')
        .single()
      currentEntryId = newEntry?.id
    } else {
      // Update existing entry
      const updateData: any = {
        emotion_tags: llmResponse.emotion_tags || [],
        topic_tags: llmResponse.topic_tags || [],
        updated_at: new Date().toISOString(),
      }
      if (llmResponse.entry_title_suggestion) {
        updateData.title = llmResponse.entry_title_suggestion
      }
      if (folderId) {
        updateData.folder_id = folderId
      }
      await supabase
        .from('entries')
        .update(updateData)
        .eq('id', currentEntryId)
    }

    // ─── Get current max position ───
    const { data: maxPosData } = await supabase
      .from('messages')
      .select('position')
      .eq('entry_id', currentEntryId)
      .order('position', { ascending: false })
      .limit(1)
      .single()
    let position = (maxPosData?.position ?? -1) + 1

    // ─── Save user message ───
    await supabase.from('messages').insert({
      entry_id: currentEntryId,
      sender: 'user',
      content: text,
      message_type: 'user_message',
      position: position++,
    })

    // ─── Save AI responses ───
    // IMPORTANT: tool_call only goes on the LAST AI message, not all of them
    const validResponses = responses.filter((r: any) => r.content?.trim())
    const savedResponses: any[] = []
    for (let idx = 0; idx < validResponses.length; idx++) {
      const resp = validResponses[idx]
      const isLast = idx === validResponses.length - 1
      const { data: aiMsg } = await supabase
        .from('messages')
        .insert({
          entry_id: currentEntryId,
          sender: 'ai',
          content: resp.content,
          message_type: resp.type || 'conversational',
          tone: resp.tone || null,
          linked_entry_id: resp.linked_entry_id || null,
          tool_call: isLast ? (llmResponse.tool_call || null) : null,
          position: position++,
        })
        .select('id')
        .single()
      savedResponses.push({ ...resp, id: aiMsg?.id })
    }

    // ─── Save tool call output (skip load_entry since it's a frontend-only action) ───
    if (llmResponse.tool_call && llmResponse.tool_call.type !== 'load_entry' && savedResponses.length > 0) {
      const lastAi = savedResponses[savedResponses.length - 1]
      if (lastAi?.id) {
        await supabase.from('tool_outputs').insert({
          message_id: lastAi.id,
          tool_type: llmResponse.tool_call.type,
          tool_data: llmResponse.tool_call.data || {},
        })
      }
    }

    // ─── Update context memo ───
    if (llmResponse.context_memo_update) {
      await supabase
        .from('context_memo')
        .update({
          summary_text: llmResponse.context_memo_update,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'singleton')
    }

    return NextResponse.json({
      entryId: currentEntryId,
      responses: savedResponses,
      toolCall: llmResponse.tool_call || null,
      emotionTags: llmResponse.emotion_tags || [],
      topicTags: llmResponse.topic_tags || [],
      entryTitle: llmResponse.entry_title_suggestion || 'Untitled',
      folderSuggestion: llmResponse.folder_suggestion || null,
    })
  } catch (err: any) {
    console.error('Message error:', err?.message || err)
    return NextResponse.json(
      { error: err?.message?.includes('401') 
        ? 'OpenAI API key is invalid. Please check your configuration.' 
        : `AI failed to respond: ${err?.message || 'Unknown error'}` },
      { status: 500 }
    )
  }
}

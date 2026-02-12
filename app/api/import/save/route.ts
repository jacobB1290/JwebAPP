import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateAuth, authError } from '@/lib/auth'
import { processConversation, applyProcessingResults } from '@/lib/process-conversation'

export const dynamic = 'force-dynamic'
// Processing adds LLM call time on top of DB writes
export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { messages, title, url } = await request.json()

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages to import' }, { status: 400 })
    }

    // Create a folder for imports if it doesn't exist (will be moved by processing)
    const folderName = 'Imported Conversations'
    const { data: existingFolder } = await supabase
      .from('folders')
      .select('id')
      .eq('name', folderName)
      .single()

    let folderId: string | null = null
    if (existingFolder) {
      folderId = existingFolder.id
    } else {
      const { data: newFolder } = await supabase
        .from('folders')
        .insert({ name: folderName, description: 'Conversations imported from external sources' })
        .select('id')
        .single()
      folderId = newFolder?.id || null
    }

    // Create the entry — initially with 'imported' tag as a marker
    const { data: entry } = await supabase
      .from('entries')
      .insert({
        title: title || 'Imported Conversation',
        folder_id: folderId,
        emotion_tags: [],
        topic_tags: ['imported'],
        context_memo_snapshot: '',
      })
      .select('id')
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    }

    // Insert messages with proper position ordering
    // Batch insert for performance (instead of one-by-one)
    const messageBatch = messages.map((msg: any, i: number) => {
      const isUser = msg.role === 'user'
      return {
        entry_id: entry.id,
        sender: isUser ? 'user' : 'ai',
        content: msg.content,
        message_type: isUser ? 'user_message' : 'conversational',
        tone: isUser ? null : 'neutral',
        position: i,
      }
    })

    // Insert in chunks of 50 to avoid payload limits
    const CHUNK_SIZE = 50
    for (let i = 0; i < messageBatch.length; i += CHUNK_SIZE) {
      const chunk = messageBatch.slice(i, i + CHUNK_SIZE)
      const { error: insertError } = await supabase.from('messages').insert(chunk)
      if (insertError) {
        console.error(`Message insert error (chunk ${i}):`, insertError.message)
      }
    }

    // ─── Process the conversation through LLM ───
    // Extract tags, folder, refined title, and update context memo.
    // This runs inline so the user gets immediate feedback with proper tags.
    let processingResult = null
    try {
      processingResult = await processConversation(messages, title || 'Imported Conversation')
      await applyProcessingResults(entry.id, processingResult)
    } catch (procErr: any) {
      // Processing failure is non-fatal — entry is saved, just unprocessed.
      // It will be picked up by the background processor on next app load.
      console.error('Import processing error (non-fatal):', procErr?.message || procErr)
    }

    return NextResponse.json({
      entryId: entry.id,
      messageCount: messages.length,
      title: processingResult?.entry_title_suggestion || title || 'Imported Conversation',
      processed: !!processingResult,
      tags: processingResult ? {
        emotion: processingResult.emotion_tags,
        topic: processingResult.topic_tags,
      } : null,
      folder: processingResult?.folder_suggestion || folderName,
    })
  } catch (err: any) {
    console.error('Import save error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to save imported conversation' }, { status: 500 })
  }
}

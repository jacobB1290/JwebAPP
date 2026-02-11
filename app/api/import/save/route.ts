import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateAuth, authError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    const { messages, title, url } = await request.json()

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages to import' }, { status: 400 })
    }

    // Create a folder for imports if it doesn't exist
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

    // Create the entry
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
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const isUser = msg.role === 'user'

      await supabase.from('messages').insert({
        entry_id: entry.id,
        sender: isUser ? 'user' : 'ai',
        content: msg.content,
        message_type: isUser ? 'user_message' : 'conversational',
        tone: isUser ? null : 'neutral',
        position: i,
      })
    }

    return NextResponse.json({
      entryId: entry.id,
      messageCount: messages.length,
      title: title || 'Imported Conversation',
    })
  } catch (err: any) {
    console.error('Import save error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to save imported conversation' }, { status: 500 })
  }
}

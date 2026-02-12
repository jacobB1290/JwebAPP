import { NextRequest, NextResponse } from 'next/server'
import { validateAuth, authError } from '@/lib/auth'
import { getUnprocessedImports, processImportedEntry } from '@/lib/process-conversation'

export const dynamic = 'force-dynamic'
// Processing multiple entries can take time
export const maxDuration = 60

/**
 * POST /api/import/process
 *
 * Finds and processes imported conversations that haven't been analyzed yet.
 * Called automatically by the frontend on app init, or manually.
 *
 * Body (optional):
 *   { entryId?: string } — process a specific entry, or omit for batch processing
 *
 * Returns:
 *   { processed: number, entries: [{id, title, tags}], remaining: number }
 */
export async function POST(request: NextRequest) {
  if (!validateAuth(request)) return authError()

  try {
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      // Empty body is fine — batch mode
    }

    // Single entry mode
    if (body.entryId) {
      const result = await processImportedEntry(
        body.entryId,
        body.title || 'Imported Conversation',
        body.model,
      )

      if (!result) {
        return NextResponse.json({ error: 'Entry not found or has no messages' }, { status: 404 })
      }

      return NextResponse.json({
        processed: 1,
        entries: [{
          id: body.entryId,
          title: result.entry_title_suggestion,
          tags: { emotion: result.emotion_tags, topic: result.topic_tags },
          folder: result.folder_suggestion,
        }],
        remaining: 0,
      })
    }

    // Batch mode — find unprocessed imports and process up to 3 at a time
    // (keep it small to avoid timeout on Vercel)
    const BATCH_SIZE = 3
    const unprocessed = await getUnprocessedImports(BATCH_SIZE + 1)

    if (unprocessed.length === 0) {
      return NextResponse.json({ processed: 0, entries: [], remaining: 0 })
    }

    const toProcess = unprocessed.slice(0, BATCH_SIZE)
    const remaining = Math.max(0, unprocessed.length - BATCH_SIZE)
    const results: any[] = []

    for (const entry of toProcess) {
      try {
        const result = await processImportedEntry(entry.id, entry.title, body.model)
        if (result) {
          results.push({
            id: entry.id,
            title: result.entry_title_suggestion,
            tags: { emotion: result.emotion_tags, topic: result.topic_tags },
            folder: result.folder_suggestion,
          })
        }
      } catch (err: any) {
        console.error(`Failed to process entry ${entry.id}:`, err?.message || err)
        // Continue with next entry — don't let one failure block the batch
      }
    }

    return NextResponse.json({
      processed: results.length,
      entries: results,
      remaining,
    })
  } catch (err: any) {
    console.error('Import process error:', err?.message || err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

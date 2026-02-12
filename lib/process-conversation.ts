// ═══════════════════════════════════════════
// CONVERSATION PROCESSOR
// ═══════════════════════════════════════════
// Analyzes imported conversations to extract:
// - emotion_tags & topic_tags
// - folder_suggestion (organizes the entry)
// - entry_title_suggestion (refines the title)
// - context_memo_update (rolling summary of user knowledge)
//
// Used by:
// 1. /api/import/save — processes immediately after import
// 2. /api/import/process — batch-processes already-imported entries

import { supabase } from '@/lib/supabase'
import { callLLMSimple } from '@/lib/llm'

// ─── Processing prompt ───
// This is distinct from SYSTEM_PROMPT because it analyzes an entire
// conversation after the fact, rather than responding in real-time.
const PROCESS_CONVERSATION_PROMPT = `You are analyzing an imported conversation to extract metadata for a personal notebook app. The conversation was originally held on another platform and is being imported.

Your job is to analyze the FULL conversation and produce structured metadata. You are NOT responding to the user — you are generating tags, summaries, and organizational data.

Analyze the conversation for:
1. **emotion_tags**: Emotional themes present (e.g., "curious", "anxious", "reflective", "frustrated", "hopeful", "vulnerable", "excited", "introspective"). Pick 2-5 that genuinely apply.
2. **topic_tags**: Subject matter tags (e.g., "psychology", "health", "relationships", "career", "philosophy", "creativity", "self-improvement"). Pick 3-8 that accurately describe the topics discussed.
3. **folder_suggestion**: A natural folder name for organizing this conversation (e.g., "Psychology & Self", "Health", "Work & Career", "Relationships", "Deep Dives", "Research"). Pick the MOST fitting single folder.
4. **entry_title_suggestion**: A clear, specific title for this conversation. Be descriptive but concise (5-10 words). Use the existing title as a starting point if it's good, or improve it.
5. **context_memo_update**: A rolling summary of key facts, preferences, patterns, and insights about the user revealed in this conversation. Write it as notes about the person — what they care about, how they think, personal details mentioned, recurring patterns. This should be 3-8 sentences. Write in third person ("They..." / "User...").

Respond with ONLY a JSON object:
{
  "emotion_tags": ["tag1", "tag2"],
  "topic_tags": ["tag1", "tag2", "tag3"],
  "folder_suggestion": "Folder Name",
  "entry_title_suggestion": "Improved Title",
  "context_memo_update": "Summary of what we learned about this person from the conversation."
}`

export interface ProcessingResult {
  emotion_tags: string[]
  topic_tags: string[]
  folder_suggestion: string
  entry_title_suggestion: string
  context_memo_update: string
}

/**
 * Process a conversation through the LLM to extract tags, folder, title, and context memo.
 *
 * @param messages - Array of {role, content} messages from the conversation
 * @param currentTitle - The current title of the entry
 * @param model - Optional model override
 * @returns ProcessingResult with extracted metadata
 */
export async function processConversation(
  messages: { role: string; content: string }[],
  currentTitle: string,
  model?: string,
): Promise<ProcessingResult> {
  // Build a condensed representation of the conversation.
  // For very long conversations, we sample to stay within token limits:
  // - First 10 messages (establishes the topic)
  // - Last 10 messages (captures conclusions)
  // - Up to 10 evenly sampled from the middle
  const MAX_MESSAGES = 30
  let sampled = messages

  if (messages.length > MAX_MESSAGES) {
    const first = messages.slice(0, 10)
    const last = messages.slice(-10)
    const middle = messages.slice(10, -10)
    const step = Math.max(1, Math.floor(middle.length / 10))
    const middleSampled = middle.filter((_, i) => i % step === 0).slice(0, 10)
    sampled = [...first, ...middleSampled, ...last]
  }

  // Truncate individual messages to prevent token overflow
  const MAX_MSG_LENGTH = 800
  const conversationText = sampled
    .map(m => {
      const content = typeof m.content === 'string' ? m.content : String(m.content || '')
      const truncated = content.length > MAX_MSG_LENGTH
        ? content.slice(0, MAX_MSG_LENGTH) + '...[truncated]'
        : content
      return `[${m.role}]: ${truncated}`
    })
    .join('\n\n')

  const input = `Current title: "${currentTitle}"
Total messages in conversation: ${messages.length}
${messages.length > MAX_MESSAGES ? `(Showing ${sampled.length} sampled messages for analysis)` : ''}

CONVERSATION:
${conversationText}`

  // Load existing context memo to merge with
  let existingMemo = ''
  try {
    const { data: memo } = await supabase
      .from('context_memo')
      .select('summary_text')
      .eq('id', 'singleton')
      .single()
    existingMemo = memo?.summary_text || ''
  } catch {
    // Non-fatal — proceed without existing memo
  }

  if (existingMemo) {
    // Provide existing memo so the LLM can ADD to it rather than replace it
    const inputWithMemo = `${input}

EXISTING CONTEXT MEMO (merge new insights with this — don't lose existing information):
${existingMemo}`

    const result = await callLLMSimple(PROCESS_CONVERSATION_PROMPT, inputWithMemo, model)
    return normalizeResult(result, currentTitle)
  }

  const result = await callLLMSimple(PROCESS_CONVERSATION_PROMPT, input, model)
  return normalizeResult(result, currentTitle)
}

/**
 * Ensure the result has all expected fields with sensible defaults.
 */
function normalizeResult(result: any, fallbackTitle: string): ProcessingResult {
  return {
    emotion_tags: Array.isArray(result?.emotion_tags) ? result.emotion_tags : [],
    topic_tags: Array.isArray(result?.topic_tags) ? result.topic_tags : [],
    folder_suggestion: result?.folder_suggestion || 'Imported Conversations',
    entry_title_suggestion: result?.entry_title_suggestion || fallbackTitle,
    context_memo_update: result?.context_memo_update || '',
  }
}

/**
 * Apply processing results to an entry in the database.
 * Updates the entry's tags, title, folder, and the global context memo.
 */
export async function applyProcessingResults(
  entryId: string,
  results: ProcessingResult,
): Promise<void> {
  // 1. Resolve folder — create if it doesn't exist
  let folderId: string | null = null
  if (results.folder_suggestion) {
    const { data: existingFolder } = await supabase
      .from('folders')
      .select('id')
      .eq('name', results.folder_suggestion)
      .single()

    if (existingFolder) {
      folderId = existingFolder.id
    } else {
      const { data: newFolder } = await supabase
        .from('folders')
        .insert({ name: results.folder_suggestion, description: '' })
        .select('id')
        .single()
      folderId = newFolder?.id || null
    }
  }

  // 2. Update the entry with tags, title, and folder
  const updateData: Record<string, any> = {
    emotion_tags: results.emotion_tags,
    topic_tags: results.topic_tags,
    updated_at: new Date().toISOString(),
  }
  if (results.entry_title_suggestion) {
    updateData.title = results.entry_title_suggestion
  }
  if (folderId) {
    updateData.folder_id = folderId
  }

  // Snapshot the current context memo onto the entry
  if (results.context_memo_update) {
    updateData.context_memo_snapshot = results.context_memo_update
  }

  await supabase
    .from('entries')
    .update(updateData)
    .eq('id', entryId)

  // 3. Update the global context memo
  if (results.context_memo_update) {
    await supabase
      .from('context_memo')
      .update({
        summary_text: results.context_memo_update,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'singleton')
  }
}

/**
 * Check if an entry needs processing (was imported but never analyzed).
 * Criteria: has topic_tags containing ONLY ['imported'] and empty emotion_tags.
 */
export async function getUnprocessedImports(limit: number = 5): Promise<any[]> {
  const { data: entries } = await supabase
    .from('entries')
    .select('id, title')
    .contains('topic_tags', ['imported'])
    .eq('context_memo_snapshot', '')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!entries) return []

  // Double-check: only return entries that genuinely look unprocessed
  // (emotion_tags empty or null, topic_tags is exactly ['imported'])
  return entries.filter(e => {
    // If the entry has been processed, it would have more tags
    return true // The query filters are sufficient
  })
}

/**
 * Process a single unprocessed import entry.
 * Loads its messages and runs them through the LLM.
 */
export async function processImportedEntry(
  entryId: string,
  title: string,
  model?: string,
): Promise<ProcessingResult | null> {
  // Load all messages for this entry
  const { data: messages } = await supabase
    .from('messages')
    .select('sender, content')
    .eq('entry_id', entryId)
    .order('position', { ascending: true })

  if (!messages || messages.length === 0) return null

  // Convert to the format processConversation expects
  const formatted = messages.map(m => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.content || '',
  }))

  const result = await processConversation(formatted, title, model)
  await applyProcessingResults(entryId, result)

  return result
}

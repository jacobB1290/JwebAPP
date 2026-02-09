import OpenAI from 'openai'

// CRITICAL: Hardcode baseURL to avoid sandbox OPENAI_BASE_URL proxy override
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1',
})

// ═══════════════════════════════════════
// FUNCTION CALLING TOOLS (OpenAI standard)
// ═══════════════════════════════════════

const NOTEBOOK_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'load_entry',
      description: 'Load a past journal entry into view. Use when the user references a previous entry, says "continue that", "go back to", or wants to revisit something they wrote before. The frontend will display the entry as if the user clicked it from the sidebar.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          entry_id: { type: 'string', description: 'The UUID of the entry to load' },
          title: { type: 'string', description: 'The title of the entry being loaded' },
        },
        required: ['entry_id', 'title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_chart',
      description: 'Create a visual chart to display data patterns, trends, or comparisons from the user\'s entries. Use sparingly — only when data visualization genuinely adds value.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Chart title' },
          chart_type: { type: 'string', enum: ['line', 'bar', 'pie'], description: 'Type of chart' },
          labels: { type: 'array', items: { type: 'string' }, description: 'X-axis labels' },
          datasets: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, data: { type: 'array', items: { type: 'number' } } }, required: ['label', 'data'], additionalProperties: false }, description: 'Data series' },
        },
        required: ['title', 'chart_type', 'labels', 'datasets'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_checklist',
      description: 'Create an interactive checklist for the user. Use when the user is planning, making a to-do list, or working through steps.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Checklist title' },
          items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, checked: { type: 'boolean' } }, required: ['text', 'checked'], additionalProperties: false }, description: 'Checklist items' },
        },
        required: ['title', 'items'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_prompt_card',
      description: 'Create a reflective journaling prompt. Use when you want to offer the user a question to think about — but only when it would genuinely deepen their reflection.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The reflective question or journaling prompt' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
    },
  },
]

// ═══════════════════════════════════════
// MAIN LLM CALL — with function calling
// ═══════════════════════════════════════

export async function callLLM(
  systemPrompt: string,
  userContent: string,
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[],
  useTools: boolean = true,
): Promise<any> {
  const msgArray = messages || [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent },
  ]

  const requestParams: any = {
    model: 'gpt-5.2',
    messages: msgArray,
    temperature: 0.7,
    max_completion_tokens: 2000,
    response_format: { type: 'json_object' },
  }

  // Add tools for the main notebook prompt (not greeting/continuation)
  if (useTools) {
    requestParams.tools = NOTEBOOK_TOOLS
    requestParams.tool_choice = 'auto'
    requestParams.parallel_tool_calls = false
  }

  const response = await openai.chat.completions.create(requestParams)

  const choice = response.choices[0]
  const content = choice?.message?.content || '{}'
  const toolCalls = choice?.message?.tool_calls || []

  // Parse the main JSON response
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = content.trim()
      ? { responses: [{ content, type: 'conversational', tone: 'neutral' }] }
      : {}
  }

  // Convert OpenAI tool_calls into our format
  if (toolCalls.length > 0) {
    const tc = toolCalls[0] as any // We only use one tool per turn
    try {
      const fnName = tc.function?.name || tc.name || ''
      const fnArgs = tc.function?.arguments || tc.arguments || '{}'
      const args = JSON.parse(fnArgs)
      if (fnName === 'load_entry') {
        parsed.tool_call = { type: 'load_entry', data: args }
      } else if (fnName === 'create_chart') {
        parsed.tool_call = { type: 'chart', title: args.title, data: { chartType: args.chart_type, labels: args.labels, datasets: args.datasets } }
      } else if (fnName === 'create_checklist') {
        parsed.tool_call = { type: 'checklist', title: args.title, data: { items: args.items } }
      } else if (fnName === 'create_prompt_card') {
        parsed.tool_call = { type: 'prompt_card', title: 'Reflect', data: { prompt: args.prompt } }
      }
    } catch {}
  }

  return parsed
}

// Simple LLM call without tools (for greeting, continuation)
export async function callLLMSimple(
  systemPrompt: string,
  userContent: string,
): Promise<any> {
  return callLLM(systemPrompt, userContent, undefined, false)
}

// ─── System Prompt ───
export const SYSTEM_PROMPT = `You are inside a personal notebook app. You're not a therapist. You're not a life coach. You're not trying to "help." You're just here — like another person in the room who happens to be reading along.

TONE: Normal. Chill. Match their energy. If they say "hello," say "hey" or "what's up" — don't write a paragraph analyzing why they said hello. If they're casual, be casual. If they're deep in something, meet them there. Read the room.

WHAT YOU ARE NOT:
- Not a therapist. Never psychoanalyze. Never interpret behavior. Never say things like "it sounds like you're avoiding..." or "I notice a pattern of..."
- Not performing. Don't try to be insightful on every turn. Most things don't need insight.
- Not probing. Don't fish for deeper meaning. If someone says something surface-level, it's surface-level. That's fine.
- Not encouraging. Don't cheerfully validate. "That's great!" is almost always wrong.

WHAT YOU ARE:
- Present. You're paying attention. You remember what they wrote before.
- Honest. If you have a thought, say it plainly. No wrapping it in careful therapeutic language.
- Brief. Short responses are almost always better. A few sentences max. One sentence is often perfect.
- Quiet when there's nothing to say. Silence (empty responses []) is a real option and usually the right one on auto-triggers.

HOW TO RESPOND:
- Say "hello" back when someone says hello. Don't make it weird.
- Answer questions directly. Don't redirect questions back at them unless you genuinely don't know.
- If they're just journaling / writing to themselves, mostly stay quiet. Drop a note only if you have something actually useful (a fact, a link to something they wrote before, a real observation — not a feelings-interpretation).
- Keep it short. If your response is longer than 3 sentences, you're probably overdoing it.
- Never project emotions or motivations onto the user. Respond to what they SAID, not what you imagine they FEEL.

RESPONSE TYPES:
- "conversational" = you're talking to them. Use when: they ask something, user_requested_response is true, or you have a genuine brief response.
- "annotation" = a margin note they might not read right now. Use when: you want to link to a past entry, flag a date/fact, or note something concrete. Keep it 1-2 sentences. No opinions, no interpretation.
- Empty responses [] = silence. Use when: they're writing and don't need you. This is the default on auto-triggers.

PAST ENTRIES:
When they reference something they wrote before ("continue that", "go back to", "that thing about..."), call load_entry with the matching entry_id. Say something brief like "Here you go." The frontend handles the rest.

DATABASE:
- Title entries with something specific, not generic. What actually happened or what it's about.
- Assign folders that make sense. Keep the names natural.
- Update the context memo every time — even when responses is empty.
- When entry_id is provided, ALWAYS append. Don't create new entries for ongoing conversations.

RESPONSE FORMAT — JSON only:

{
  "responses": [
    {
      "content": "Your text.",
      "type": "conversational | annotation",
      "tone": "neutral | warm | direct | wry | observational",
      "linked_entry_id": null
    }
  ],
  "emotion_tags": ["tags"],
  "topic_tags": ["tags"],
  "folder_suggestion": "Folder",
  "entry_title_suggestion": "Title",
  "context_memo_update": "Updated summary",
  "continuation_detected": false,
  "continuation_entry_id": null,
  "database_action": {
    "type": "append_to_entry | create_new_entry",
    "entry_id": null,
    "folder_id": null
  }
}

responses can be []. Always include the other fields regardless.`

export const GREETING_PROMPT = `You are the AI inside a personal Smart Notebook. Generate a greeting based on the context provided.

Rules:
- First visit ever (empty context_memo, zero entries): Something simple and direct. "This is your notebook. Write."
- Returning, no strong recent context: A brief, time-aware greeting. "Evening."
- Returning with a recent entry from today: Reference it directly. "You were writing about [topic] earlier." Also set has_recent_entry to true and provide the entry id and topic.
- Returning with emotional context: A real check-in, not a platitude. "How's the [thing they were dealing with] going?"
- Keep it SHORT — one sentence. Two at most.
- Do NOT be saccharine. Be direct and natural.

Respond with ONLY a JSON object:
{
  "greeting": "The greeting text",
  "has_recent_entry": false,
  "recent_entry_id": null,
  "recent_entry_topic": null
}`

export const CONTINUATION_PROMPT = `You are analyzing whether the user's new text is a continuation of a recent journal entry or something entirely new.

Given the user's new text and recent entry summaries, determine:
1. Is this a continuation of a specific recent entry?
2. Does the user explicitly reference a past entry ("going back to what I said about...", "continuing from earlier...")?
3. Or is this something completely new?

Be conservative — if uncertain, default to new content. It's better to create a separate entry than wrongly merge unrelated thoughts.

Respond with ONLY a JSON object:
{
  "is_continuation": false,
  "continuation_entry_id": null,
  "confidence": 0.0,
  "reasoning": "brief explanation"
}`

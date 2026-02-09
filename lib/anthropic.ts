import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ═══════════════════════════════════════
// TOOL DEFINITIONS — Anthropic native format
// ═══════════════════════════════════════
// Key differences from OpenAI:
// - No `strict` field — Anthropic validates natively
// - `input_schema` not `parameters`
// - Tool results come back as `tool_use` content blocks, not `tool_calls`
// - Response can mix text + tool_use in the same message
// - System prompt is a top-level param, not a message

const NOTEBOOK_TOOLS: Anthropic.Tool[] = [
  {
    name: 'load_entry',
    description: 'Load a past journal entry into view. Use when the user references a previous entry, says "continue that", "go back to", or wants to revisit something they wrote before. The frontend will display the entry.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entry_id: { type: 'string', description: 'The UUID of the entry to load' },
        title: { type: 'string', description: 'The title of the entry being loaded' },
      },
      required: ['entry_id', 'title'],
    },
  },
  {
    name: 'create_chart',
    description: 'Create a visual chart to display data patterns, trends, or comparisons. Use sparingly — only when data visualization genuinely adds value.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Chart title' },
        chart_type: { type: 'string', enum: ['line', 'bar', 'pie'], description: 'Type of chart' },
        labels: { type: 'array', items: { type: 'string' }, description: 'X-axis labels' },
        datasets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              data: { type: 'array', items: { type: 'number' } },
            },
            required: ['label', 'data'],
          },
          description: 'Data series',
        },
      },
      required: ['title', 'chart_type', 'labels', 'datasets'],
    },
  },
  {
    name: 'create_checklist',
    description: 'Create an interactive checklist. Use when the user is planning, making a to-do list, or working through steps.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Checklist title' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              checked: { type: 'boolean' },
            },
            required: ['text', 'checked'],
          },
          description: 'Checklist items',
        },
      },
      required: ['title', 'items'],
    },
  },
  {
    name: 'create_prompt_card',
    description: 'Create a reflective journaling prompt. Only when it would genuinely deepen their reflection.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'The reflective question or journaling prompt' },
      },
      required: ['prompt'],
    },
  },
]

// ═══════════════════════════════════════
// MAIN LLM CALL — Anthropic Messages API with tool use
// ═══════════════════════════════════════

export async function callLLM(
  systemPrompt: string,
  userContent: string,
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[],
  useTools: boolean = true,
  apiModel?: string,
): Promise<any> {
  // Anthropic uses system as a separate top-level param, not a message
  let system = systemPrompt
  const msgArray: Anthropic.MessageParam[] = []

  if (messages) {
    // Filter out system messages — they go in the system param
    for (const m of messages) {
      if (m.role === 'system') {
        system = m.content
      } else {
        msgArray.push({ role: m.role, content: m.content })
      }
    }
  } else {
    msgArray.push({ role: 'user', content: userContent })
  }

  // Ensure we have at least one user message (Anthropic requires it)
  if (msgArray.length === 0) {
    msgArray.push({ role: 'user', content: userContent || 'hello' })
  }

  // Ensure messages alternate user/assistant (Anthropic requirement)
  // If two consecutive messages have the same role, merge or insert a filler
  const sanitized: Anthropic.MessageParam[] = []
  for (const msg of msgArray) {
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
      // Merge consecutive same-role messages
      const prev = sanitized[sanitized.length - 1]
      const prevText = typeof prev.content === 'string' ? prev.content : ''
      const currText = typeof msg.content === 'string' ? msg.content : ''
      prev.content = prevText + '\n\n' + currText
    } else {
      sanitized.push({ ...msg })
    }
  }

  // Anthropic requires first message to be 'user'
  if (sanitized.length > 0 && sanitized[0].role !== 'user') {
    sanitized.unshift({ role: 'user', content: userContent || 'hello' })
  }

  const requestParams: Anthropic.MessageCreateParams = {
    model: apiModel || 'claude-haiku-4-5-20251001',
    system,
    messages: sanitized,
    max_tokens: 2000,
    temperature: 0.7,
  }

  // Add tools for main notebook prompt
  if (useTools) {
    requestParams.tools = NOTEBOOK_TOOLS
    requestParams.tool_choice = { type: 'auto' }
  }

  const response = await anthropic.messages.create(requestParams)

  // Parse Anthropic response — it returns content blocks (text + tool_use)
  let textContent = ''
  let toolCall: any = null

  for (const block of response.content) {
    if (block.type === 'text') {
      textContent += block.text
    } else if (block.type === 'tool_use') {
      // Convert Anthropic tool_use to our internal format
      const fnName = block.name
      const args = block.input as any

      if (fnName === 'load_entry') {
        toolCall = { type: 'load_entry', data: args }
      } else if (fnName === 'create_chart') {
        toolCall = {
          type: 'chart',
          title: args.title,
          data: { chartType: args.chart_type, labels: args.labels, datasets: args.datasets },
        }
      } else if (fnName === 'create_checklist') {
        toolCall = { type: 'checklist', title: args.title, data: { items: args.items } }
      } else if (fnName === 'create_prompt_card') {
        toolCall = { type: 'prompt_card', title: 'Reflect', data: { prompt: args.prompt } }
      }
    }
  }

  // Parse the JSON from text content
  let parsed: any
  try {
    // Anthropic might wrap JSON in markdown code blocks
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, textContent]
    const jsonStr = (jsonMatch[1] || textContent).trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    // If text isn't valid JSON, treat it as a conversational response
    if (textContent.trim()) {
      parsed = { responses: [{ content: textContent.trim(), type: 'conversational', tone: 'neutral' }] }
    } else {
      parsed = {}
    }
  }

  // Attach tool call if one was made
  if (toolCall) {
    parsed.tool_call = toolCall
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

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
  apiModel?: string,
): Promise<any> {
  const msgArray = messages || [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent },
  ]

  const requestParams: any = {
    model: apiModel || 'gpt-5-mini',
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

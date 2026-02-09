// ═══════════════════════════════════════════
// UNIFIED LLM ROUTER
// ═══════════════════════════════════════════
// Dispatches to OpenAI or Anthropic based on model selection.
// Routes pass the model choice from the client; defaults to Anthropic Sonnet 4.5.

import * as openaiProvider from './openai'
import * as anthropicProvider from './anthropic'

// Re-export prompts from shared location
export { SYSTEM_PROMPT, GREETING_PROMPT, CONTINUATION_PROMPT } from './prompts'

// ─── Model registry ───
export type ModelId = 'claude-haiku-4.5' | 'claude-sonnet-4.5' | 'gpt-5-mini' | 'gpt-5.2'

export interface ModelInfo {
  id: ModelId
  label: string
  provider: 'anthropic' | 'openai'
  envKey: string // which env var holds the API key
}

export const MODELS: Record<ModelId, ModelInfo> = {
  'claude-haiku-4.5': {
    id: 'claude-haiku-4.5',
    label: 'Haiku 4.5',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
  },
  'claude-sonnet-4.5': {
    id: 'claude-sonnet-4.5',
    label: 'Sonnet 4.5',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
  },
  'gpt-5-mini': {
    id: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    provider: 'openai',
    envKey: 'OPENAI_API_KEY',
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    provider: 'openai',
    envKey: 'OPENAI_API_KEY',
  },
}

export const DEFAULT_MODEL: ModelId = 'claude-haiku-4.5'

// ─── Resolve a model string to a valid ModelId ───
function resolveModel(model?: string): ModelId {
  if (model && model in MODELS) return model as ModelId
  return DEFAULT_MODEL
}

// ─── Unified callLLM ───
export async function callLLM(
  systemPrompt: string,
  userContent: string,
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[],
  useTools: boolean = true,
  model?: string,
): Promise<any> {
  const modelId = resolveModel(model)
  const info = MODELS[modelId]

  // Resolve the actual API model string
  const apiModel = getApiModelId(modelId)

  if (info.provider === 'anthropic') {
    return anthropicProvider.callLLM(systemPrompt, userContent, messages, useTools, apiModel)
  } else {
    return openaiProvider.callLLM(systemPrompt, userContent, messages, useTools, apiModel)
  }
}

// ─── Unified callLLMSimple (no tools) ───
export async function callLLMSimple(
  systemPrompt: string,
  userContent: string,
  model?: string,
): Promise<any> {
  return callLLM(systemPrompt, userContent, undefined, false, model)
}

// ─── Map our model IDs to actual API model strings ───
function getApiModelId(modelId: ModelId): string {
  const map: Record<ModelId, string> = {
    'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
    'gpt-5-mini': 'gpt-5-mini',
    'gpt-5.2': 'gpt-5.2',
  }
  return map[modelId] || modelId
}

// ─── API endpoint: list available models ───
export function getAvailableModels(): { id: string; label: string; provider: string; available: boolean }[] {
  return Object.values(MODELS).map(m => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    available: !!process.env[m.envKey],
  }))
}

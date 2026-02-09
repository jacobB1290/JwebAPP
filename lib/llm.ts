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
export type ModelId = 'claude-sonnet-4.5' | 'gpt-5.2'

export interface ModelInfo {
  id: ModelId
  label: string
  provider: 'anthropic' | 'openai'
  envKey: string // which env var holds the API key
}

export const MODELS: Record<ModelId, ModelInfo> = {
  'claude-sonnet-4.5': {
    id: 'claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    provider: 'openai',
    envKey: 'OPENAI_API_KEY',
  },
}

export const DEFAULT_MODEL: ModelId = 'claude-sonnet-4.5'

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

  if (info.provider === 'anthropic') {
    return anthropicProvider.callLLM(systemPrompt, userContent, messages, useTools)
  } else {
    return openaiProvider.callLLM(systemPrompt, userContent, messages, useTools)
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

// ─── API endpoint: list available models ───
export function getAvailableModels(): { id: string; label: string; provider: string; available: boolean }[] {
  return Object.values(MODELS).map(m => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    available: !!process.env[m.envKey],
  }))
}

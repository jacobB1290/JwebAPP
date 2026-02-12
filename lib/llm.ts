// ═══════════════════════════════════════════
// UNIFIED LLM ROUTER
// ═══════════════════════════════════════════
// Dispatches to OpenAI or Anthropic based on model selection.
// Supports extended thinking / reasoning modes for deeper analysis.

import * as openaiProvider from './openai'
import * as anthropicProvider from './anthropic'

// Re-export prompts from shared location
export { SYSTEM_PROMPT, GREETING_PROMPT, CONTINUATION_PROMPT } from './prompts'

// ─── Model registry ───
// IDs match what the frontend sends & stores in localStorage
export type ModelId =
  | 'claude-haiku-4.5'
  | 'claude-sonnet-4.5'
  | 'claude-opus-4.6'
  | 'gpt-5-mini'
  | 'gpt-5.2'

export interface ModelInfo {
  id: ModelId
  label: string
  provider: 'anthropic' | 'openai'
  envKey: string // which env var holds the API key
  supportsThinking: boolean // whether extended thinking / reasoning effort is available
}

export const MODELS: Record<ModelId, ModelInfo> = {
  'claude-haiku-4.5': {
    id: 'claude-haiku-4.5',
    label: 'Haiku 4.5',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    supportsThinking: true,
  },
  'claude-sonnet-4.5': {
    id: 'claude-sonnet-4.5',
    label: 'Sonnet 4.5',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    supportsThinking: true,
  },
  'claude-opus-4.6': {
    id: 'claude-opus-4.6',
    label: 'Opus 4.6',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    supportsThinking: true,
  },
  'gpt-5-mini': {
    id: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    provider: 'openai',
    envKey: 'OPENAI_API_KEY',
    supportsThinking: true,
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    provider: 'openai',
    envKey: 'OPENAI_API_KEY',
    supportsThinking: true,
  },
}

export const DEFAULT_MODEL: ModelId = 'claude-haiku-4.5'

// ─── Resolve a model string to a valid ModelId ───
function resolveModel(model?: string): ModelId {
  if (model && model in MODELS) return model as ModelId
  return DEFAULT_MODEL
}

// ─── Map our model IDs to actual API model strings ───
function getApiModelId(modelId: ModelId): string {
  const map: Record<ModelId, string> = {
    'claude-haiku-4.5': 'claude-haiku-4-5-20241022',
    'claude-sonnet-4.5': 'claude-sonnet-4-5-20241022',
    'claude-opus-4.6': 'claude-opus-4-6',
    'gpt-5-mini': 'gpt-5-mini',
    'gpt-5.2': 'gpt-5.2',
  }
  return map[modelId] || modelId
}

// ─── Unified callLLM ───
export async function callLLM(
  systemPrompt: string,
  userContent: string,
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[],
  useTools: boolean = true,
  model?: string,
  extendedThinking?: boolean,
): Promise<any> {
  const modelId = resolveModel(model)
  const info = MODELS[modelId]

  // Resolve the actual API model string
  const apiModel = getApiModelId(modelId)

  // Only enable extended thinking if the model supports it AND it's explicitly requested
  const enableThinking = extendedThinking && info.supportsThinking

  if (info.provider === 'anthropic') {
    return anthropicProvider.callLLM(systemPrompt, userContent, messages, useTools, apiModel, enableThinking)
  } else {
    return openaiProvider.callLLM(systemPrompt, userContent, messages, useTools, apiModel, enableThinking)
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
export function getAvailableModels(): { id: string; label: string; provider: string; available: boolean; supportsThinking: boolean }[] {
  return Object.values(MODELS).map(m => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    available: !!process.env[m.envKey],
    supportsThinking: m.supportsThinking,
  }))
}

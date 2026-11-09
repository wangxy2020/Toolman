import { describe, expect, it } from 'vitest'
import type { Assistant, Provider } from '@toolman/shared'
import {
  normalizeModelIds,
  pickDefaultModelId,
  resolvePrimaryAssistant,
} from './model-utils'

const ollamaId = '00000000-0000-0000-0000-000000000004'
const deepseekId = '00000000-0000-0000-0000-000000000005'

function makeOllama(models: Array<{ id: string; name: string }>): Provider {
  return {
    id: ollamaId,
    workspaceId: 'ws',
    name: 'Ollama',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      capabilities: { chat: true },
    })),
    isEnabled: true,
    hasApiKey: true,
    createdAt: 0,
    updatedAt: 0,
  }
}

function makeDeepSeek(models: Array<{ id: string; name: string }> = [
  { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
]): Provider {
  return {
    id: deepseekId,
    workspaceId: 'ws',
    name: 'DeepSeek',
    type: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      capabilities: { chat: true },
    })),
    isEnabled: true,
    hasApiKey: true,
    createdAt: 0,
    updatedAt: 0,
  }
}

function makeAssistant(modelId: string, isPinned = true): Assistant {
  return {
    id: 'assistant-1',
    workspaceId: 'ws',
    name: '通用智能体',
    systemPrompt: 'test',
    modelId,
    parameters: { temperature: 0.7 },
    isBuiltin: true,
    isPinned,
  }
}

describe('model-utils', () => {
  const providers = [
    makeOllama([
      { id: 'gemma4:latest', name: 'gemma4:latest' },
      { id: 'qwen3.5:9b', name: 'qwen3.5:9b' },
    ]),
  ]

  it('resolvePrimaryAssistant prefers pinned assistant', () => {
    const assistants = [
      makeAssistant(`${ollamaId}:gemma4:latest`, false),
      makeAssistant(`${ollamaId}:qwen3.5:9b`, true),
    ]
    expect(resolvePrimaryAssistant(assistants)?.modelId).toBe(`${ollamaId}:qwen3.5:9b`)
  })

  it('pickDefaultModelId prefers assistant model when available', () => {
    const assistants = [makeAssistant(`${ollamaId}:qwen3.5:9b`)]
    expect(pickDefaultModelId(assistants, providers)).toBe(`${ollamaId}:qwen3.5:9b`)
  })

  it('pickDefaultModelId prefers network models over local Ollama', () => {
    const mixed = [makeOllama([{ id: 'qwen3.5:9b', name: 'qwen3.5:9b' }]), makeDeepSeek()]
    expect(pickDefaultModelId([], mixed)).toBe(`${deepseekId}:deepseek-v4-flash`)
  })

  it('pickDefaultModelId ignores missing assistant model instead of inventing gemma4', () => {
    const assistants = [makeAssistant(`${ollamaId}:gemma4:latest`)]
    const localOnly = [makeOllama([{ id: 'qwen3.5:9b', name: 'qwen3.5:9b' }])]
    expect(pickDefaultModelId(assistants, localOnly)).toBe(`${ollamaId}:qwen3.5:9b`)
  })

  it('pickDefaultModelId returns null when no models are installed', () => {
    expect(pickDefaultModelId([makeAssistant(`${ollamaId}:gemma4:latest`)], [makeOllama([])])).toBeNull()
  })

  it('normalizeModelIds replaces stale single selection with assistant model', () => {
    const assistants = [makeAssistant(`${ollamaId}:qwen3.5:9b`)]
    expect(
      normalizeModelIds([`${ollamaId}:gemma4:latest`], providers, assistants),
    ).toEqual([`${ollamaId}:qwen3.5:9b`])
  })

  it('normalizeModelIds keeps explicit multi-model selection', () => {
    const assistants = [makeAssistant(`${ollamaId}:qwen3.5:9b`)]
    expect(
      normalizeModelIds(
        [`${ollamaId}:gemma4:latest`, `${ollamaId}:qwen3.5:9b`],
        providers,
        assistants,
      ),
    ).toEqual([`${ollamaId}:gemma4:latest`, `${ollamaId}:qwen3.5:9b`])
  })

  it('normalizeModelIds falls back to network model when selection is empty', () => {
    const mixed = [makeOllama([{ id: 'qwen3.5:9b', name: 'qwen3.5:9b' }]), makeDeepSeek()]
    expect(normalizeModelIds([], mixed, [])).toEqual([`${deepseekId}:deepseek-v4-flash`])
  })
})

import { describe, expect, it } from 'vitest'
import type { Assistant, Provider } from '@toolman/shared'
import { normalizeModelIds, pickDefaultModelId, resolvePrimaryAssistant } from './model-utils'

const providerId = '00000000-0000-0000-0000-000000000004'

function makeProvider(models: Array<{ id: string; name: string }>): Provider {
  return {
    id: providerId,
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
    makeProvider([
      { id: 'gemma4:latest', name: 'gemma4:latest' },
      { id: 'qwen3.5:9b', name: 'qwen3.5:9b' },
    ]),
  ]

  it('resolvePrimaryAssistant prefers pinned assistant', () => {
    const assistants = [
      makeAssistant(`${providerId}:gemma4:latest`, false),
      makeAssistant(`${providerId}:qwen3.5:9b`, true),
    ]
    expect(resolvePrimaryAssistant(assistants)?.modelId).toBe(`${providerId}:qwen3.5:9b`)
  })

  it('pickDefaultModelId prefers assistant model over gemma4 fallback', () => {
    const assistants = [makeAssistant(`${providerId}:qwen3.5:9b`)]
    expect(pickDefaultModelId(assistants, providers)).toBe(`${providerId}:qwen3.5:9b`)
  })

  it('normalizeModelIds replaces stale single selection with assistant model', () => {
    const assistants = [makeAssistant(`${providerId}:qwen3.5:9b`)]
    expect(
      normalizeModelIds([`${providerId}:gemma4:latest`], providers, assistants),
    ).toEqual([`${providerId}:qwen3.5:9b`])
  })

  it('normalizeModelIds keeps explicit multi-model selection', () => {
    const assistants = [makeAssistant(`${providerId}:qwen3.5:9b`)]
    expect(
      normalizeModelIds(
        [`${providerId}:gemma4:latest`, `${providerId}:qwen3.5:9b`],
        providers,
        assistants,
      ),
    ).toEqual([`${providerId}:gemma4:latest`, `${providerId}:qwen3.5:9b`])
  })
})

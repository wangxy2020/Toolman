import { describe, expect, it } from 'vitest'
import type { Assistant, Provider } from '@toolman/shared'
import {
  isUnconfiguredModelId,
  normalizeModelIds,
  pickDefaultModelId,
  resolveEffectiveChatModelIds,
  resolveHeaderChatModelIds,
  resolvePrimaryAssistant,
} from './model-utils'
import type { Session } from '@toolman/shared'

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

  it('pickDefaultModelId preferLocal heals unconfigured onto Ollama first', () => {
    const mixed = [makeOllama([{ id: 'qwen3.5:9b', name: 'qwen3.5:9b' }]), makeDeepSeek()]
    expect(pickDefaultModelId([], mixed, undefined, null, { preferLocal: true })).toBe(
      `${ollamaId}:qwen3.5:9b`,
    )
  })

  it('pickDefaultModelId ignores missing assistant model instead of inventing gemma4', () => {
    const assistants = [makeAssistant(`${ollamaId}:gemma4:latest`)]
    const localOnly = [makeOllama([{ id: 'qwen3.5:9b', name: 'qwen3.5:9b' }])]
    expect(pickDefaultModelId(assistants, localOnly)).toBe(`${ollamaId}:qwen3.5:9b`)
  })

  it('pickDefaultModelId returns null when no models are installed', () => {
    expect(pickDefaultModelId([makeAssistant(`${ollamaId}:gemma4:latest`)], [makeOllama([])])).toBeNull()
  })

  it('normalizeModelIds keeps a valid single selection instead of forcing assistant', () => {
    const assistants = [makeAssistant(`${ollamaId}:qwen3.5:9b`)]
    expect(
      normalizeModelIds([`${ollamaId}:gemma4:latest`], providers, assistants),
    ).toEqual([`${ollamaId}:gemma4:latest`])
  })

  it('normalizeModelIds replaces unavailable selection with assistant model', () => {
    const assistants = [makeAssistant(`${ollamaId}:qwen3.5:9b`)]
    const localOnly = [makeOllama([{ id: 'qwen3.5:9b', name: 'qwen3.5:9b' }])]
    expect(
      normalizeModelIds([`${ollamaId}:gemma4:latest`], localOnly, assistants),
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

  it('resolveEffectiveChatModelIds follows assistant model even on course topics', () => {
    const assistant = makeAssistant(`${ollamaId}:gemma4:latest`)
    const session = {
      id: 's1',
      workspaceId: 'ws',
      assistantId: assistant.id,
      title: '化学',
      type: 'chat' as const,
      metadata: {
        toolmanAssistantLib: {
          enabled: true,
          presetId: 'socratic-tutor',
          learningLabel: '学习',
          modelId: `${deepseekId}:deepseek-v4-flash`,
        },
      },
      parentSessionId: null,
      forkMessageId: null,
      messageCount: 0,
      lastMessageAt: null,
      createdAt: 0,
      updatedAt: 0,
    } satisfies Session
    expect(
      resolveEffectiveChatModelIds({
        activeSession: session,
        activeAssistant: assistant,
        providers: [makeOllama([{ id: 'gemma4:latest', name: 'gemma4:latest' }]), makeDeepSeek()],
        selectedModelIds: [`${deepseekId}:deepseek-v4-flash`],
      }),
    ).toEqual([`${ollamaId}:gemma4:latest`])
  })

  it('isUnconfiguredModelId detects seed placeholder', () => {
    expect(isUnconfiguredModelId(`${ollamaId}:unconfigured`)).toBe(true)
    expect(isUnconfiguredModelId(`${deepseekId}:deepseek-v4-flash`)).toBe(false)
  })

  it('resolveHeaderChatModelIds falls back when assistant model is unconfigured', () => {
    const assistant = makeAssistant(`${ollamaId}:unconfigured`)
    expect(
      resolveHeaderChatModelIds({
        activeAssistant: assistant,
        selectedModelIds: [`${deepseekId}:deepseek-v4-flash`],
      }),
    ).toEqual([`${deepseekId}:deepseek-v4-flash`])
  })

  it('resolveHeaderChatModelIds follows assistant settings and ignores course model', () => {
    const assistant = makeAssistant(`${ollamaId}:gemma4:latest`)
    const session = {
      id: 's1',
      workspaceId: 'ws',
      assistantId: assistant.id,
      title: '化学',
      type: 'chat' as const,
      metadata: {
        toolmanAssistantLib: {
          enabled: true,
          presetId: 'socratic-tutor',
          learningLabel: '学习',
          modelId: `${deepseekId}:deepseek-v4-flash`,
        },
      },
      parentSessionId: null,
      forkMessageId: null,
      messageCount: 0,
      lastMessageAt: null,
      createdAt: 0,
      updatedAt: 0,
    } satisfies Session
    expect(
      resolveHeaderChatModelIds({
        activeSession: session,
        activeAssistant: assistant,
        selectedModelIds: [`${deepseekId}:deepseek-v4-flash`],
      }),
    ).toEqual([`${ollamaId}:gemma4:latest`])
  })
})

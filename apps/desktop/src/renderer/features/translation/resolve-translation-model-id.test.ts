import { describe, expect, it } from 'vitest'
import type { Provider } from '@toolman/shared'
import {
  pickPreferredTranslationModelId,
  resolveTranslationModelId,
} from './resolve-translation-model-id'

function providerWithModels(
  id: string,
  type: Provider['type'],
  models: string[],
): Provider {
  return {
    id,
    name: id,
    type,
    baseUrl: type === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.deepseek.com/v1',
    models: models.map((modelId) => ({ id: modelId, name: modelId })),
    isEnabled: true,
    hasApiKey: true,
    workspaceId: 'ws',
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('resolveTranslationModelId', () => {
  it('uses explicit translation model when available', () => {
    const providers = [providerWithModels('ollama', 'ollama', ['gemma4:latest', 'qwen3.5:9b', 'llama3:8b'])]
    expect(
      resolveTranslationModelId({
        settingsModelId: 'ollama:llama3:8b',
        providers,
      }),
    ).toBe('ollama:llama3:8b')
  })

  it('prefers network models when settings model is unset', () => {
    const providers = [
      providerWithModels('ollama', 'ollama', ['qwen3.5:9b', 'gemma4:latest']),
      providerWithModels('deepseek', 'openai_compatible', ['deepseek-v4-flash']),
    ]
    expect(
      resolveTranslationModelId({
        settingsModelId: null,
        providers,
      }),
    ).toBe('deepseek:deepseek-v4-flash')
  })

  it('falls back to the first available local model', () => {
    const providers = [providerWithModels('ollama', 'ollama', ['qwen3.5:9b', 'llama3:8b'])]
    expect(
      resolveTranslationModelId({
        settingsModelId: null,
        providers,
      }),
    ).toBe('ollama:qwen3.5:9b')
  })

  it('ignores stale explicit model and uses network preference', () => {
    const providers = [
      providerWithModels('ollama', 'ollama', ['gemma4:latest', 'qwen3.5:9b']),
      providerWithModels('deepseek', 'openai_compatible', ['deepseek-v4-flash']),
    ]
    expect(
      resolveTranslationModelId({
        settingsModelId: 'missing:ghost-model',
        providers,
      }),
    ).toBe('deepseek:deepseek-v4-flash')
  })

  it('returns null when no models are configured', () => {
    expect(
      resolveTranslationModelId({
        settingsModelId: null,
        providers: [],
      }),
    ).toBeNull()
  })
})

describe('pickPreferredTranslationModelId', () => {
  it('prefers network over local', () => {
    expect(
      pickPreferredTranslationModelId([
        providerWithModels('ollama', 'ollama', ['qwen3.5:9b', 'gemma4:latest']),
        providerWithModels('deepseek', 'openai_compatible', ['deepseek-v4-flash']),
      ]),
    ).toBe('deepseek:deepseek-v4-flash')
  })
})

import { describe, expect, it } from 'vitest'
import type { Provider } from '@toolman/shared'
import {
  pickPreferredTranslationModelId,
  resolveTranslationModelId,
} from './resolve-translation-model-id'

function providerWithModels(models: string[]): Provider {
  return {
    id: 'ollama',
    name: 'Ollama',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    models: models.map((id) => ({ id, name: id })),
  } as Provider
}

describe('resolveTranslationModelId', () => {
  it('uses explicit translation model when available', () => {
    const providers = [providerWithModels(['gemma4:latest', 'qwen3.5:9b', 'llama3:8b'])]
    expect(
      resolveTranslationModelId({
        settingsModelId: 'ollama:llama3:8b',
        providers,
      }),
    ).toBe('ollama:llama3:8b')
  })

  it('defaults to gemma4:latest when settings model is unset', () => {
    const providers = [providerWithModels(['qwen3.5:9b', 'gemma4:latest'])]
    expect(
      resolveTranslationModelId({
        settingsModelId: null,
        providers,
      }),
    ).toBe('ollama:gemma4:latest')
  })

  it('falls back to qwen3.5:9b when gemma4 is unavailable', () => {
    const providers = [providerWithModels(['qwen3.5:9b', 'llama3:8b'])]
    expect(
      resolveTranslationModelId({
        settingsModelId: null,
        providers,
      }),
    ).toBe('ollama:qwen3.5:9b')
  })

  it('ignores stale explicit model and uses preferred default', () => {
    const providers = [providerWithModels(['gemma4:latest', 'qwen3.5:9b'])]
    expect(
      resolveTranslationModelId({
        settingsModelId: 'missing:ghost-model',
        providers,
      }),
    ).toBe('ollama:gemma4:latest')
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
  it('prefers gemma4 over qwen', () => {
    expect(
      pickPreferredTranslationModelId(
        [providerWithModels(['qwen3.5:9b', 'gemma4:latest'])],
      ),
    ).toBe('ollama:gemma4:latest')
  })
})

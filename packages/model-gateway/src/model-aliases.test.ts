import { describe, expect, it } from 'vitest'
import {
  deepSeekModelSupportsVision,
  isDeepSeekSupportedModelId,
  normalizeDeepSeekModelKey,
  providerSupportsOpenAiVision,
  resolveDeepSeekChatOptions,
  resolveOllamaExtraBody,
  resolveOpenAiModelName,
  shouldRouteThinkingAsAnswer,
} from './model-aliases.js'

describe('normalizeDeepSeekModelKey', () => {
  it('normalizes spaced names without changing alias', () => {
    expect(normalizeDeepSeekModelKey('deepseek chat')).toBe('deepseek-chat')
    expect(normalizeDeepSeekModelKey('deepseek reasoner')).toBe('deepseek-reasoner')
  })
})

describe('resolveDeepSeekChatOptions', () => {
  it('maps chat alias to v4 flash non-thinking', () => {
    expect(resolveDeepSeekChatOptions('deepseek chat')).toEqual({
      model: 'deepseek-v4-flash',
      extraBody: { thinking: { type: 'disabled' } },
    })
  })

  it('maps reasoner alias to v4 flash with thinking', () => {
    expect(resolveDeepSeekChatOptions('deepseek-reasoner')).toEqual({
      model: 'deepseek-v4-flash',
      extraBody: {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      },
    })
  })

  it('keeps supported V4 model ids', () => {
    expect(resolveDeepSeekChatOptions('deepseek-v4-pro')).toEqual({ model: 'deepseek-v4-pro' })
  })
})

describe('isDeepSeekSupportedModelId', () => {
  it('accepts current V4 model ids', () => {
    expect(isDeepSeekSupportedModelId('deepseek-v4-flash')).toBe(true)
    expect(isDeepSeekSupportedModelId('deepseek-v4-pro')).toBe(true)
  })

  it('rejects deprecated aliases', () => {
    expect(isDeepSeekSupportedModelId('deepseek chat')).toBe(false)
    expect(isDeepSeekSupportedModelId('deepseek reasoner')).toBe(false)
  })
})

describe('resolveOpenAiModelName', () => {
  it('resolves deepseek models by base url', () => {
    expect(
      resolveOpenAiModelName(
        { type: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1' },
        'deepseek chat',
      ),
    ).toBe('deepseek-v4-flash')
  })
})

describe('providerSupportsOpenAiVision', () => {
  it('only enables vision for deepseek-v4-pro', () => {
    expect(deepSeekModelSupportsVision('deepseek-v4-pro')).toBe(true)
    expect(deepSeekModelSupportsVision('deepseek-v4-flash')).toBe(false)
    expect(
      providerSupportsOpenAiVision(
        { type: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1' },
        'deepseek-v4-flash',
      ),
    ).toBe(false)
  })
})

describe('resolveOllamaExtraBody', () => {
  it('disables think mode for glm-ocr models', () => {
    expect(
      resolveOllamaExtraBody({ type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, 'glm-ocr:latest'),
    ).toEqual({ think: false })
  })

  it('disables think mode for gemma 3/4 models', () => {
    expect(
      resolveOllamaExtraBody({ type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, 'gemma4:26b'),
    ).toEqual({ think: false })
    expect(
      resolveOllamaExtraBody({ type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, 'gemma3:12b'),
    ).toEqual({ think: false })
    expect(
      resolveOllamaExtraBody({ type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, 'gemma:latest'),
    ).toEqual({ think: false })
    expect(
      resolveOllamaExtraBody({ type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, 'gemma4:latest'),
    ).toEqual({ think: false })
  })

  it('leaves unrelated ollama models unchanged', () => {
    expect(
      resolveOllamaExtraBody({ type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, 'llama3.2:latest'),
    ).toBeUndefined()
  })
})

describe('shouldRouteThinkingAsAnswer', () => {
  it('routes glm-ocr thinking tokens to answer text', () => {
    expect(
      shouldRouteThinkingAsAnswer(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        'glm-ocr:0.9b',
      ),
    ).toBe(true)
  })

  it('routes gemma 3/4 reasoning tokens to answer text', () => {
    expect(
      shouldRouteThinkingAsAnswer(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        'gemma4:26b',
      ),
    ).toBe(true)
  })
})

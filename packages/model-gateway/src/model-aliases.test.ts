import { describe, expect, it } from 'vitest'
import {
  deepSeekModelSupportsVision,
  isDeepSeekSupportedModelId,
  normalizeDeepSeekModelKey,
  providerSupportsOpenAiVision,
  resolveDeepSeekChatOptions,
  resolveOpenAiModelName,
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

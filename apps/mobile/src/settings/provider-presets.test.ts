import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROVIDER_ID,
  getProviderPreset,
  MOBILE_PROVIDER_PRESETS,
  normalizeChatBaseUrl,
} from './provider-presets'

describe('MOBILE_PROVIDER_PRESETS', () => {
  it('defaults to DeepSeek', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('deepseek')
    const preset = getProviderPreset(DEFAULT_PROVIDER_ID)
    expect(preset.defaultModel).toBe('deepseek-v4-flash')
    expect(preset.defaultBaseUrl).toContain('deepseek.com')
  })

  it('covers mainstream OpenAI-compatible providers from desktop', () => {
    expect(MOBILE_PROVIDER_PRESETS.map((p) => p.id)).toEqual([
      'deepseek',
      'openai',
      'moonshot',
      'zhipu',
      'qwen',
      'custom',
    ])
  })

  it('normalizes OpenAI-compatible base URLs with /v1', () => {
    expect(normalizeChatBaseUrl('https://api.deepseek.com', 'deepseek')).toBe(
      'https://api.deepseek.com/v1',
    )
    expect(normalizeChatBaseUrl('https://open.bigmodel.cn/api/paas/v4', 'zhipu')).toBe(
      'https://open.bigmodel.cn/api/paas/v4',
    )
  })
})

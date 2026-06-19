import { describe, expect, it } from 'vitest'
import { formatModelId, parseModelId, ProviderError } from './types.js'

describe('parseModelId', () => {
  it('parses provider and model with colons in model name', () => {
    expect(parseModelId('ollama:gemma4:26b')).toEqual({
      providerId: 'ollama',
      model: 'gemma4:26b',
    })
  })

  it('round-trips through formatModelId', () => {
    const modelId = formatModelId('provider-1', 'claude-sonnet-4')
    expect(parseModelId(modelId)).toEqual({
      providerId: 'provider-1',
      model: 'claude-sonnet-4',
    })
  })

  it('throws on invalid model id', () => {
    expect(() => parseModelId('no-colon')).toThrow(ProviderError)
  })
})

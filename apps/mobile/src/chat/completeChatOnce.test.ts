import { describe, expect, it } from 'vitest'

import {
  extractChatCompletionText,
  extractChatCompletionUsageTokens,
  parseLlmProxyChatBody,
} from './llmProxyRequest'

describe('llm proxy helpers', () => {
  it('extracts assistant content', () => {
    expect(
      extractChatCompletionText({
        choices: [{ message: { content: '  你好  ' } }],
      }),
    ).toBe('你好')
  })

  it('extracts usage tokens', () => {
    expect(extractChatCompletionUsageTokens({ usage: { total_tokens: 42 } })).toBe(42)
    expect(
      extractChatCompletionUsageTokens({ usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    ).toBe(15)
  })

  it('rejects incomplete proxy bodies', () => {
    expect(parseLlmProxyChatBody({})).toEqual({ error: 'messages required' })
    expect(
      parseLlmProxyChatBody({
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test',
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).toMatchObject({ model: 'deepseek-v4-flash' })
  })

  it('accepts trial bodies without a client api key', () => {
    expect(
      parseLlmProxyChatBody({
        trial: true,
        deviceId: 'web-1',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).toMatchObject({ trial: true, deviceId: 'web-1' })
  })
})

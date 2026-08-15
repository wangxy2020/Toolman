import { describe, expect, it } from 'vitest'

import { extractChatCompletionText, parseLlmProxyChatBody } from './llmProxyRequest'

describe('llm proxy helpers', () => {
  it('extracts assistant content', () => {
    expect(
      extractChatCompletionText({
        choices: [{ message: { content: '  你好  ' } }],
      }),
    ).toBe('你好')
  })

  it('rejects incomplete proxy bodies', () => {
    expect(parseLlmProxyChatBody({})).toEqual({ error: 'baseUrl required' })
    expect(
      parseLlmProxyChatBody({
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test',
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).toMatchObject({ model: 'deepseek-v4-flash' })
  })
})

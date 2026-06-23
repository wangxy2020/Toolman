import { describe, expect, it } from 'vitest'

import { formatMessagesForOllamaNative, shouldUseOllamaNativeChat } from './ollama-native.js'

describe('shouldUseOllamaNativeChat', () => {
  it('uses native chat for gemma without tools', () => {
    expect(
      shouldUseOllamaNativeChat(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        {
          model: 'gemma4:26b',
          messages: [{ role: 'user', content: 'hi' }],
        },
      ),
    ).toBe(true)
  })

  it('falls back to openai-compatible path when tools are enabled', () => {
    expect(
      shouldUseOllamaNativeChat(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        {
          model: 'gemma4:26b',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [
            {
              type: 'function',
              function: { name: 'fs_read', description: 'read', parameters: {} },
            },
          ],
        },
      ),
    ).toBe(false)
  })
})

describe('formatMessagesForOllamaNative', () => {
  it('flattens multipart user content and skips tool messages', () => {
    expect(
      formatMessagesForOllamaNative([
        { role: 'system', content: 'system prompt' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'text', text: 'world' },
          ],
        },
        { role: 'tool', content: 'ignored', tool_call_id: '1' },
      ]),
    ).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hello\n\nworld' },
    ])
  })
})

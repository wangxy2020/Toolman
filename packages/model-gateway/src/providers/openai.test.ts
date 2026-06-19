import { describe, expect, it } from 'vitest'
import { formatMessagesForOpenAi } from './openai.js'

describe('formatMessagesForOpenAi', () => {
  it('adds type=function to assistant tool_calls', () => {
    const formatted = formatMessagesForOpenAi([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', name: 'bash', arguments: '{"command":"uname"}' }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'darwin' },
    ])

    expect(formatted[1]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'bash', arguments: '{"command":"uname"}' },
        },
      ],
    })
  })

  it('flattens image_url parts for deepseek flash models', () => {
    const config = { type: 'openai_compatible' as const, baseUrl: 'https://api.deepseek.com/v1' }
    const formatted = formatMessagesForOpenAi(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          ],
        },
      ],
      config,
      'deepseek-v4-flash',
    )

    expect(formatted[0]?.content).toBe(
      'describe this\n\n[用户曾发送图片，当前模型不支持图片理解]',
    )
  })
})

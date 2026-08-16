import { describe, expect, it } from 'vitest'
import { chatMessagesFromRelay, handleIncomingAgentRelay, textFromContentBlocks } from './agentRelay'

describe('agentRelay helpers', () => {
  it('joins text content blocks', () => {
    expect(
      textFromContentBlocks([
        { type: 'text', text: '你好' },
        { type: 'thinking', text: '…' },
        { type: 'text', text: '世界' },
      ]),
    ).toBe('你好世界')
  })

  it('maps relay history to chat messages', () => {
    const messages = chatMessagesFromRelay([
      {
        id: '11111111-1111-4111-8111-111111111111',
        sessionId: '22222222-2222-4222-8222-222222222222',
        parentMessageId: null,
        role: 'user',
        modelId: null,
        status: 'completed',
        contentBlocks: [{ type: 'text', text: 'hi' }],
        error: null,
        tokenUsage: null,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        sessionId: '22222222-2222-4222-8222-222222222222',
        parentMessageId: null,
        role: 'system',
        modelId: null,
        status: 'completed',
        contentBlocks: [{ type: 'text', text: 'sys' }],
        error: null,
        tokenUsage: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    expect(messages).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        role: 'user',
        content: 'hi',
        createdAt: 1,
      },
    ])
  })

  it('ignores malformed relay envelopes', () => {
    expect(() => handleIncomingAgentRelay({ type: 'nope' })).not.toThrow()
  })

  it('accepts send_ok envelopes that carry the final reply', () => {
    expect(() =>
      handleIncomingAgentRelay({
        v: 1,
        type: 'send_ok',
        requestId: 'req-missing-waiter',
        contentBlocks: [{ type: 'text', text: '最终回复' }],
      }),
    ).not.toThrow()
  })

  it('ignores empty send_ok so a premature ack cannot finish the wait', () => {
    expect(() =>
      handleIncomingAgentRelay({
        v: 1,
        type: 'send_ok',
        requestId: 'req-empty',
      }),
    ).not.toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import {
  applyStreamDelta,
  chatMessagesFromRelay,
  handleIncomingAgentRelay,
  setAgentRelayWaiterForTest,
  textFromContentBlocks,
  thinkingFromContentBlocks,
} from './agentRelay'

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

  it('joins thinking content blocks', () => {
    expect(
      thinkingFromContentBlocks([
        { type: 'thinking', text: '先想' },
        { type: 'text', text: '回答' },
        { type: 'thinking', text: '再想' },
      ]),
    ).toBe('先想再想')
  })

  it('applies thinking snapshots and ignores empty replace dumps', () => {
    const texts: Array<{ text: string; replace?: boolean }> = []
    const thoughts: Array<{ text: string; replace?: boolean }> = []
    applyStreamDelta(
      {
        type: 'message.delta',
        sessionId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        delta: { type: 'thinking', text: '步骤一', replace: true },
        timestamp: 1,
      },
      (text, replace) => texts.push({ text, replace }),
      (text, replace) => thoughts.push({ text, replace }),
    )
    applyStreamDelta(
      {
        type: 'message.delta',
        sessionId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        delta: { type: 'text', text: '   ', replace: true },
        timestamp: 2,
      },
      (text, replace) => texts.push({ text, replace }),
      (text, replace) => thoughts.push({ text, replace }),
    )
    applyStreamDelta(
      {
        type: 'message.delta',
        sessionId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        delta: { type: 'text', text: '最终回复', replace: true },
        timestamp: 3,
      },
      (text, replace) => texts.push({ text, replace }),
      (text, replace) => thoughts.push({ text, replace }),
    )
    expect(thoughts).toEqual([{ text: '步骤一', replace: true }])
    expect(texts).toEqual([{ text: '最终回复', replace: true }])
  })

  it('applies thinking from send_ok without treating it as an empty ack', () => {
    const texts: string[] = []
    const thoughts: string[] = []
    let resolved = false
    const stop = setAgentRelayWaiterForTest('req-thinking-ok', {
      onDelta: (text) => texts.push(text),
      onThinking: (text) => thoughts.push(text),
      resolve: () => {
        resolved = true
      },
      reject: () => undefined,
    })
    handleIncomingAgentRelay({
      v: 1,
      type: 'send_ok',
      requestId: 'req-thinking-ok',
      contentBlocks: [
        { type: 'thinking', text: '推理' },
        { type: 'text', text: '答案' },
      ],
    })
    stop()
    expect(thoughts).toEqual(['推理'])
    expect(texts).toEqual(['答案'])
    expect(resolved).toBe(true)
  })
})

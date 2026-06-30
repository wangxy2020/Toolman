import { describe, expect, it } from 'vitest'
import type { Message } from '@toolman/shared'
import {
  buildMessagePanelScrollKey,
  buildStreamScrollKey,
  isScrollContainerNearBottom,
} from './message-panel-scroll'

function message(partial: Partial<Message> & Pick<Message, 'id'>): Message {
  return {
    role: 'assistant',
    sessionId: 's1',
    createdAt: 1,
    contentBlocks: [{ type: 'text', text: 'hello' }],
    status: 'completed',
    error: null,
    modelId: null,
    tokenUsage: null,
    ...partial,
  } as Message
}

describe('message-panel-scroll', () => {
  it('detects near-bottom scroll position', () => {
    const element = {
      scrollHeight: 1000,
      scrollTop: 900,
      clientHeight: 80,
    } as HTMLElement

    expect(isScrollContainerNearBottom(element)).toBe(true)
    expect(isScrollContainerNearBottom(element, 10)).toBe(false)
  })

  it('builds stable panel key across stream deltas', () => {
    const base = message({
      id: 'm1',
      status: 'streaming',
      contentBlocks: [{ type: 'text', text: 'a' }],
    })
    const longer = message({
      id: 'm1',
      status: 'streaming',
      contentBlocks: [{ type: 'text', text: 'abcd' }],
    })

    expect(buildMessagePanelScrollKey([base])).toBe(buildMessagePanelScrollKey([longer]))
  })

  it('changes stream key as streamed text grows', () => {
    const base = message({
      id: 'm1',
      status: 'streaming',
      contentBlocks: [{ type: 'text', text: 'a' }],
    })
    const longer = message({
      id: 'm1',
      status: 'streaming',
      contentBlocks: [{ type: 'text', text: 'abcd' }],
    })

    expect(buildStreamScrollKey([base])).not.toBe(buildStreamScrollKey([longer]))
  })
})

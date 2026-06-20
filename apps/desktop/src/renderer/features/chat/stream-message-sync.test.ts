import { describe, expect, it } from 'vitest'

import { applyStreamEventToMessages } from './stream-message-sync'

describe('applyStreamEventToMessages message.done', () => {
  it('replaces content blocks when message.done includes them', () => {
    const messages = [
      {
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'assistant' as const,
        status: 'streaming' as const,
        contentBlocks: [{ type: 'text' as const, text: 'summary only' }],
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    const next = applyStreamEventToMessages(
      messages,
      {
        type: 'message.done',
        sessionId: 'session-1',
        messageId: 'msg-1',
        tokenUsage: null,
        contentBlocks: [
          { type: 'text', text: 'summary only' },
          {
            type: 'local_file_links',
            title: '修订版文件（点击打开）',
            paths: ['/tmp/修订版_a.docx'],
          },
        ],
        timestamp: 2,
      },
      new Map(),
    )

    expect(next?.[0]?.contentBlocks.at(-1)).toEqual({
      type: 'local_file_links',
      title: '修订版文件（点击打开）',
      paths: ['/tmp/修订版_a.docx'],
    })
  })
})

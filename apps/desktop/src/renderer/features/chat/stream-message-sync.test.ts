import { describe, expect, it } from 'vitest'

import type { Message } from '@toolman/shared'

import { applyStreamEventToMessages } from './stream-message-sync'

describe('applyStreamEventToMessages message.done', () => {
  it('replaces content blocks when message.done includes them', () => {
    const messages: Message[] = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
        parentMessageId: null,
        role: 'assistant',
        modelId: null,
        status: 'streaming',
        contentBlocks: [{ type: 'text', text: 'summary only' }],
        error: null,
        tokenUsage: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    const next = applyStreamEventToMessages(
      messages,
      {
        type: 'message.done',
        sessionId: '00000000-0000-4000-8000-000000000002',
        messageId: '00000000-0000-4000-8000-000000000001',
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

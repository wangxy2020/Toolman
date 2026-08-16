import { describe, expect, it } from 'vitest'
import { buildGroupChatMessageSignPayload } from './group-chat-wire.js'

describe('group-chat-wire', () => {
  it('keeps the desktop sign payload field order', () => {
    const payload = buildGroupChatMessageSignPayload(
      {
        id: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        senderMemberId: 'm-1',
        senderName: 'B',
        createdAt: 10,
      },
      'deadbeef',
    )
    expect(JSON.parse(payload)).toEqual({
      v: 1,
      id: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      senderMemberId: 'm-1',
      senderName: 'B',
      createdAt: 10,
      contentHash: 'deadbeef',
    })
  })
})

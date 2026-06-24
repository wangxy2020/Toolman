import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { P2pGroupChatMessage, WorkspaceEvent } from '@toolman/shared'
import { P2pGroupChatMessagePayloadSchema } from '@toolman/shared'
import { readGroupChatMessages, appendGroupChatMessage } from './p2p-group-chat-store'
import { reprojectGroupChatWalEvents } from './p2p-group-chat-projector'

let tempUserData = ''

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return tempUserData
      throw new Error(`unexpected getPath(${name})`)
    },
  },
}))

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222'

function buildGroupChatMessageEvent(input: {
  seq: number
  messageId: string
  createdAt: number
  text: string
}): WorkspaceEvent {
  return {
    eventId: `00000000-0000-4000-8000-${String(input.seq).padStart(12, '0')}`,
    workspaceId: WORKSPACE_ID,
    seq: input.seq,
    resourceType: 'GroupChat',
    resourceId: input.messageId,
    operatorId: 'member-owner',
    eventType: 'Created',
    payload: {
      v: 1,
      kind: 'group.chat.message',
      message: {
        id: input.messageId,
        workspaceId: WORKSPACE_ID,
        senderMemberId: 'member-owner',
        senderName: 'Owner',
        contentBlocks: [{ type: 'text', text: input.text }],
        createdAt: input.createdAt,
      },
    },
    timestamp: input.createdAt,
    sourceDeviceId: 'device-owner',
  }
}

describe('p2p-group-chat-catchup', () => {
  beforeEach(() => {
    tempUserData = mkdtempSync(join(tmpdir(), 'toolman-group-chat-catchup-'))
  })

  afterEach(() => {
    rmSync(tempUserData, { recursive: true, force: true })
  })

  it('reprojects 10 WAL messages into an empty JSON store (offline catch-up)', () => {
    const baseTime = 1_700_000_000_000
    const events = Array.from({ length: 10 }, (_, index) =>
      buildGroupChatMessageEvent({
        seq: index + 1,
        messageId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
        createdAt: baseTime + index * 1000,
        text: `offline-${index + 1}`,
      }),
    )

    reprojectGroupChatWalEvents(WORKSPACE_ID, events, { suppressBroadcast: true })

    const messages = readGroupChatMessages(WORKSPACE_ID)
    expect(messages).toHaveLength(10)
    expect(messages.map((item) => item.id)).toEqual(
      events.map((event) => P2pGroupChatMessagePayloadSchema.parse(event.payload).message.id),
    )
  })

  it('fills WAL gaps when JSON already contains partial gossip copies', () => {
    const baseTime = 1_700_000_000_000
    const events = Array.from({ length: 10 }, (_, index) =>
      buildGroupChatMessageEvent({
        seq: index + 1,
        messageId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
        createdAt: baseTime + index * 1000,
        text: `msg-${index + 1}`,
      }),
    )

    const gossipOnly: P2pGroupChatMessage[] = events.slice(0, 3).map((event) =>
      P2pGroupChatMessagePayloadSchema.parse(event.payload).message,
    )

    for (const message of gossipOnly) {
      appendGroupChatMessage(message)
    }

    expect(readGroupChatMessages(WORKSPACE_ID)).toHaveLength(3)

    reprojectGroupChatWalEvents(WORKSPACE_ID, events, { suppressBroadcast: true })

    expect(readGroupChatMessages(WORKSPACE_ID)).toHaveLength(10)
  })

  it('replays clear then messages in WAL order', () => {
    const baseTime = 1_700_000_000_000
    const firstBatch = buildGroupChatMessageEvent({
      seq: 1,
      messageId: '11111111-1111-4111-8111-000000000001',
      createdAt: baseTime,
      text: 'stale',
    })
    const clearEvent: WorkspaceEvent = {
      eventId: '00000000-0000-4000-8000-000000000002',
      workspaceId: WORKSPACE_ID,
      seq: 2,
      resourceType: 'GroupChat',
      resourceId: WORKSPACE_ID,
      operatorId: 'member-owner',
      eventType: 'Deleted',
      payload: {
        v: 1,
        kind: 'group.chat.clear',
        workspaceId: WORKSPACE_ID,
        clearedAt: baseTime + 1,
        clearedByMemberId: 'member-owner',
      },
      timestamp: baseTime + 1,
      sourceDeviceId: 'device-owner',
    }
    const freshMessage = buildGroupChatMessageEvent({
      seq: 3,
      messageId: '11111111-1111-4111-8111-000000000003',
      createdAt: baseTime + 2,
      text: 'fresh',
    })

    reprojectGroupChatWalEvents(WORKSPACE_ID, [firstBatch, clearEvent, freshMessage], {
      suppressBroadcast: true,
    })

    const messages = readGroupChatMessages(WORKSPACE_ID)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.contentBlocks[0]?.type === 'text' ? messages[0].contentBlocks[0].text : '')
      .toBe('fresh')
  })
})

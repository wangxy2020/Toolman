import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { WorkspaceEvent } from '@toolman/shared'
import { projectGroupChatEvent } from './p2p-group-chat-projector'

const appendGroupChatMessage = vi.fn()
const removeGroupChatMessage = vi.fn()
const clearGroupChatMessages = vi.fn()
const broadcastP2pGroupChatMessage = vi.fn()
const broadcastP2pGroupChatCleared = vi.fn()

vi.mock('./p2p-group-chat-store.js', () => ({
  appendGroupChatMessage: (...args: unknown[]) => appendGroupChatMessage(...args),
  removeGroupChatMessage: (...args: unknown[]) => removeGroupChatMessage(...args),
  clearGroupChatMessages: (...args: unknown[]) => clearGroupChatMessages(...args),
}))

vi.mock('./p2p-group-chat-broadcast.js', () => ({
  broadcastP2pGroupChatMessage: (...args: unknown[]) => broadcastP2pGroupChatMessage(...args),
  broadcastP2pGroupChatCleared: (...args: unknown[]) => broadcastP2pGroupChatCleared(...args),
}))

const sampleMessage = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  senderMemberId: 'member-1',
  senderName: 'Alice',
  contentBlocks: [{ type: 'text' as const, text: 'hello' }],
  createdAt: 1_700_000_000_000,
}

function buildMessageEvent(): WorkspaceEvent {
  return {
    eventId: '33333333-3333-4333-8333-333333333333',
    workspaceId: sampleMessage.workspaceId,
    seq: 1,
    resourceType: 'GroupChat',
    resourceId: sampleMessage.id,
    operatorId: 'member-1',
    eventType: 'Created',
    payload: {
      v: 1,
      kind: 'group.chat.message',
      message: sampleMessage,
    },
    timestamp: sampleMessage.createdAt,
    sourceDeviceId: 'device-a',
  }
}

describe('p2p-group-chat-projector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('broadcasts when a WAL message is newly projected', () => {
    appendGroupChatMessage.mockReturnValue(true)
    projectGroupChatEvent(buildMessageEvent())
    expect(appendGroupChatMessage).toHaveBeenCalledWith(sampleMessage)
    expect(broadcastP2pGroupChatMessage).toHaveBeenCalledWith(sampleMessage)
  })

  it('skips broadcast when JSON already contains the message', () => {
    appendGroupChatMessage.mockReturnValue(false)
    projectGroupChatEvent(buildMessageEvent())
    expect(broadcastP2pGroupChatMessage).not.toHaveBeenCalled()
  })

  it('projects delete without broadcast', () => {
    projectGroupChatEvent({
      ...buildMessageEvent(),
      eventType: 'Deleted',
      resourceId: sampleMessage.id,
      payload: {
        v: 1,
        kind: 'group.chat.delete',
        workspaceId: sampleMessage.workspaceId,
        messageId: sampleMessage.id,
        deletedAt: sampleMessage.createdAt + 1,
        deletedByMemberId: 'member-1',
      },
    })
    expect(removeGroupChatMessage).toHaveBeenCalledWith(sampleMessage.workspaceId, sampleMessage.id)
    expect(broadcastP2pGroupChatMessage).not.toHaveBeenCalled()
  })
})

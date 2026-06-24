import { describe, expect, it } from 'vitest'
import {
  mapGroupChatWalToEnvelope,
  P2pGroupChatMessagePayloadSchema,
  P2pGroupChatWalPayloadSchema,
  P2P_GROUP_CHAT_RESOURCE_TYPE,
} from './group-chat-event.js'

const sampleMessage = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  senderMemberId: 'member-1',
  senderName: 'Alice',
  contentBlocks: [{ type: 'text' as const, text: 'hello' }],
  createdAt: 1_700_000_000_000,
}

describe('group-chat-event', () => {
  it('parses group.chat.message WAL payload', () => {
    const payload = P2pGroupChatWalPayloadSchema.parse({
      v: 1,
      kind: 'group.chat.message',
      message: sampleMessage,
    })
    expect(payload.kind).toBe('group.chat.message')
  })

  it('maps message payload to GroupChat Created envelope', () => {
    const payload = P2pGroupChatMessagePayloadSchema.parse({
      v: 1,
      kind: 'group.chat.message',
      message: sampleMessage,
    })
    const envelope = mapGroupChatWalToEnvelope(payload)
    expect(envelope.resourceType).toBe(P2P_GROUP_CHAT_RESOURCE_TYPE)
    expect(envelope.resourceId).toBe(sampleMessage.id)
    expect(envelope.eventType).toBe('Created')
  })

  it('maps clear payload to workspace-scoped Deleted envelope', () => {
    const payload = P2pGroupChatWalPayloadSchema.parse({
      v: 1,
      kind: 'group.chat.clear',
      workspaceId: sampleMessage.workspaceId,
      clearedAt: sampleMessage.createdAt,
      clearedByMemberId: 'owner-1',
    })
    const envelope = mapGroupChatWalToEnvelope(payload)
    expect(envelope.resourceId).toBe(sampleMessage.workspaceId)
    expect(envelope.eventType).toBe('Deleted')
  })
})

import {
  mapGroupChatWalToEnvelope,
  type P2pGroupChatWalPayload,
} from '@toolman/shared'
import { appendP2pEvent } from './p2p-event.service'

function walEventTimestamp(payload: P2pGroupChatWalPayload): number {
  switch (payload.kind) {
    case 'group.chat.message':
      return payload.message.createdAt
    case 'group.chat.delete':
      return payload.deletedAt
    case 'group.chat.clear':
      return payload.clearedAt
  }
}

export async function appendGroupChatWalEvent(
  workspaceId: string,
  operatorId: string,
  payload: P2pGroupChatWalPayload,
): Promise<void> {
  const envelope = mapGroupChatWalToEnvelope(payload)
  await appendP2pEvent({
    workspaceId,
    resourceType: envelope.resourceType,
    resourceId: envelope.resourceId,
    operatorId,
    eventType: envelope.eventType,
    payload: envelope.payload as Record<string, unknown>,
    timestamp: walEventTimestamp(payload),
  })
}

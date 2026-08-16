import {
  encodeFileChannelMessageJson,
  parseFileChannelMessageJson,
  parseP2pGroupChatWalPayload,
  P2P_GROUP_CHAT_RESOURCE_TYPE,
  type FileChannelMessage,
  type P2pGroupChatWalPayload,
} from '@toolman/shared'

export const P2P_REPLICATION_VERSION = 1

export type ReplicationMessage =
  | {
      type: 'sync.hello'
      v?: number
      workspaceId: string
      deviceId: string
      lastReceivedSeq: number
      latestSeq: number
    }
  | {
      type: 'sync.hello_ack'
      v?: number
      workspaceId: string
      deviceId: string
      lastReceivedSeq: number
      latestSeq: number
    }
  | {
      type: 'events.request'
      v?: number
      workspaceId: string
      sinceSeq: number
    }
  | {
      type: 'events.batch'
      v?: number
      workspaceId: string
      events: Array<{
        eventId: string
        workspaceId: string
        seq: number
        resourceType: string
        resourceId: string
        operatorId: string
        eventType: string
        payloadJson: string
        timestamp: number
        sourceDeviceId: string
      }>
    }
  | {
      type: 'group-chat.message'
      v?: number
      message: unknown
      signerDeviceId?: string
      signature?: string
    }
  | {
      type: 'group-chat.clear'
      v?: number
      workspaceId: string
      clearedAt?: number
      signerDeviceId?: string
      signature?: string
    }
  | {
      type: 'events.propose'
      v?: number
      workspaceId: string
      proposalId: string
      resourceType: string
      resourceId: string
      operatorId: string
      eventType: string
      payloadJson: string
      sourceDeviceId: string
      timestamp: number
    }
  | {
      type: 'events.proposed'
      v?: number
      workspaceId: string
      proposalId: string
      event: {
        eventId: string
        workspaceId: string
        seq: number
        resourceType: string
        resourceId: string
        operatorId: string
        eventType: string
        payloadJson: string
        timestamp: number
        sourceDeviceId: string
      }
    }
  | {
      type: 'events.propose_rejected'
      v?: number
      workspaceId: string
      proposalId: string
      reason: string
    }
  | {
      type: 'agent-relay.message'
      v?: number
      relay: unknown
    }

export function encodeReplicationMessage(message: ReplicationMessage): string {
  return JSON.stringify({ v: P2P_REPLICATION_VERSION, ...message })
}

export function parseReplicationMessage(raw: string): ReplicationMessage | null {
  try {
    const parsed = JSON.parse(raw) as ReplicationMessage & { v?: number }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function encodeFileMessage(message: FileChannelMessage): string {
  return encodeFileChannelMessageJson(message)
}

export function parseFileMessage(raw: string): FileChannelMessage | null {
  return parseFileChannelMessageJson(raw)
}

export function parseWalPayloadFromEvent(payloadJson: string): P2pGroupChatWalPayload | null {
  try {
    return parseP2pGroupChatWalPayload(JSON.parse(payloadJson))
  } catch {
    return null
  }
}

export function isGroupChatResource(resourceType: string): boolean {
  return resourceType === P2P_GROUP_CHAT_RESOURCE_TYPE
}

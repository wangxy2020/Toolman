import type { P2pEventType, P2pResourceType, ProductSku, WorkspaceEvent } from '@toolman/shared'
import {
  P2pEventPayloadSchema,
  RemoteWorkspaceEventWireSchema,
  type RemoteWorkspaceEventWire,
} from '@toolman/shared'
import type { RemoteP2pEventInput } from './p2p-event.service'

export const P2P_REPLICATION_VERSION = 1

export type { RemoteWorkspaceEventWire }

export interface SnapshotWire {
  id: string
  snapshotSeq: number
  stateJson: string
  stateHash: string
  createdBy: string
  createdAt: number
}

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
      events: RemoteWorkspaceEventWire[]
    }
  | {
      type: 'snapshot.request'
      v?: number
      workspaceId: string
    }
  | {
      type: 'snapshot.response'
      v?: number
      workspaceId: string
      snapshot: SnapshotWire | null
    }
  | {
      type: 'member.joined'
      workspaceId: string
      inviteId?: string
      member: {
        id: string
        workspaceId: string
        deviceId: string
        displayName: string
        role: string
        identityId?: string
        subscriptionSku?: ProductSku
      }
    }
  | {
      type: 'group-chat.message'
      v?: number
      message: unknown
    }
  | {
      type: 'group-chat.clear'
      v?: number
      workspaceId: string
    }
  | {
      type: 'agent-relay.message'
      v?: number
      relay: unknown
    }
  | {
      type: 'events.propose'
      v?: number
      workspaceId: string
      proposalId: string
      resourceType: P2pResourceType
      resourceId: string
      operatorId: string
      eventType: P2pEventType
      payloadJson: string
      sourceDeviceId: string
      timestamp: number
    }
  | {
      type: 'events.proposed'
      v?: number
      workspaceId: string
      proposalId: string
      event: RemoteWorkspaceEventWire
    }
  | {
      type: 'events.propose_rejected'
      v?: number
      workspaceId: string
      proposalId: string
      reason: string
    }
  | {
      type: 'member.sync_request'
      v?: number
      workspaceId: string
    }
  | {
      type: 'member.sync_response'
      v?: number
      workspaceId: string
      member: {
        id: string
        workspaceId: string
        deviceId: string
        displayName: string
        role: string
        identityId?: string
      }
    }
  | {
      type: 'member.approved'
      v?: number
      workspaceId: string
      at: number
      member: {
        id: string
        workspaceId: string
        deviceId: string
        displayName: string
        role: string
        identityId?: string
      }
    }

export function encodeReplicationMessage(message: ReplicationMessage): Buffer {
  return Buffer.from(JSON.stringify({ v: P2P_REPLICATION_VERSION, ...message }), 'utf8')
}

export function parseReplicationMessage(payload: Buffer): ReplicationMessage | null {
  try {
    const parsed = JSON.parse(payload.toString('utf8')) as ReplicationMessage & { v?: number }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function workspaceEventToWire(event: WorkspaceEvent): RemoteWorkspaceEventWire {
  return {
    eventId: event.eventId,
    workspaceId: event.workspaceId,
    seq: event.seq,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    operatorId: event.operatorId,
    eventType: event.eventType,
    payloadJson: JSON.stringify(event.payload),
    payloadHash: '', // filled by receiver validation later if needed
    prevEventHash: null,
    timestamp: event.timestamp,
    sourceDeviceId: event.sourceDeviceId,
  }
}

export function wireToRemoteInput(wire: RemoteWorkspaceEventWire): RemoteP2pEventInput | null {
  const parsedWire = RemoteWorkspaceEventWireSchema.safeParse(wire)
  if (!parsedWire.success) return null

  let payload: Record<string, unknown>
  try {
    const raw = JSON.parse(parsedWire.data.payloadJson)
    const payloadResult = P2pEventPayloadSchema.safeParse(raw)
    if (!payloadResult.success) return null
    payload = payloadResult.data
  } catch {
    return null
  }

  return {
    eventId: parsedWire.data.eventId,
    workspaceId: parsedWire.data.workspaceId,
    seq: parsedWire.data.seq,
    resourceType: parsedWire.data.resourceType,
    resourceId: parsedWire.data.resourceId,
    operatorId: parsedWire.data.operatorId,
    eventType: parsedWire.data.eventType,
    payload,
    prevEventHash: parsedWire.data.prevEventHash ?? null,
    timestamp: parsedWire.data.timestamp,
    sourceDeviceId: parsedWire.data.sourceDeviceId,
  }
}

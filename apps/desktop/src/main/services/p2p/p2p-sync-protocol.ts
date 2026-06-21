import type { P2pEventType, P2pResourceType, WorkspaceEvent } from '@toolman/shared'

export const P2P_REPLICATION_VERSION = 1

export interface RemoteWorkspaceEventWire {
  eventId: string
  workspaceId: string
  seq: number
  resourceType: P2pResourceType
  resourceId: string
  operatorId: string
  eventType: P2pEventType
  payloadJson: string
  payloadHash: string
  prevEventHash?: string | null
  timestamp: number
  sourceDeviceId: string
}

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
      }
    }
  | {
      type: 'group-chat.message'
      v?: number
      message: unknown
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

export function wireToRemoteInput(wire: RemoteWorkspaceEventWire) {
  return {
    eventId: wire.eventId,
    workspaceId: wire.workspaceId,
    seq: wire.seq,
    resourceType: wire.resourceType,
    resourceId: wire.resourceId,
    operatorId: wire.operatorId,
    eventType: wire.eventType,
    payload: JSON.parse(wire.payloadJson) as Record<string, unknown>,
    prevEventHash: wire.prevEventHash ?? null,
    timestamp: wire.timestamp,
    sourceDeviceId: wire.sourceDeviceId,
  }
}

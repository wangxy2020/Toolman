import type { P2pEventType, P2pResourceType, WorkspaceEvent } from '@toolman/shared'
import type { P2pEventRow } from '@toolman/db'
import { resolveSeqSlotConflict } from '@toolman/shared'
import { broadcastP2pEventAppended } from './p2p-event-broadcast'
import {
  assertWorkspaceMembershipAccess,
} from './p2p-permission.guard'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  extractLamportFromPayload,
  getWorkspaceOwnerDeviceId,
  observeRemoteLamport,
} from './p2p-sync-sequencing'
import { getEventRepo, mapEventRow } from './p2p-event-store-internal'
import {
  drainProjectionRetryQueue,
  projectP2pEventSafe,
} from './p2p-event-projection-queue'

export interface RemoteP2pEventInput {
  eventId: string
  workspaceId: string
  seq: number
  resourceType: P2pResourceType
  resourceId: string
  operatorId: string
  eventType: P2pEventType
  payload: Record<string, unknown>
  prevEventHash?: string | null
  timestamp: number
  sourceDeviceId: string
}

function resolveSeqSlotConflictLocal(
  existingBySeq: P2pEventRow,
  input: RemoteP2pEventInput,
): 'skip' | 'replace' | 'reject' {
  return resolveSeqSlotConflict({
    ownerDeviceId: getWorkspaceOwnerDeviceId(input.workspaceId),
    localDeviceId: getP2pDeviceInfo().deviceId,
    existingSourceDeviceId: existingBySeq.sourceDeviceId,
    incomingSourceDeviceId: input.sourceDeviceId,
    existingPayload: JSON.parse(existingBySeq.payloadJson) as Record<string, unknown>,
    incomingPayload: input.payload,
    existingSynced: existingBySeq.synced,
  })
}

export function applyRemoteP2pEvent(input: RemoteP2pEventInput): WorkspaceEvent | null {
  assertWorkspaceMembershipAccess(input.workspaceId)
  const repo = getEventRepo()

  const existingById = repo.findById(input.eventId)
  if (existingById) {
    return null
  }

  const latestSeq = repo.getLatestSeq(input.workspaceId)
  const existingBySeq = repo.findByWorkspaceSeq(input.workspaceId, input.seq)
  if (existingBySeq) {
    if (existingBySeq.id === input.eventId) {
      return null
    }
    const resolution = resolveSeqSlotConflictLocal(existingBySeq, input)
    if (resolution === 'skip') {
      return null
    }
    if (resolution === 'replace') {
      const row = getEventRepo().replaceConflictingEvent(existingBySeq.id, {
        id: input.eventId,
        workspaceId: input.workspaceId,
        seq: input.seq,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        operatorId: input.operatorId,
        eventType: input.eventType,
        payload: input.payload,
        prevEventHash: input.prevEventHash ?? null,
        sourceDeviceId: input.sourceDeviceId,
        timestamp: new Date(input.timestamp),
        synced: true,
      })
      const event = mapEventRow(row)
      drainProjectionRetryQueue()
      projectP2pEventSafe(event)
      broadcastP2pEventAppended(event)
      return event
    } else {
      throw new Error('序号冲突：远端事件与本地序号槽位不一致')
    }
  }

  const lamport = extractLamportFromPayload(input.payload)
  if (lamport !== undefined) {
    observeRemoteLamport(input.workspaceId, lamport)
  }

  if (input.seq < latestSeq) {
    // Historical event after snapshot baseline; still accept if seq slot is free.
  }

  const row = repo.insert({
    id: input.eventId,
    workspaceId: input.workspaceId,
    seq: input.seq,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    operatorId: input.operatorId,
    eventType: input.eventType,
    payload: input.payload,
    prevEventHash: input.prevEventHash ?? null,
    sourceDeviceId: input.sourceDeviceId,
    timestamp: new Date(input.timestamp),
    synced: true,
  })

  const event = mapEventRow(row)
  drainProjectionRetryQueue()
  projectP2pEventSafe(event)
  broadcastP2pEventAppended(event)
  return event
}

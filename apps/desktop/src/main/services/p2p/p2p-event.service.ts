import { createHash } from 'node:crypto'
import { app } from 'electron'
import { P2pEventRepository, type P2pEventRow } from '@toolman/db'
import type {
  P2pEventType,
  P2pResourceType,
  WorkspaceEvent,
} from '@toolman/shared'
import { resolveSeqSlotConflict } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import { broadcastP2pEventAppended } from './p2p-event-broadcast'
import { projectP2pEvent } from './p2p-event-projector'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  applySequencingToAppend,
  extractLamportFromPayload,
  getWorkspaceOwnerDeviceId,
  isLocalWorkspaceOwner,
  isOwnerPeerConnected,
  isSeqConflictError,
  MAX_SEQ_CONFLICT_RETRIES,
  observeRemoteLamport,
} from './p2p-sync-sequencing'
import { notifyLocalP2pEventAppended } from './p2p-sync-lifecycle'
import { getKnownP2pConnections } from './p2p-connection.service'
import { proposeP2pEventToOwner } from './p2p-event-proposal.service'

let eventStoreReady = false

export interface AppendP2pEventInput {
  workspaceId: string
  resourceType: P2pResourceType
  resourceId: string
  operatorId: string
  eventType: P2pEventType
  payload: Record<string, unknown>
  timestamp?: number
}

function getEventRepo(): P2pEventRepository {
  return new P2pEventRepository(getDatabase())
}

function ensureEventStore(): void {
  if (eventStoreReady) return
  P2pBridge.eventStoreInit(app.getPath('userData'))
  eventStoreReady = true
}

function mapEventRow(row: P2pEventRow): WorkspaceEvent {
  return {
    eventId: row.id,
    workspaceId: row.workspaceId,
    seq: row.seq,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    operatorId: row.operatorId,
    eventType: row.eventType,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    timestamp: row.timestamp.getTime(),
    sourceDeviceId: row.sourceDeviceId,
  }
}

function computeEventHash(input: {
  eventId: string
  workspaceId: string
  seq: number
  resourceType: string
  resourceId: string
  operatorId: string
  eventType: string
  payloadHash: string
  prevEventHash: string | null
  timestamp: number
  sourceDeviceId: string
}): string {
  const prev = input.prevEventHash ?? ''
  const material = [
    input.eventId,
    input.workspaceId,
    input.seq,
    input.resourceType,
    input.resourceId,
    input.operatorId,
    input.eventType,
    input.payloadHash,
    prev,
    input.timestamp,
    input.sourceDeviceId,
  ].join('|')
  return createHash('sha256').update(material).digest('hex')
}

function appendViaFallback(input: AppendP2pEventInput & { sourceDeviceId: string }): P2pEventRow {
  const repo = getEventRepo()
  const latestSeq = repo.getLatestSeq(input.workspaceId)
  const latestRow =
    latestSeq > 0 ? repo.findByWorkspaceSeq(input.workspaceId, latestSeq) : null

  const prevEventHash = latestRow
    ? computeEventHash({
        eventId: latestRow.id,
        workspaceId: latestRow.workspaceId,
        seq: latestRow.seq,
        resourceType: latestRow.resourceType,
        resourceId: latestRow.resourceId,
        operatorId: latestRow.operatorId,
        eventType: latestRow.eventType,
        payloadHash: latestRow.payloadHash,
        prevEventHash: latestRow.prevEventHash,
        timestamp: latestRow.timestamp.getTime(),
        sourceDeviceId: latestRow.sourceDeviceId,
      })
    : null

  return repo.append({
    workspaceId: input.workspaceId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    operatorId: input.operatorId,
    eventType: input.eventType,
    payload: input.payload,
    prevEventHash,
    sourceDeviceId: input.sourceDeviceId,
    timestamp: input.timestamp ? new Date(input.timestamp) : undefined,
  })
}

export function bootstrapP2pEventStore(): void {
  try {
    ensureEventStore()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[p2p] event store init skipped: ${message}`)
  }
}

export async function appendP2pEvent(input: AppendP2pEventInput): Promise<WorkspaceEvent> {
  assertWorkspaceMemberAccess(input.workspaceId)
  const connections = getKnownP2pConnections()
  if (
    !isLocalWorkspaceOwner(input.workspaceId) &&
    isOwnerPeerConnected(input.workspaceId, connections)
  ) {
    return proposeP2pEventToOwner(input)
  }
  return appendP2pEventLocally(input)
}

export function appendP2pEventLocally(input: AppendP2pEventInput): WorkspaceEvent {
  assertWorkspaceMemberAccess(input.workspaceId)
  const device = getP2pDeviceInfo()
  const connections = getKnownP2pConnections()
  const sequenced = applySequencingToAppend(
    input.workspaceId,
    input.payload,
    input.timestamp,
    connections,
  )

  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_SEQ_CONFLICT_RETRIES; attempt += 1) {
    try {
      const row = appendP2pEventRow({
        ...input,
        payload: sequenced.payload,
        timestamp: sequenced.timestamp,
        sourceDeviceId: device.deviceId,
      })
      const event = mapEventRow(row)
      projectP2pEvent(event)
      broadcastP2pEventAppended(event)
      notifyLocalP2pEventAppended(event)
      return event
    } catch (error) {
      lastError = error
      if (!isSeqConflictError(error) || attempt >= MAX_SEQ_CONFLICT_RETRIES - 1) {
        throw error
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('事件写入失败')
}

function appendP2pEventRow(
  input: AppendP2pEventInput & { sourceDeviceId: string },
): P2pEventRow {
  try {
    return appendViaFallback(input)
  } catch (error) {
    if (isSeqConflictError(error)) {
      throw error
    }
    throw error instanceof Error ? error : new Error('事件写入失败')
  }
}

export function listP2pEvents(rawInput: {
  workspaceId: string
  resourceType?: P2pResourceType
  resourceId?: string
  sinceSeq?: number
  limit?: number
  offset?: number
}): { events: WorkspaceEvent[]; total: number; hasMore: boolean } {
  assertWorkspaceMemberAccess(rawInput.workspaceId)

  const limit = Math.min(rawInput.limit ?? 50, 200)
  const offset = rawInput.offset ?? 0
  const repo = getEventRepo()
  const total = repo.count({
    workspaceId: rawInput.workspaceId,
    resourceType: rawInput.resourceType,
    resourceId: rawInput.resourceId,
    sinceSeq: rawInput.sinceSeq,
  })
  const rows = repo.list({
    workspaceId: rawInput.workspaceId,
    resourceType: rawInput.resourceType,
    resourceId: rawInput.resourceId,
    sinceSeq: rawInput.sinceSeq,
    limit,
    offset,
    order: 'desc',
  })

  return {
    events: rows.map(mapEventRow),
    total,
    hasMore: offset + rows.length < total,
  }
}

export function getP2pEvent(eventId: string): WorkspaceEvent {
  const row = getEventRepo().findById(eventId)
  if (!row) {
    throw new Error('事件不存在')
  }
  assertWorkspaceMemberAccess(row.workspaceId)
  return mapEventRow(row)
}

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
  assertWorkspaceMemberAccess(input.workspaceId)
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
      repo.deleteById(existingBySeq.id)
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
  projectP2pEvent(event)
  broadcastP2pEventAppended(event)
  return event
}

export function getWorkspaceLatestSeq(workspaceId: string): number {
  assertWorkspaceMemberAccess(workspaceId)
  return getEventRepo().getLatestSeq(workspaceId)
}

export function listWorkspaceEventsSince(
  workspaceId: string,
  sinceSeq: number,
  limit = 200,
): WorkspaceEvent[] {
  assertWorkspaceMemberAccess(workspaceId)
  const rows = getEventRepo().list({
    workspaceId,
    sinceSeq,
    limit,
    order: 'asc',
  })
  return rows.map(mapEventRow)
}

export function markP2pEventSynced(eventId: string): void {
  getEventRepo().markSynced(eventId)
}

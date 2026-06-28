import { createHash } from 'node:crypto'
import { logStructured } from '../structured-log.service'
import { app } from 'electron'
import { P2pEventRepository, type P2pEventRow } from '@toolman/db'
import type {
  P2pEventType,
  P2pResourceType,
  WorkspaceEvent,
} from '@toolman/shared'
import {resolveSeqSlotConflict, toErrorMessage } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import { broadcastP2pEventAppended } from './p2p-event-broadcast'
import { projectP2pEvent } from './p2p-event-projector'
import {
  assertWorkspaceMemberAccess,
  assertWorkspaceMembershipAccess,
} from './p2p-permission.guard'
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
import { withWorkspaceEventWrite } from './p2p-workspace-event-mutex'
import {
  dequeueProjectionOutbox,
  enqueueProjectionOutbox,
  loadProjectionOutbox,
  persistProjectionOutbox,
} from './p2p-projection-outbox'

let eventStoreReady = false
let projectionRetryQueue: Map<string, WorkspaceEvent> | null = null

function getProjectionRetryQueue(): Map<string, WorkspaceEvent> {
  if (!projectionRetryQueue) {
    projectionRetryQueue = loadProjectionOutbox()
  }
  return projectionRetryQueue
}

function projectP2pEventSafe(event: WorkspaceEvent): void {
  const queue = getProjectionRetryQueue()
  try {
    projectP2pEvent(event)
    dequeueProjectionOutbox(queue, event.eventId)
  } catch (error) {
    if (!queue.has(event.eventId)) {
      enqueueProjectionOutbox(queue, event)
    } else {
      queue.set(event.eventId, event)
      persistProjectionOutbox(queue)
    }
    logStructured('p2p', 'warn', `projection failed for ${event.eventId}: ${toErrorMessage(error, 'projection failed')}`)
  }
}

function drainProjectionRetryQueue(): void {
  const queue = getProjectionRetryQueue()
  for (const [eventId, event] of [...queue]) {
    try {
      projectP2pEvent(event)
      dequeueProjectionOutbox(queue, eventId)
    } catch {
      // keep for next drain
    }
  }
}

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
    const message = toErrorMessage(error, String(error))
    logStructured('p2p', 'warn', `event store init skipped: ${message}`)
  }
}

export async function appendP2pEvent(input: AppendP2pEventInput): Promise<WorkspaceEvent> {
  return withWorkspaceEventWrite(input.workspaceId, async () => {
    assertWorkspaceMemberAccess(input.workspaceId)
    const connections = getKnownP2pConnections()
    if (
      !isLocalWorkspaceOwner(input.workspaceId) &&
      isOwnerPeerConnected(input.workspaceId, connections)
    ) {
      return proposeP2pEventToOwner(input)
    }
    return appendP2pEventLocallyCore(input)
  })
}

export async function appendP2pEventLocally(input: AppendP2pEventInput): Promise<WorkspaceEvent> {
  return withWorkspaceEventWrite(input.workspaceId, () =>
    Promise.resolve(appendP2pEventLocallyCore(input)),
  )
}

function appendP2pEventLocallyCore(input: AppendP2pEventInput): WorkspaceEvent {
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

const ACTIVITY_LOG_EXCLUDED_RESOURCE_TYPES = new Set(['GroupChat'])

export function listP2pEvents(rawInput: {
  workspaceId: string
  resourceType?: P2pResourceType
  resourceId?: string
  sinceSeq?: number
  limit?: number
  offset?: number
}): { events: WorkspaceEvent[]; total: number; hasMore: boolean } {
  assertWorkspaceMembershipAccess(rawInput.workspaceId)

  const limit = Math.min(rawInput.limit ?? 50, 200)
  const offset = rawInput.offset ?? 0
  const repo = getEventRepo()
  const total = repo.count({
    workspaceId: rawInput.workspaceId,
    resourceType: rawInput.resourceType,
    resourceId: rawInput.resourceId,
    sinceSeq: rawInput.sinceSeq,
  })
  const rows = repo
    .list({
      workspaceId: rawInput.workspaceId,
      resourceType: rawInput.resourceType,
      resourceId: rawInput.resourceId,
      sinceSeq: rawInput.sinceSeq,
      limit: Math.min(limit * 3, 200),
      offset,
      order: 'desc',
    })
    .filter((row) => !ACTIVITY_LOG_EXCLUDED_RESOURCE_TYPES.has(row.resourceType))
    .slice(0, limit)

  return {
    events: rows.map(mapEventRow),
    total: rows.length < limit ? offset + rows.length : total,
    hasMore: offset + rows.length < total,
  }
}

export function getP2pEvent(eventId: string): WorkspaceEvent {
  const row = getEventRepo().findById(eventId)
  if (!row) {
    throw new Error('事件不存在')
  }
  assertWorkspaceMembershipAccess(row.workspaceId)
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

export function getWorkspaceLatestSeq(workspaceId: string): number {
  assertWorkspaceMembershipAccess(workspaceId)
  return getEventRepo().getLatestSeq(workspaceId)
}

export function listWorkspaceEventsSince(
  workspaceId: string,
  sinceSeq: number,
  limit = 200,
): WorkspaceEvent[] {
  assertWorkspaceMembershipAccess(workspaceId)
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

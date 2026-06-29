import { createHash } from 'node:crypto'
import { logStructured } from '../structured-log.service'
import { app } from 'electron'
import { P2pEventRepository, type P2pEventRow } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'

let eventStoreReady = false

export function getEventRepo(): P2pEventRepository {
  return new P2pEventRepository(getDatabase())
}

function ensureEventStore(): void {
  if (eventStoreReady) return
  P2pBridge.eventStoreInit(app.getPath('userData'))
  eventStoreReady = true
}

export function mapEventRow(row: P2pEventRow): WorkspaceEvent {
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

export function appendViaFallback(
  input: {
    workspaceId: string
    resourceType: string
    resourceId: string
    operatorId: string
    eventType: string
    payload: Record<string, unknown>
    timestamp?: number
    sourceDeviceId: string
  },
): P2pEventRow {
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
    resourceType: input.resourceType as P2pEventRow['resourceType'],
    resourceId: input.resourceId,
    operatorId: input.operatorId,
    eventType: input.eventType as P2pEventRow['eventType'],
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

import type { P2pEventType, P2pResourceType, WorkspaceEvent } from '@toolman/shared'
import type { P2pEventRow } from '@toolman/db'
import { broadcastP2pEventAppended } from './p2p-event-broadcast'
import { projectP2pEvent } from './p2p-event-projector'
import {
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  applySequencingToAppend,
  isLocalWorkspaceOwner,
  isOwnerPeerConnected,
  isSeqConflictError,
  MAX_SEQ_CONFLICT_RETRIES,
} from './p2p-sync-sequencing'
import { notifyLocalP2pEventAppended } from './p2p-sync-lifecycle'
import { getKnownP2pConnections } from './p2p-connection.service'
import { proposeP2pEventToOwner } from './p2p-event-proposal.service'
import { withWorkspaceEventWrite } from './p2p-workspace-event-mutex'
import { appendViaFallback, mapEventRow } from './p2p-event-store-internal'

export interface AppendP2pEventInput {
  workspaceId: string
  resourceType: P2pResourceType
  resourceId: string
  operatorId: string
  eventType: P2pEventType
  payload: Record<string, unknown>
  timestamp?: number
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

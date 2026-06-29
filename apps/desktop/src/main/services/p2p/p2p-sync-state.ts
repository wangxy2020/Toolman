import {
  P2pMemberRepository,
  P2pSyncCursorRepository,
  P2pWorkspaceRepository,
} from '@toolman/db'
import type { P2pConnectionInfo, P2pSyncStatus } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { getWorkspaceLatestSeq } from './p2p-event.service'
import { reconcileP2pSharedResourcesForWorkspace } from './p2p-shared-resource-reconcile.service'
import { reconcileGroupChatProjection } from './p2p-group-chat-projector'
import {
  broadcastP2pSyncError,
} from './p2p-sync-broadcast'
import { MAX_SEQ_CONFLICT_RETRIES } from './p2p-sync-sequencing'

export interface WorkspaceSyncState {
  status: P2pSyncStatus
  error?: string
  lastSyncAt?: number
}

export const workspaceStates = new Map<string, WorkspaceSyncState>()
export const syncingWorkspaces = new Set<string>()
export const reconnectRecoveryInFlight = new Set<string>()
export const reconnectRecoveryLastRunAt = new Map<string, number>()
export const RECONNECT_RECOVERY_COOLDOWN_MS = 30_000

export const joinerCatchUpInFlight = new Map<string, Promise<void>>()
export const joinerCatchUpScheduled = new Map<string, ReturnType<typeof setTimeout>>()
export const JOINER_CATCH_UP_DEBOUNCE_MS = 1500

export const connectionSnapshot: P2pConnectionInfo[] = []

export function getCursorRepo(): P2pSyncCursorRepository {
  return new P2pSyncCursorRepository(getDatabase())
}

export function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export function getPeerCursor(workspaceId: string, peerDeviceId: string) {
  return getCursorRepo().findByWorkspaceAndPeer(workspaceId, peerDeviceId)
}

export function cursorLastReceived(cursor: ReturnType<typeof getPeerCursor>): number {
  return cursor?.lastReceivedSeq ?? 0
}

export function cursorLastSent(cursor: ReturnType<typeof getPeerCursor>): number {
  return cursor?.lastSentSeq ?? 0
}

export function getWorkspaceState(workspaceId: string): WorkspaceSyncState {
  return workspaceStates.get(workspaceId) ?? { status: 'idle' }
}

export function setWorkspaceState(workspaceId: string, patch: Partial<WorkspaceSyncState>): void {
  workspaceStates.set(workspaceId, { ...getWorkspaceState(workspaceId), ...patch })
}

export function listWorkspacePeerDeviceIds(workspaceId: string): string[] {
  const device = getP2pDeviceInfo()
  return getMemberRepo()
    .listByWorkspace(workspaceId)
    .filter((member) => member.status === 'active' && member.deviceId !== device.deviceId)
    .map((member) => member.deviceId)
}

export function listSyncTargetPeerIds(workspaceId: string, peerDeviceId?: string): string[] {
  const device = getP2pDeviceInfo()
  const targets = peerDeviceId ? [peerDeviceId] : listWorkspacePeerDeviceIds(workspaceId)
  return targets.filter((id) => id !== device.deviceId)
}

export function knownConnectionsSnapshot(): P2pConnectionInfo[] {
  return [...connectionSnapshot]
}

export function findConnectedPeer(
  connections: P2pConnectionInfo[],
  peerDeviceId: string,
): P2pConnectionInfo | undefined {
  return connections.find((item) => item.peerDeviceId === peerDeviceId && item.state === 'connected')
}

export function reconcileSharedResourcesAfterSync(workspaceId: string): void {
  reconcileP2pSharedResourcesForWorkspace(workspaceId)
}

export function reconcileGroupChatAfterSync(workspaceId: string): void {
  try {
    reconcileGroupChatProjection(workspaceId)
  } catch (error) {
    logStructured('p2p', 'warn', `group chat projection reconcile failed: ${toErrorMessage(error, String(error))}`)
  }
}

export function reportSyncConflict(workspaceId: string, message: string, attempt: number): void {
  const detail =
    attempt < MAX_SEQ_CONFLICT_RETRIES
      ? `${message}（正在自动重试 ${attempt}/${MAX_SEQ_CONFLICT_RETRIES}）`
      : message
  setWorkspaceState(workspaceId, { status: 'error', error: detail })
  broadcastP2pSyncError({
    workspaceId,
    code: 'P2P_SYNC_CONFLICT',
    message: detail,
  })
}

export function mapPeerStatus(
  workspaceId: string,
  connection: P2pConnectionInfo | undefined,
  peerDeviceId: string,
) {
  const cursor = getPeerCursor(workspaceId, peerDeviceId)
  const latestSeq = getWorkspaceLatestSeq(workspaceId)
  const lastReceivedSeq = cursorLastReceived(cursor)
  return {
    deviceId: peerDeviceId,
    state: connection?.state ?? 'idle',
    lastSentSeq: cursorLastSent(cursor),
    lastReceivedSeq,
    pendingEvents: Math.max(0, latestSeq - lastReceivedSeq),
  }
}

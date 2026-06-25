import { P2pEventRepository, P2pWorkspaceRepository } from '@toolman/db'
import { toErrorMessage } from '@toolman/shared'
import type { P2pConnectionInfo, P2pSequencingMode } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

export const LAMPORT_PAYLOAD_KEY = '_lamport'
export const SEQUENCING_PAYLOAD_KEY = '_sequencing'
export const MAX_SEQ_CONFLICT_RETRIES = 3

const lamportClocks = new Map<string, number>()

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export function isLocalWorkspaceOwner(workspaceId: string): boolean {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return false
  return workspace.ownerDeviceId === getP2pDeviceInfo().deviceId
}

export function getWorkspaceOwnerDeviceId(workspaceId: string): string | null {
  return getWorkspaceRepo().findById(workspaceId)?.ownerDeviceId ?? null
}

export function isOwnerPeerConnected(
  workspaceId: string,
  connections: P2pConnectionInfo[] = [],
): boolean {
  if (isLocalWorkspaceOwner(workspaceId)) return true
  const ownerId = getWorkspaceOwnerDeviceId(workspaceId)
  if (!ownerId) return false
  return connections.some(
    (item) => item.peerDeviceId === ownerId && item.state === 'connected',
  )
}

export function getWorkspaceSequencingMode(
  workspaceId: string,
  connections: P2pConnectionInfo[] = [],
): P2pSequencingMode {
  return isOwnerPeerConnected(workspaceId, connections)
    ? 'owner_authoritative'
    : 'lamport_degraded'
}

export function observeRemoteLamport(workspaceId: string, lamport: number): void {
  const current = lamportClocks.get(workspaceId) ?? 0
  lamportClocks.set(workspaceId, Math.max(current, lamport))
}

export function nextLamportTimestamp(workspaceId: string): number {
  const current = lamportClocks.get(workspaceId) ?? 0
  const next = Math.max(current, Date.now()) + 1
  lamportClocks.set(workspaceId, next)
  return next
}

export function extractLamportFromPayload(
  payload: Record<string, unknown>,
): number | undefined {
  const raw = payload[LAMPORT_PAYLOAD_KEY]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

export function applySequencingToAppend(
  workspaceId: string,
  payload: Record<string, unknown>,
  timestamp?: number,
  connections: P2pConnectionInfo[] = [],
): { payload: Record<string, unknown>; timestamp: number } {
  const mode = getWorkspaceSequencingMode(workspaceId, connections)
  if (mode === 'owner_authoritative') {
    return { payload, timestamp: timestamp ?? Date.now() }
  }

  const lamport = nextLamportTimestamp(workspaceId)
  return {
    payload: {
      ...payload,
      [SEQUENCING_PAYLOAD_KEY]: 'lamport',
      [LAMPORT_PAYLOAD_KEY]: lamport,
    },
    timestamp: lamport,
  }
}

export function isSeqConflictError(error: unknown): boolean {
  const message = toErrorMessage(error, String(error))
  return (
    (message.includes('UNIQUE constraint failed') && message.includes('seq')) ||
    message.includes('序号冲突') ||
    message.includes('P2P_SYNC_CONFLICT')
  )
}

export function resetLamportClockForTests(workspaceId: string): void {
  lamportClocks.delete(workspaceId)
}

export function rehydrateLamportClocksFromDatabase(): void {
  const workspaceRepo = getWorkspaceRepo()
  const eventRepo = new P2pEventRepository(getDatabase())
  for (const workspace of workspaceRepo.listActive()) {
    const rows = eventRepo.list({
      workspaceId: workspace.id,
      limit: 500,
      order: 'desc',
    })
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payloadJson) as Record<string, unknown>
        const lamport = extractLamportFromPayload(payload)
        if (lamport !== undefined) {
          observeRemoteLamport(workspace.id, lamport)
        }
      } catch {
        // ignore malformed payloads
      }
    }
  }
}

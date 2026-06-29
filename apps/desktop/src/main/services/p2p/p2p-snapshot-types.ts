import { join } from 'node:path'
import { app } from 'electron'
import type { P2pSnapshotRow } from '@toolman/db'

export const P2P_SNAPSHOT_INTERVAL = 500
export const P2P_SNAPSHOT_RETAIN = 3
export const P2P_SNAPSHOT_GAP_THRESHOLD = 500

export interface WorkspaceSnapshotState {
  version: 1
  snapshotSeq: number
  workspaceId: string
  createdAt: number
  createdBy: string
  workspace: {
    name: string
    description: string | null
    ownerDeviceId: string
    maxMembers: number
    status: string
  }
  members: Array<{
    id: string
    identityId: string
    deviceId: string
    displayName: string
    role: string
    status: string
  }>
  sharedResources: Array<{
    id: string
    resourceType: string
    name: string
    status: string
  }>
  lastEventSeq: number
}

export interface SnapshotWire {
  id: string
  snapshotSeq: number
  stateJson: string
  stateHash: string
  createdBy: string
  createdAt: number
}

export function snapshotDir(workspaceId: string): string {
  return join(app.getPath('userData'), 'p2p', 'workspaces', workspaceId, 'snapshots')
}

export function snapshotFilePath(workspaceId: string, snapshotSeq: number): string {
  return join(snapshotDir(workspaceId), `${snapshotSeq}.zst`)
}

export function toSnapshotWire(row: P2pSnapshotRow): SnapshotWire {
  return {
    id: row.id,
    snapshotSeq: row.snapshotSeq,
    stateJson: row.stateJson,
    stateHash: row.stateHash,
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
  }
}

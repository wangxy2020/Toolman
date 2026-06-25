import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { join } from 'node:path'
import { app } from 'electron'
import {
  P2pMemberRepository,
  P2pSnapshotRepository,
  P2pWorkspaceRepository,
  type P2pSnapshotRow,
} from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import { getWorkspaceLatestSeq } from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { ensureLinkedIdentityRow } from './p2p-linked-identity.service'

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

function getSnapshotRepo(): P2pSnapshotRepository {
  return new P2pSnapshotRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function snapshotDir(workspaceId: string): string {
  return join(app.getPath('userData'), 'p2p', 'workspaces', workspaceId, 'snapshots')
}

function snapshotFilePath(workspaceId: string, snapshotSeq: number): string {
  return join(snapshotDir(workspaceId), `${snapshotSeq}.zst`)
}

function ensureSnapshotDir(workspaceId: string): void {
  const dir = snapshotDir(workspaceId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function buildWorkspaceSnapshotState(
  workspaceId: string,
  snapshotSeq: number,
): WorkspaceSnapshotState {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) {
    throw new Error('群组不存在')
  }

  const members = getMemberRepo()
    .listByWorkspace(workspaceId)
    .filter((member) => member.status === 'active' || member.status === 'invited')

  return {
    version: 1,
    snapshotSeq,
    workspaceId,
    createdAt: Date.now(),
    createdBy: getP2pDeviceInfo().deviceId,
    workspace: {
      name: workspace.name,
      description: workspace.description,
      ownerDeviceId: workspace.ownerDeviceId,
      maxMembers: workspace.maxMembers,
      status: workspace.status,
    },
    members: members.map((member) => ({
      id: member.id,
      identityId: member.identityId,
      deviceId: member.deviceId,
      displayName: member.displayName,
      role: member.role,
      status: member.status,
    })),
    sharedResources: [],
    lastEventSeq: snapshotSeq,
  }
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

export function createWorkspaceSnapshot(workspaceId: string): P2pSnapshotRow {
  const snapshotSeq = getWorkspaceLatestSeq(workspaceId)
  if (snapshotSeq <= 0) {
    throw new Error('暂无可快照的事件')
  }

  const existing = getSnapshotRepo().findByWorkspaceSeq(workspaceId, snapshotSeq)
  if (existing) {
    return existing
  }

  const state = buildWorkspaceSnapshotState(workspaceId, snapshotSeq)
  const stateJson = JSON.stringify(state)
  const stateHash = P2pBridge.snapshotHash(stateJson)
  const stateCompressed = Buffer.from(P2pBridge.snapshotCompress(stateJson))

  ensureSnapshotDir(workspaceId)
  writeFileSync(snapshotFilePath(workspaceId, snapshotSeq), stateCompressed)

  const row = getSnapshotRepo().create({
    workspaceId,
    snapshotSeq,
    stateJson,
    stateCompressed,
    stateHash,
    createdBy: state.createdBy,
  })

  getWorkspaceRepo().update({
    id: workspaceId,
    lastSnapshotSeq: snapshotSeq,
  })
  getSnapshotRepo().deleteOlderThan(workspaceId, P2P_SNAPSHOT_RETAIN)

  return row
}

export function maybeAutoSnapshot(workspaceId: string): P2pSnapshotRow | null {
  const latestSeq = getWorkspaceLatestSeq(workspaceId)
  if (latestSeq <= 0 || latestSeq % P2P_SNAPSHOT_INTERVAL !== 0) {
    return null
  }

  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (workspace?.lastSnapshotSeq === latestSeq) {
    return getSnapshotRepo().findByWorkspaceSeq(workspaceId, latestSeq)
  }

  try {
    return createWorkspaceSnapshot(workspaceId)
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    console.warn(`[p2p] auto snapshot failed: ${message}`)
    return null
  }
}

export function getLatestWorkspaceSnapshot(workspaceId: string): P2pSnapshotRow | null {
  return getSnapshotRepo().findLatest(workspaceId)
}

export function applyWorkspaceSnapshotState(
  workspaceId: string,
  state: WorkspaceSnapshotState,
): void {
  if (state.workspaceId !== workspaceId) {
    throw new Error('快照与群组不匹配')
  }

  const workspaceRepo = getWorkspaceRepo()
  const memberRepo = getMemberRepo()
  const workspace = workspaceRepo.findById(workspaceId)
  if (!workspace) {
    throw new Error('群组不存在')
  }

  workspaceRepo.update({
    id: workspaceId,
    name: state.workspace.name,
    description: state.workspace.description ?? undefined,
    lastSnapshotSeq: state.snapshotSeq,
  })

  for (const member of state.members) {
    const existingByDevice = memberRepo.findByWorkspaceAndDevice(workspaceId, member.deviceId)
    if (existingByDevice) {
      memberRepo.update({
        id: existingByDevice.id,
        displayName: member.displayName,
        role: member.role as typeof existingByDevice.role,
        status: member.status as typeof existingByDevice.status,
      })
      continue
    }

    const existingById = memberRepo.findById(member.id)
    if (existingById) {
      memberRepo.update({
        id: existingById.id,
        displayName: member.displayName,
        role: member.role as typeof existingById.role,
        status: member.status as typeof existingById.status,
      })
      continue
    }

    ensureLinkedIdentityRow(member.identityId, member.displayName)

    memberRepo.create({
      id: member.id,
      workspaceId,
      identityId: member.identityId,
      deviceId: member.deviceId,
      displayName: member.displayName,
      role: member.role as 'owner' | 'admin' | 'member' | 'readonly',
      status: member.status as 'active' | 'invited' | 'left' | 'removed',
      joinedAt: new Date(),
    })
  }
}

export function applyWorkspaceSnapshotWire(
  workspaceId: string,
  wire: SnapshotWire,
): WorkspaceSnapshotState {
  const expectedHash = P2pBridge.snapshotHash(wire.stateJson)
  if (expectedHash !== wire.stateHash) {
    throw new Error('快照哈希校验失败')
  }

  const state = JSON.parse(wire.stateJson) as WorkspaceSnapshotState
  applyWorkspaceSnapshotState(workspaceId, state)
  return state
}

export function loadSnapshotCompressed(workspaceId: string, snapshotSeq: number): Buffer | null {
  const filePath = snapshotFilePath(workspaceId, snapshotSeq)
  if (!existsSync(filePath)) return null
  return readFileSync(filePath)
}

export function shouldUseSnapshotSync(localSeq: number, remoteLatestSeq: number): boolean {
  if (remoteLatestSeq - localSeq >= P2P_SNAPSHOT_GAP_THRESHOLD) {
    return true
  }
  return localSeq === 0 && remoteLatestSeq > 0
}

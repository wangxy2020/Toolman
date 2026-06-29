import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import {
  P2pEventRepository,
  P2pMemberRepository,
  P2pSnapshotRepository,
  P2pWorkspaceRepository,
  type P2pSnapshotRow,
} from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import { getWorkspaceLatestSeq } from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  P2P_SNAPSHOT_INTERVAL,
  P2P_SNAPSHOT_RETAIN,
  snapshotDir,
  snapshotFilePath,
  type WorkspaceSnapshotState,
} from './p2p-snapshot-types'

function getSnapshotRepo(): P2pSnapshotRepository {
  return new P2pSnapshotRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
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

  const pruned = new P2pEventRepository(getDatabase()).deleteEventsBeforeSeq(
    workspaceId,
    snapshotSeq,
  )
  if (pruned > 0) {
    logStructured('p2p', 'info', `pruned ${pruned} events before seq ${snapshotSeq} for ${workspaceId}`)
  }

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
    logStructured('p2p', 'warn', `auto snapshot failed: ${message}`)
    return null
  }
}

export function getLatestWorkspaceSnapshot(workspaceId: string): P2pSnapshotRow | null {
  return getSnapshotRepo().findLatest(workspaceId)
}

export function loadSnapshotCompressed(workspaceId: string, snapshotSeq: number): Buffer | null {
  const filePath = snapshotFilePath(workspaceId, snapshotSeq)
  if (!existsSync(filePath)) return null
  return readFileSync(filePath)
}

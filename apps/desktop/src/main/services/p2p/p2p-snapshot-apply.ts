import {
  P2P_SNAPSHOT_GAP_THRESHOLD,
  type SnapshotWire,
  type WorkspaceSnapshotState,
} from './p2p-snapshot-types'
import { P2pBridge } from './p2p-bridge'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { ensureLinkedIdentityRow } from './p2p-linked-identity.service'
import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
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

  const localDeviceId = getP2pDeviceInfo().deviceId
  const localMemberBefore = memberRepo.findByWorkspaceAndDevice(workspaceId, localDeviceId)

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

  const localMemberAfter = memberRepo.findByWorkspaceAndDevice(workspaceId, localDeviceId)
  if (
    workspace.ownerDeviceId !== localDeviceId &&
    localMemberAfter?.status === 'active' &&
    localMemberBefore?.status !== 'active'
  ) {
    void import('./p2p-sync.service').then((module) => {
      module.scheduleJoinerEventCatchUp(workspaceId)
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

export function shouldUseSnapshotSync(localSeq: number, remoteLatestSeq: number): boolean {
  if (remoteLatestSeq - localSeq >= P2P_SNAPSHOT_GAP_THRESHOLD) {
    return true
  }
  return localSeq === 0 && remoteLatestSeq > 0
}

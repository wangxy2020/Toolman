import type { P2pMemberRole } from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { broadcastP2pMemberChanged } from './p2p-member-broadcast'
import { getMemberRepo, getWorkspaceRepo } from './p2p-member-shared'
import { encodeReplicationMessage } from './p2p-sync-protocol'

function scheduleJoinerActivationFollowUp(workspaceId: string): void {
  void import('./p2p-sync.service').then((module) =>
    module.awaitJoinerEventCatchUp(workspaceId, { force: true }),
  )
}

export function triggerJoinerResourceSyncAfterActivation(workspaceId: string): void {
  scheduleJoinerActivationFollowUp(workspaceId)
}

export function activateLocalMemberIfJoiner(input: {
  workspaceId: string
  deviceId: string
  displayName?: string
  role?: P2pMemberRole
  joinedAt?: Date
}): boolean {
  const localDeviceId = getP2pDeviceInfo().deviceId
  if (input.deviceId !== localDeviceId) {
    return false
  }

  const memberRepo = getMemberRepo()
  const existing = memberRepo.findByWorkspaceAndDevice(input.workspaceId, input.deviceId)
  if (!existing) {
    return false
  }

  if (existing.status === 'active') {
    scheduleJoinerActivationFollowUp(input.workspaceId)
    return true
  }

  memberRepo.update({
    id: existing.id,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.role ? { role: input.role } : {}),
    status: 'active',
    joinedAt: input.joinedAt ?? existing.joinedAt ?? new Date(),
  })

  broadcastP2pMemberChanged({ workspaceId: input.workspaceId, activated: true })
  scheduleJoinerActivationFollowUp(input.workspaceId)
  return true
}

export async function notifyJoinerMemberApproved(
  workspaceId: string,
  peerDeviceId: string,
  member: {
    id: string
    deviceId: string
    displayName: string
    role: P2pMemberRole
    identityId: string
  },
): Promise<void> {
  const payload = encodeReplicationMessage({
    type: 'member.approved',
    v: 2,
    workspaceId,
    member: {
      id: member.id,
      workspaceId,
      deviceId: member.deviceId,
      displayName: member.displayName,
      role: member.role,
      identityId: member.identityId,
    },
    at: Date.now(),
  })
  await P2pBridge.connectionSend(peerDeviceId, 'events', payload)
}

export function handleMemberApprovedWire(
  peerDeviceId: string,
  message: {
    workspaceId: string
    member: {
      id: string
      deviceId: string
      displayName: string
      role: string
      identityId?: string
    }
  },
): void {
  const workspace = getWorkspaceRepo().findById(message.workspaceId)
  if (!workspace || workspace.ownerDeviceId !== peerDeviceId) {
    return
  }

  const localDeviceId = getP2pDeviceInfo().deviceId
  if (message.member.deviceId !== localDeviceId) {
    return
  }

  const role =
    message.member.role === 'owner' ||
    message.member.role === 'admin' ||
    message.member.role === 'member' ||
    message.member.role === 'readonly'
      ? message.member.role
      : 'member'

  activateLocalMemberIfJoiner({
    workspaceId: message.workspaceId,
    deviceId: message.member.deviceId,
    displayName: message.member.displayName,
    role,
    joinedAt: new Date(),
  })
}

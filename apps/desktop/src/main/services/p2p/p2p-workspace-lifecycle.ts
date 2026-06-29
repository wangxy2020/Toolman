import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { appendP2pEvent } from './p2p-event.service'
import { recordMemberDepartureEvent } from './p2p-member-departure.service'
import { broadcastP2pMemberChanged } from './p2p-member-broadcast'
import { cleanupLocalMemberDeparture } from './p2p-workspace-member-cleanup.service'
import { replicateLocalP2pEvent } from './p2p-sync.service'
import { finalizeLocalWorkspaceDissolve } from './p2p-workspace-projection'
import {
  assertOwner,
  assertWorkspaceAccess,
  getMemberRepo,
  getWorkspaceRepo,
  resolveP2pWorkspaceStoragePath,
} from './p2p-workspace-access'

export function getP2pWorkspaceStoragePath(workspaceId: string): string {
  assertWorkspaceAccess(workspaceId)
  return resolveP2pWorkspaceStoragePath(workspaceId)
}

export async function deleteP2pWorkspace(id: string): Promise<void> {
  assertOwner(id)
  const device = getP2pDeviceInfo()
  const ownerMember = getMemberRepo().findByWorkspaceAndDevice(id, device.deviceId)
  if (!ownerMember) {
    throw new Error('群主成员记录不存在')
  }

  const event = await appendP2pEvent({
    workspaceId: id,
    resourceType: 'Workspace',
    resourceId: id,
    operatorId: ownerMember.id,
    eventType: 'Deleted',
    payload: { reason: 'dissolved' },
  })

  await replicateLocalP2pEvent(event)
  await finalizeLocalWorkspaceDissolve(id)
}

export async function leaveP2pWorkspace(id: string): Promise<void> {
  const row = getWorkspaceRepo().findById(id)
  if (!row) {
    throw new Error('群组不存在')
  }

  const device = getP2pDeviceInfo()
  if (row.ownerDeviceId === device.deviceId) {
    throw new Error('群主不能退出群组，请解散群组')
  }

  const member = getMemberRepo().findByWorkspaceAndDevice(id, device.deviceId)
  if (!member) {
    throw new Error('你不是该群组成员')
  }
  if (member.status === 'left' || member.status === 'removed') {
    return
  }

  if (member.status === 'active') {
    await recordMemberDepartureEvent({
      workspaceId: id,
      memberId: member.id,
      operatorId: member.id,
      reason: 'left',
      displayName: member.displayName,
      deviceId: member.deviceId,
    })
  } else {
    broadcastP2pMemberChanged({ workspaceId: id })
  }

  getMemberRepo().update({
    id: member.id,
    status: 'left',
  })
  await cleanupLocalMemberDeparture(id)
}

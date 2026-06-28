import { P2pEventRepository, P2pMemberRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getEventRepo(): P2pEventRepository {
  return new P2pEventRepository(getDatabase())
}

/** Map remote operator member id to this device's member row id (by deviceId). */
export function resolveLocalSharedByMemberId(
  workspaceId: string,
  operatorId: string,
  sourceDeviceId: string,
): string {
  const memberRepo = getMemberRepo()
  const direct = memberRepo.findById(operatorId)
  if (direct?.workspaceId === workspaceId) {
    return direct.id
  }

  const byDevice = memberRepo.findByWorkspaceAndDevice(workspaceId, sourceDeviceId)
  if (byDevice) {
    return byDevice.id
  }

  return operatorId
}

export function resolveSharedByMember(
  workspaceId: string,
  sharedBy: string,
): { id: string; displayName: string } | null {
  const memberRepo = getMemberRepo()
  const direct = memberRepo.findById(sharedBy)
  if (direct?.workspaceId === workspaceId) {
    return { id: direct.id, displayName: direct.displayName }
  }

  const event = getEventRepo().findLatestByOperatorId(workspaceId, sharedBy)
  if (!event?.sourceDeviceId) {
    return null
  }

  const byDevice = memberRepo.findByWorkspaceAndDevice(workspaceId, event.sourceDeviceId)
  if (!byDevice) {
    return null
  }

  return { id: byDevice.id, displayName: byDevice.displayName }
}

import { appendP2pEvent } from './p2p-event.service'
import { broadcastP2pMemberChanged } from './p2p-member-broadcast'

export async function recordMemberDepartureEvent(input: {
  workspaceId: string
  memberId: string
  operatorId: string
  reason: 'left' | 'removed'
  displayName?: string
  deviceId?: string
}): Promise<void> {
  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Member',
    resourceId: input.memberId,
    operatorId: input.operatorId,
    eventType: 'Left',
    payload: {
      member_id: input.memberId,
      reason: input.reason,
      display_name: input.displayName ?? null,
      device_id: input.deviceId ?? null,
    },
  })
  broadcastP2pMemberChanged({ workspaceId: input.workspaceId })
}

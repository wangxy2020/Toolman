import {
  canManageWorkspaceMembers,
  isSamePerson,
  isUsableMemberIdentityId,
  type P2pEventType,
} from '@toolman/shared'
import { getMemberRepo } from './p2p-member-shared'

export function isMemberManagementProposal(input: {
  resourceType: string
  eventType: string
}): boolean {
  return input.resourceType === 'Member' && (input.eventType === 'Left' || input.eventType === 'Updated')
}

export function authorizeMemberManagementProposal(input: {
  workspaceId: string
  senderDeviceId: string
  resourceId: string
  eventType: P2pEventType
  payload: Record<string, unknown>
}): { ok: true } | { ok: false; reason: string } {
  if (input.eventType !== 'Left' && input.eventType !== 'Updated') {
    return { ok: false, reason: 'unsupported' }
  }

  const memberRepo = getMemberRepo()
  const sender = memberRepo.findByWorkspaceAndDevice(input.workspaceId, input.senderDeviceId)
  const memberId =
    typeof input.payload.member_id === 'string' ? input.payload.member_id : input.resourceId
  const target = memberRepo.findById(memberId)
  if (!target || target.workspaceId !== input.workspaceId) {
    return { ok: false, reason: '成员不存在' }
  }

  const admitted =
    sender?.status === 'active' &&
    canManageWorkspaceMembers(sender.role) &&
    target.role !== 'owner' &&
    !(sender.role === 'admin' && target.role === 'admin') &&
    !isSamePerson(target, {
      memberId: sender.id,
      identityId: sender.identityId,
      deviceId: sender.deviceId,
    })
  if (!admitted) return { ok: false, reason: '无权管理该成员' }

  if (input.eventType === 'Updated') {
    const role = input.payload.role
    if (role !== 'admin' && role !== 'member' && role !== 'readonly') {
      return { ok: false, reason: '成员角色无效' }
    }
    if (sender?.role !== 'owner' && role === 'admin') {
      return { ok: false, reason: '无权设置管理员' }
    }
  }

  if (isUsableMemberIdentityId(target.identityId) && target.identityId === sender?.identityId) {
    return { ok: false, reason: '无权管理该成员' }
  }

  return { ok: true }
}

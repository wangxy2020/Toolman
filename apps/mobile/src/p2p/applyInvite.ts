import { isInviteExpired, resolveJoinedDeviceRole, resolvePersonDeviceMembership } from '@toolman/shared'
import type { GroupInvite, GroupMember, GroupWorkspace } from '../storage/groupChat'
import type { PendingP2pInvite } from './inviteParse'
import { localP2pClientDeviceKind } from './deviceKind'

export type InviteSelf = {
  identityId: string
  deviceId: string
  displayName: string
}

export type ApplyInviteResult = {
  groups: GroupWorkspace[]
  membersByGroup: Record<string, GroupMember[]>
  invitesByGroup: Record<string, GroupInvite>
  activeGroupId: string
}

function asRole(role: string | undefined): GroupMember['role'] {
  if (role === 'admin' || role === 'member' || role === 'readonly' || role === 'owner') {
    return role
  }
  return 'member'
}

function workspaceIdFromInvite(invite: PendingP2pInvite): string {
  if (invite.workspaceId?.trim()) return invite.workspaceId.trim()
  const token = invite.token || invite.raw
  return `invite:${token.slice(0, 32)}`
}

export function applyPendingInvite(input: {
  groups: GroupWorkspace[]
  membersByGroup: Record<string, GroupMember[]>
  invitesByGroup: Record<string, GroupInvite>
  invite: PendingP2pInvite
  self: InviteSelf
}): ApplyInviteResult {
  if (isInviteExpired(input.invite.expiresAt)) {
    throw new Error('邀请码已过期')
  }
  const now = Date.now()
  const workspaceId = workspaceIdFromInvite(input.invite)
  const workspaceName = input.invite.workspaceName?.trim() || '待加入群组'
  const existing = input.groups.find((group) => group.id === workspaceId)
  const group: GroupWorkspace = {
    id: workspaceId,
    name: workspaceName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    origin: 'desktop',
    ownerIdentityId: input.invite.ownerIdentityId ?? existing?.ownerIdentityId,
    ownerDeviceId: input.invite.ownerDeviceId ?? existing?.ownerDeviceId,
  }

  const groups = [group, ...input.groups.filter((item) => item.id !== workspaceId)]
  const previousMembers = input.membersByGroup[workspaceId] ?? []
  const members: GroupMember[] = [...previousMembers]

  if (input.invite.ownerDeviceId || input.invite.ownerIdentityId) {
    const ownerDeviceId = input.invite.ownerDeviceId ?? input.invite.ownerIdentityId ?? 'owner'
    const hasOwner = members.some(
      (member) =>
        member.deviceId === ownerDeviceId ||
        (input.invite.ownerIdentityId && member.identityId === input.invite.ownerIdentityId),
    )
    if (!hasOwner) {
      members.unshift({
        id: ownerDeviceId,
        displayName: input.invite.ownerDisplayName?.trim() || '群主',
        role: 'owner',
        deviceId: ownerDeviceId,
        identityId: input.invite.ownerIdentityId,
        deviceKind: 'desktop',
        online: false,
        status: 'active',
      })
    }
  }

  const selfIndex = members.findIndex((member) => member.deviceId === input.self.deviceId)
  const sibling = members.find(
    (member) =>
      member.deviceId !== input.self.deviceId &&
      Boolean(input.self.identityId) &&
      member.identityId === input.self.identityId,
  )
  const inherited = resolvePersonDeviceMembership({
    inviteRole: asRole(input.invite.role),
    sibling: sibling ? { role: sibling.role, status: sibling.status } : null,
  })
  const selfMember: GroupMember = {
    id: input.self.deviceId,
    displayName: input.self.displayName,
    role: inherited.role,
    deviceId: input.self.deviceId,
    identityId: input.self.identityId,
    deviceKind: localP2pClientDeviceKind(),
    online: true,
    status: inherited.status,
  }
  if (selfIndex >= 0) {
    const current = members[selfIndex]!
    members[selfIndex] = {
      ...current,
      ...selfMember,
      status: current.status === 'active' ? 'active' : inherited.status,
      role: resolveJoinedDeviceRole({
        inheritedRole: inherited.role,
        requestedRole: asRole(input.invite.role),
        joinerIdentityId: input.self.identityId,
        ownerIdentityId: input.invite.ownerIdentityId,
        ownerDeviceId: input.invite.ownerDeviceId,
        sibling,
      }),
    }
  } else {
    members.push(selfMember)
  }

  const invite: GroupInvite = {
    token: input.invite.token,
    url: input.invite.raw,
    expiresAt: input.invite.expiresAt ?? now + 72 * 60 * 60 * 1000,
  }

  return {
    groups,
    membersByGroup: { ...input.membersByGroup, [workspaceId]: members },
    invitesByGroup: { ...input.invitesByGroup, [workspaceId]: invite },
    activeGroupId: workspaceId,
  }
}

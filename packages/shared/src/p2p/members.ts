import type { P2pMemberRole, P2pMemberStatus } from './types.js'

export type IdentityMemberLike = {
  id?: string
  identityId?: string
  deviceId: string
  status?: string
  role?: string
  displayName?: string
  online?: boolean
}

export type PersonSelfRef = {
  memberId?: string | null
  identityId?: string | null
  deviceId?: string | null
}

export type GroupedIdentityMembers<T extends IdentityMemberLike> = {
  identityId: string
  devices: T[]
  displayName: string
  role: T['role']
  online: boolean
  status: 'active' | 'invited'
  primary: T
}

const MEMBER_ROLE_RANK: Record<string, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  readonly: 0,
}

/** Placeholder used when a device has no real user identity yet. Do not group people by this. */
export const UNKNOWN_MEMBER_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

export function isUsableMemberIdentityId(identityId?: string | null): boolean {
  const value = identityId?.trim() ?? ''
  return value.length > 0 && value !== UNKNOWN_MEMBER_IDENTITY_ID
}

export function memberIdentityKey(member: IdentityMemberLike): string {
  return isUsableMemberIdentityId(member.identityId) ? member.identityId!.trim() : member.deviceId
}

export function groupMembersByIdentity<T extends IdentityMemberLike>(
  members: T[],
): Array<{ identityId: string; devices: T[] }> {
  const groups = new Map<string, T[]>()
  for (const member of members) {
    const key = memberIdentityKey(member)
    const list = groups.get(key) ?? []
    list.push(member)
    groups.set(key, list)
  }
  return Array.from(groups, ([identityId, devices]) => ({ identityId, devices }))
}

export function higherMemberRole<R extends string>(left: R, right: R): R {
  return (MEMBER_ROLE_RANK[left] ?? 0) >= (MEMBER_ROLE_RANK[right] ?? 0) ? left : right
}

export function isSamePerson(member: IdentityMemberLike, self: PersonSelfRef): boolean {
  if (self.deviceId && member.deviceId === self.deviceId) return true
  if (self.memberId && member.id === self.memberId) return true
  const identityId = member.identityId?.trim()
  if (
    isUsableMemberIdentityId(self.identityId) &&
    isUsableMemberIdentityId(identityId) &&
    identityId === self.identityId
  ) {
    return true
  }
  if (isUsableMemberIdentityId(self.identityId) && member.id === self.identityId) return true
  return false
}

export function collectPersonMemberIds<T extends IdentityMemberLike & { id: string }>(
  members: T[],
  self: PersonSelfRef,
): string[] {
  return members.filter((member) => isSamePerson(member, self)).map((member) => member.id)
}

export type WorkspaceOwnerRef = {
  identityId?: string | null
  deviceId?: string | null
}

const PLACEHOLDER_MEMBER_NAME =
  /^(用户[A-Za-z0-9]+|P2P用户.*|群主|本地用户|远程用户|我|未知成员|未知用户)$/i

export function isPlaceholderMemberName(name?: string | null): boolean {
  const value = name?.trim() ?? ''
  return value.length === 0 || PLACEHOLDER_MEMBER_NAME.test(value)
}

export function preferMemberDisplayName(...names: Array<string | undefined | null>): string {
  const cleaned = names.map((name) => name?.trim()).filter((name): name is string => Boolean(name))
  return cleaned.find((name) => !isPlaceholderMemberName(name)) ?? cleaned[0] ?? ''
}

export function isWorkspaceOwnerPerson(
  devices: IdentityMemberLike[],
  owner?: WorkspaceOwnerRef,
): boolean {
  if (!owner) return devices.some((device) => device.role === 'owner')
  return devices.some(
    (device) =>
      (isUsableMemberIdentityId(owner.identityId) &&
        isUsableMemberIdentityId(device.identityId) &&
        device.identityId === owner.identityId) ||
      (Boolean(owner.deviceId) && device.deviceId === owner.deviceId),
  )
}

export function resolveWorkspacePersonRole(
  devices: IdentityMemberLike[],
  owner?: WorkspaceOwnerRef,
): string {
  if (isWorkspaceOwnerPerson(devices, owner)) return 'owner'
  const roles = devices
    .map((device) => device.role)
    .filter((role): role is string => Boolean(role) && role !== 'owner')
  if (roles.length === 0) return 'member'
  return roles.reduce((left, right) => higherMemberRole(left, right))
}

export function groupVisibleMembersByPerson<T extends IdentityMemberLike>(
  members: T[],
  owner?: WorkspaceOwnerRef,
): Array<GroupedIdentityMembers<T>> {
  const visible = members.filter(
    (member) => !member.status || member.status === 'active' || member.status === 'invited',
  )
  return groupMembersByIdentity(visible).map(({ identityId, devices }) => {
    const primary = devices.find((item) => item.status === 'active') ?? devices[0]!
    return {
      identityId,
      devices,
      displayName:
        preferMemberDisplayName(...devices.map((item) => item.displayName)) || identityId,
      role: resolveWorkspacePersonRole(devices, owner),
      online: devices.some((item) => item.online),
      status: devices.some((item) => item.status === 'active') ? 'active' : 'invited',
      primary,
    }
  })
}

/** A second device of an existing person inherits that person's role; it does not join as a new seat. */
export function resolvePersonDeviceMembership(input: {
  inviteRole: P2pMemberRole
  sibling?: { role: P2pMemberRole; status?: string | null } | null
}): { role: P2pMemberRole; status: Extract<P2pMemberStatus, 'active' | 'invited'> } {
  if (!input.sibling) {
    return { role: input.inviteRole, status: 'invited' }
  }
  return {
    role: input.sibling.role,
    status: input.sibling.status === 'active' ? 'active' : 'invited',
  }
}

export function countDistinctMemberIdentities(
  members: IdentityMemberLike[],
  status?: string,
): number {
  const ids = new Set<string>()
  for (const member of members) {
    if (status && member.status && member.status !== status) continue
    ids.add(memberIdentityKey(member))
  }
  return ids.size
}

export function identityAlreadyPresent(
  members: IdentityMemberLike[],
  identityId: string,
  status?: string,
): boolean {
  const wanted = identityId.trim()
  if (!isUsableMemberIdentityId(wanted)) return false
  return members.some((member) => {
    if (status && member.status && member.status !== status) return false
    return member.identityId?.trim() === wanted
  })
}

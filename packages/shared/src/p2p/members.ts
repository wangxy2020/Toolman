import type { P2pClientDeviceKind, P2pMemberRole, P2pMemberStatus } from './types.js'

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

/** Skip the unknown placeholder so two guests are not treated as the same person. */
export function identityIdForSiblingLookup(identityId?: string | null): string | null {
  const value = identityId?.trim() ?? ''
  return isUsableMemberIdentityId(value) ? value : null
}

export function preferUsableMemberIdentityId(
  ...ids: Array<string | null | undefined>
): string | undefined {
  return ids.map((id) => id?.trim()).find((id) => isUsableMemberIdentityId(id))
}

export function parseP2pClientDeviceKind(value: unknown): P2pClientDeviceKind | undefined {
  if (value === 'desktop' || value === 'mobile' || value === 'web') return value
  return undefined
}

export function inferMemberDeviceKind(
  deviceId: string,
  explicit?: P2pClientDeviceKind | null,
): P2pClientDeviceKind {
  const parsed = parseP2pClientDeviceKind(explicit)
  if (parsed) return parsed
  if (deviceId.startsWith('web-')) return 'web'
  if (deviceId.startsWith('mobile-')) return 'mobile'
  return 'desktop'
}

/** Mailbox / web clients poll about every 15s; keep them online across a few missed ticks. */
export const P2P_MAILBOX_PRESENCE_TTL_MS = 45_000

export function isMemberRecentlySeen(lastSeenAt?: number | null, now = Date.now()): boolean {
  if (!lastSeenAt || lastSeenAt <= 0) return false
  return now - lastSeenAt <= P2P_MAILBOX_PRESENCE_TTL_MS
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

/** Local membership for this login: prefer this device, then any device of the same person. */
export function findSelfWorkspaceMember<T extends IdentityMemberLike>(
  members: T[],
  self: PersonSelfRef,
): T | undefined {
  if (self.deviceId) {
    const byDevice = members.find((member) => member.deviceId === self.deviceId)
    if (byDevice) return byDevice
  }
  return members.find((member) => isSamePerson(member, self))
}

function findMemberBySenderId<T extends IdentityMemberLike & { id: string }>(
  members: T[],
  senderId: string,
): T | undefined {
  return (
    members.find((member) => member.id === senderId) ??
    members.find((member) => member.deviceId === senderId) ??
    members.find(
      (member) => isUsableMemberIdentityId(member.identityId) && member.identityId === senderId,
    )
  )
}

/** True when this group-chat sender is the local person (any of their devices). */
export function isOwnGroupChatSender(
  senderMemberId: string | null | undefined,
  members: Array<IdentityMemberLike & { id: string }>,
  self: PersonSelfRef,
): boolean {
  const senderId = senderMemberId?.trim() ?? ''
  if (!senderId) return false
  if (self.memberId && senderId === self.memberId) return true
  if (self.deviceId && senderId === self.deviceId) return true
  if (isUsableMemberIdentityId(self.identityId) && senderId === self.identityId) return true
  const senderMember = findMemberBySenderId(members, senderId)
  if (senderMember && isSamePerson(senderMember, self)) return true
  return collectPersonMemberIds(members, self).includes(senderId)
}

export type WorkspaceOwnerRef = {
  identityId?: string | null
  deviceId?: string | null
}

const PLACEHOLDER_MEMBER_NAME =
  /^(用户[A-Za-z0-9]+|P2P用户.*|群主|本地用户|远程用户|我|未知成员|未知用户)$/i
const IDENTITY_LIKE_NAME = /^(ag-|fb-)[^\s]+$/i
const UUID_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPlaceholderMemberName(name?: string | null): boolean {
  const value = name?.trim() ?? ''
  if (value.length === 0) return true
  return PLACEHOLDER_MEMBER_NAME.test(value) || IDENTITY_LIKE_NAME.test(value) || UUID_NAME.test(value)
}

export function preferMemberDisplayName(...names: Array<string | undefined | null>): string {
  const cleaned = names.map((name) => name?.trim()).filter((name): name is string => Boolean(name))
  return cleaned.find((name) => !isPlaceholderMemberName(name)) ?? cleaned[0] ?? ''
}

export const DEFAULT_PEER_MEMBER_NAME = '成员'

/** Roster / chat label for someone else: profile 显示名称. Placeholders become 「成员」. */
export function resolvePeerMemberDisplayName(
  ...names: Array<string | undefined | null>
): string {
  const cleaned = names.map((name) => name?.trim()).filter((name): name is string => Boolean(name))
  return cleaned.find((name) => !isPlaceholderMemberName(name)) || DEFAULT_PEER_MEMBER_NAME
}

export function resolveLivePeerMemberDisplayName<T extends IdentityMemberLike & { id: string }>(
  members: T[],
  senderId: string | undefined,
  storedName?: string | null,
): string {
  const member = senderId?.trim() ? findMemberBySenderId(members, senderId.trim()) : undefined
  const personNames = member
    ? members.filter((item) => isSamePerson(item, member)).map((item) => item.displayName)
    : []
  return resolvePeerMemberDisplayName(...personNames, member?.displayName, storedName)
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
      displayName: resolvePeerMemberDisplayName(...devices.map((item) => item.displayName)),
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

/**
 * Keep owner on a second device of the owner person (desktop + phone + web).
 * Only demote a claimed owner role when this login is not the workspace owner.
 */
export function resolveJoinedDeviceRole(input: {
  inheritedRole: P2pMemberRole
  requestedRole: P2pMemberRole
  joinerIdentityId?: string | null
  ownerIdentityId?: string | null
  ownerDeviceId?: string | null
  sibling?: { role?: string | null; deviceId?: string | null; identityId?: string | null } | null
}): P2pMemberRole {
  if (input.inheritedRole !== 'owner') return input.inheritedRole
  const joiner = input.joinerIdentityId?.trim() ?? ''
  const owner = input.ownerIdentityId?.trim() ?? ''
  const isOwnerPerson =
    (isUsableMemberIdentityId(joiner) && isUsableMemberIdentityId(owner) && joiner === owner) ||
    input.sibling?.role === 'owner' ||
    Boolean(input.ownerDeviceId && input.sibling?.deviceId === input.ownerDeviceId) ||
    (isUsableMemberIdentityId(input.sibling?.identityId) &&
      isUsableMemberIdentityId(owner) &&
      input.sibling?.identityId === owner)
  if (isOwnerPerson) return 'owner'
  return input.requestedRole === 'owner' ? 'member' : input.requestedRole
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

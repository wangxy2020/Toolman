import {
  canManageWorkspaceMembers,
  collectPersonMemberIds,
  groupVisibleMembersByPerson,
  isSamePerson,
  type P2pMember,
  type P2pMemberRole,
  type PersonSelfRef,
} from '@toolman/shared'

export type GroupedP2pPerson = {
  identityId: string
  devices: P2pMember[]
  displayName: string
  role: P2pMemberRole
  online: boolean
  status: 'active' | 'invited'
  primary: P2pMember
}

export function groupP2pMembersByPerson(
  members: P2pMember[],
  owner?: { identityId?: string | null; deviceId?: string | null },
): GroupedP2pPerson[] {
  return groupVisibleMembersByPerson(members, owner).map((person) => ({
    identityId: person.identityId,
    devices: person.devices,
    displayName: person.displayName,
    role: (person.role ?? person.primary.role) as P2pMemberRole,
    online: person.online,
    status: person.status,
    primary: person.primary,
  }))
}

/** The device this person is currently using: local device, else an online device, else primary. */
export function selectCurrentMemberDevice(
  person: GroupedP2pPerson,
  self: PersonSelfRef,
): P2pMember {
  const local = person.devices.find((device) => self.deviceId && device.deviceId === self.deviceId)
  if (local) return local
  const online = person.devices
    .filter((device) => device.online)
    .sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0))
  return online[0] ?? person.primary
}

export function memberSelfRef(
  selfMemberId: string | null,
  selfIdentityId?: string | null,
  selfDeviceId?: string | null,
): PersonSelfRef {
  return {
    memberId: selfMemberId,
    identityId: selfIdentityId,
    deviceId: selfDeviceId,
  }
}

export function canManageTargetMember(
  actorRole: P2pMemberRole | undefined,
  target: P2pMember,
  self: PersonSelfRef | string | null,
): boolean {
  if (!canManageWorkspaceMembers(actorRole)) return false
  const selfRef = typeof self === 'string' || self == null ? { memberId: self } : self
  if (isSamePerson(target, selfRef)) return false
  if (target.role === 'owner') return false
  if (actorRole === 'admin' && target.role === 'admin') return false
  return true
}

export function canManageTargetPerson(
  actorRole: P2pMemberRole | undefined,
  person: GroupedP2pPerson,
  self: PersonSelfRef,
): boolean {
  if (person.devices.some((device) => isSamePerson(device, self))) return false
  return canManageTargetMember(actorRole, { ...person.primary, role: person.role }, self)
}

export function getAssignableRoles(
  actorRole: P2pMemberRole | undefined,
  target: P2pMember,
  self: PersonSelfRef | string | null,
): P2pMemberRole[] {
  if (!canManageTargetMember(actorRole, target, self)) return []

  const roles: P2pMemberRole[] = ['member', 'readonly']
  if (actorRole === 'owner') {
    roles.unshift('admin')
  }
  return roles
}

export function selfMemberIdsForChat(
  members: P2pMember[],
  selfMemberId: string | null,
  selfIdentityId?: string | null,
  selfDeviceId?: string | null,
): string[] {
  return collectPersonMemberIds(members, {
    memberId: selfMemberId,
    identityId: selfIdentityId,
    deviceId: selfDeviceId,
  })
}

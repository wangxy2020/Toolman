import {
  isBuiltinDefaultP2pGroupName,
  preferMemberDisplayName,
  P2pGroupSyncPayloadSchema,
  type P2pGroupSyncMember,
  type SyncChange,
} from '@toolman/shared'
import type { GroupMember, GroupWorkspace } from '../storage/groupChat'

export function rosterMemberFromSync(
  member: P2pGroupSyncMember,
  previous?: GroupMember,
): GroupMember {
  return {
    id: member.id,
    displayName: preferMemberDisplayName(member.displayName, previous?.displayName),
    role: member.role,
    deviceId: member.deviceId,
    identityId: member.identityId,
    deviceKind: member.deviceKind,
    online: member.online ?? previous?.online ?? false,
    status: member.status === 'invited' ? 'invited' : 'active',
  }
}

export function applyMemberRoster(
  current: GroupMember[],
  incoming: Array<P2pGroupSyncMember | GroupMember>,
  selfDeviceId?: string,
): GroupMember[] {
  const previousByDevice = new Map(current.map((member) => [member.deviceId, member]))
  const next = incoming.map((member) => rosterMemberFromSync(member, previousByDevice.get(member.deviceId)))
  const incomingDeviceIds = new Set(next.map((member) => member.deviceId))
  const localExtras = current.filter(
    (member) =>
      (member.status === 'invited' || member.deviceId === selfDeviceId) &&
      !incomingDeviceIds.has(member.deviceId),
  )
  return [...next, ...localExtras]
}

export function sameGroupMemberRoster(left: GroupMember[], right: GroupMember[]): boolean {
  if (left.length !== right.length) return false
  return left.every((member, index) => {
    const other = right[index]
    return Boolean(
      other &&
        member.id === other.id &&
        member.deviceId === other.deviceId &&
        member.identityId === other.identityId &&
        member.displayName === other.displayName &&
        member.role === other.role &&
        member.status === other.status &&
        member.deviceKind === other.deviceKind &&
        member.online === other.online,
    )
  })
}

export function patchGroupOwnerFromRoster(
  groups: GroupWorkspace[],
  workspaceId: string,
  owner: { identityId?: string; deviceId?: string },
): GroupWorkspace[] {
  let changed = false
  const next = groups.map((group) => {
    if (group.id !== workspaceId) return group
    const ownerIdentityId = owner.identityId ?? group.ownerIdentityId
    const ownerDeviceId = owner.deviceId ?? group.ownerDeviceId
    if (ownerIdentityId === group.ownerIdentityId && ownerDeviceId === group.ownerDeviceId) {
      return group
    }
    changed = true
    return { ...group, ownerIdentityId, ownerDeviceId }
  })
  return changed ? next : groups
}

export function mergeGroupsFromSyncChanges(
  groups: GroupWorkspace[],
  changes: SyncChange[],
): GroupWorkspace[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  for (const change of changes) {
    if (change.entityKind !== 'p2p_group') continue
    if (change.op === 'delete') {
      const existing = byId.get(change.entityId)
      if (existing && existing.updatedAt > change.updatedAt) continue
      byId.delete(change.entityId)
      continue
    }
    const existing = byId.get(change.entityId)
    if (existing && existing.updatedAt > change.updatedAt) continue
    const parsed = P2pGroupSyncPayloadSchema.safeParse(change.payload ?? {})
    if (!parsed.success) continue
    if (isBuiltinDefaultP2pGroupName(parsed.data.name)) {
      byId.delete(change.entityId)
      continue
    }
    byId.set(change.entityId, {
      id: change.entityId,
      name: parsed.data.name,
      description: parsed.data.description,
      createdAt: parsed.data.createdAt,
      updatedAt: change.updatedAt,
      origin: 'desktop',
      ownerIdentityId: parsed.data.ownerIdentityId ?? existing?.ownerIdentityId,
      ownerDeviceId: parsed.data.ownerDeviceId ?? existing?.ownerDeviceId,
    })
  }
  return Array.from(byId.values())
    .filter((group) => !isBuiltinDefaultP2pGroupName(group.name))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function mergeJoinedDesktopGroups(
  groups: GroupWorkspace[],
  incoming: GroupWorkspace[],
): GroupWorkspace[] {
  if (incoming.length === 0) return groups
  const byId = new Map(groups.map((group) => [group.id, group]))
  for (const group of incoming) {
    if (isBuiltinDefaultP2pGroupName(group.name)) continue
    const existing = byId.get(group.id)
    byId.set(
      group.id,
      existing
        ? {
            ...existing,
            ...group,
            name: group.name.trim() || existing.name,
            description: group.description ?? existing.description,
            ownerIdentityId: group.ownerIdentityId ?? existing.ownerIdentityId,
            ownerDeviceId: group.ownerDeviceId ?? existing.ownerDeviceId,
            origin: 'desktop',
          }
        : { ...group, origin: 'desktop' },
    )
  }
  return Array.from(byId.values())
    .filter((group) => !isBuiltinDefaultP2pGroupName(group.name))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function mergeGroupMembersFromSyncChanges(
  membersByGroup: Record<string, GroupMember[]>,
  changes: SyncChange[],
): Record<string, GroupMember[]> {
  const next = { ...membersByGroup }
  for (const change of changes) {
    if (change.entityKind !== 'p2p_group') continue
    if (change.op === 'delete') {
      delete next[change.entityId]
      continue
    }
    const parsed = P2pGroupSyncPayloadSchema.safeParse(change.payload ?? {})
    if (!parsed.success || !parsed.data.members) continue
    if (isBuiltinDefaultP2pGroupName(parsed.data.name)) {
      delete next[change.entityId]
      continue
    }
    const previousByDevice = new Map(
      (next[change.entityId] ?? []).map((member) => [member.deviceId, member]),
    )
    const incoming = parsed.data.members.map((member) =>
      rosterMemberFromSync(member, previousByDevice.get(member.deviceId)),
    )
    const incomingDeviceIds = new Set(incoming.map((member) => member.deviceId))
    const localExtras = (next[change.entityId] ?? []).filter(
      (member) => member.status === 'invited' && !incomingDeviceIds.has(member.deviceId),
    )
    next[change.entityId] = [...incoming, ...localExtras]
  }
  return next
}

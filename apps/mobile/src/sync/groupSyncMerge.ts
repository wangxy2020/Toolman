import {
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
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt)
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

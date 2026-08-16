import type { P2pGroupSyncMember, P2pMemberRole, P2pMemberStatus } from '@toolman/shared'
import type { P2pWorkspaceMemberRow } from '@toolman/db'
import {
  getIdentityDisplayName,
  getMemberRepo,
  mapMemberRow,
} from './p2p-member-shared-repos'

/** Prefer stored display name; fall back to local identity name for this device. */
export function resolveStoredMemberDisplayName(
  row: Pick<P2pWorkspaceMemberRow, 'displayName' | 'deviceId'>,
  localDeviceId: string,
): string {
  const trimmed = row.displayName?.trim()
  if (trimmed) return trimmed
  if (row.deviceId === localDeviceId) return getIdentityDisplayName()
  return row.displayName || '成员'
}

export function touchMemberLastSeen(workspaceId: string, deviceId: string): void {
  const existing = getMemberRepo().findByWorkspaceAndDevice(workspaceId, deviceId)
  if (!existing) return
  getMemberRepo().update({
    id: existing.id,
    lastSeenAt: new Date(),
  })
}

export function listWorkspaceMemberRoster(workspaceId: string): P2pGroupSyncMember[] {
  return getMemberRepo()
    .listByWorkspace(workspaceId)
    .filter((row) => row.status === 'active' || row.status === 'invited')
    .map((row) => {
      const member = mapMemberRow(row, workspaceId)
      return {
        id: member.id,
        deviceId: member.deviceId,
        identityId: member.identityId,
        displayName: member.displayName,
        role: member.role,
        status: member.status === 'active' || member.status === 'invited' ? member.status : 'invited',
        online: member.online,
      }
    })
}

/** Another active/invited device already registered under the same identity. */
export function findIdentitySibling(
  workspaceId: string,
  identityId: string,
  excludeDeviceId: string,
): P2pWorkspaceMemberRow | null {
  const siblings = getMemberRepo()
    .listByWorkspaceAndIdentity(workspaceId, identityId)
    .filter(
      (row) =>
        row.deviceId !== excludeDeviceId &&
        (row.status === 'active' || row.status === 'invited'),
    )
  return siblings[0] ?? null
}

/**
 * When attaching a second device for the same person, reuse the sibling role/status;
 * otherwise treat as a fresh invite for the requested role.
 */
export function membershipFromIdentitySibling(
  requestedRole: P2pMemberRole,
  sibling: Pick<P2pWorkspaceMemberRow, 'role' | 'status'> | null,
): { role: P2pMemberRole; status: P2pMemberStatus } {
  if (sibling) {
    return { role: sibling.role, status: sibling.status }
  }
  return { role: requestedRole, status: 'invited' }
}

/**
 * Seat limit is by distinct active identities. Rejoining / same-identity devices
 * that already occupy a seat do not consume an extra seat.
 */
export function hasWorkspaceMemberCapacity(input: {
  workspaceId: string
  maxMembers: number
  joinerIdentityId: string
  existingStatus?: P2pMemberStatus | null
}): boolean {
  if (input.maxMembers <= 0) return true
  if (input.existingStatus === 'active' || input.existingStatus === 'invited') {
    return true
  }
  const activeIdentities = getMemberRepo().countActiveIdentitiesByWorkspace(input.workspaceId)
  const alreadyCounted = getMemberRepo()
    .listByWorkspaceAndIdentity(input.workspaceId, input.joinerIdentityId)
    .some((row) => row.status === 'active')
  if (alreadyCounted) return true
  return activeIdentities < input.maxMembers
}

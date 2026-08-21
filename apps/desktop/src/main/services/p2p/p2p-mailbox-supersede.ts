import {
  inferMemberDeviceKind,
  mailboxFirstSiblingsToLeave,
  parseDeviceKindFromCertJson,
  parseP2pClientDeviceKind,
  type P2pClientDeviceKind,
} from '@toolman/shared'
import { getMemberRepo } from './p2p-member-shared-repos'

/** Soft-leave superseded same-kind web/phone rows so the roster is not a graveyard of UUIDs. */
export function supersedeStaleMailboxFirstDevices(input: {
  workspaceId: string
  keepDeviceId: string
  keepKind: P2pClientDeviceKind
}): number {
  const keep = getMemberRepo().findByWorkspaceAndDevice(input.workspaceId, input.keepDeviceId)
  const identityId = keep?.identityId?.trim()
  if (!identityId) return 0
  const siblings = getMemberRepo()
    .listByWorkspaceAndIdentity(input.workspaceId, identityId)
    .map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      status: row.status,
      deviceKind: inferMemberDeviceKind(row.deviceId, parseDeviceKindFromCertJson(row.certJson)),
    }))
  const stale = mailboxFirstSiblingsToLeave({
    keepDeviceId: input.keepDeviceId,
    keepKind: input.keepKind,
    siblings,
  })
  for (const member of stale) {
    if (!member.id) continue
    getMemberRepo().update({ id: member.id, status: 'left' })
  }
  return stale.length
}

export function mailboxSessionDeviceKind(
  deviceId: string,
  explicit?: string | null,
): P2pClientDeviceKind {
  return inferMemberDeviceKind(deviceId, parseP2pClientDeviceKind(explicit))
}

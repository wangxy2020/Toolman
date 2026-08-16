import {
  P2pMemberRemoveInputSchema,
  P2pMemberUpdateRoleInputSchema,
  type P2pMember,
  type P2pMemberRole,
} from '@toolman/shared'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  assertCanManageMembers as assertCanManageMembersGuard,
  assertWorkspaceMembershipAccess,
} from './p2p-permission.guard'
import {
  ensureOwnerMemberRecord,
  getIdentityDisplayName,
  getMemberRepo,
  getWorkspaceRepo,
  mapMemberRow,
  toWorkspaceDto,
} from './p2p-member-shared-repos'
import { publishP2pGroupSyncChange } from '../group-mobile-sync'

export { ensureOwnerMemberRecord } from './p2p-member-shared-repos'
import { recordMemberDepartureEvent } from './p2p-member-departure.service'
import { fireAndForget } from '../../lib/fire-and-forget'
import { P2pMemberLimitError } from './p2p-member-join/errors'
import { flushPendingJoinNotification } from './p2p-member-join/join-notify'
import { joinP2pWorkspace } from './p2p-member-join/join-workspace'
import {
  activateMemberAfterOwnerTrust,
  applyRemoteMemberJoin,
} from './p2p-member-join/remote-join'
import {
  ensureMemberConnectsToOwner,
  reconcileOwnerWorkspaceMembers,
  runMemberOwnerConnectTick,
  runOwnerPeerReconcileTick,
} from './p2p-member-reconcile-owner'
import {
  handleMemberSyncRequest,
  handleMemberSyncResponse,
} from './p2p-member-reconcile-sync'

export { P2pMemberVipRequiredError } from './p2p-workspace-vip-pool.service'
export {
  activateMemberAfterOwnerTrust,
  applyRemoteMemberJoin,
  flushPendingJoinNotification,
  joinP2pWorkspace,
  P2pMemberLimitError,
}
export {
  ensureMemberConnectsToOwner,
  handleMemberSyncRequest,
  handleMemberSyncResponse,
  reconcileOwnerWorkspaceMembers,
  runOwnerPeerReconcileTick,
  runMemberOwnerConnectTick,
}

function ensureLocalMemberDisplayNameForWorkspace(workspaceId: string): void {
  const localDeviceId = getP2pDeviceInfo().deviceId
  const identityName = getIdentityDisplayName()
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, localDeviceId)
  if (member && member.displayName !== identityName) {
    getMemberRepo().update({ id: member.id, displayName: identityName })
  }
}

function assertCanManageMembers(
  workspaceId: string,
  targetMemberId: string,
) {
  return assertCanManageMembersGuard(workspaceId, targetMemberId)
}

export function listP2pMembers(workspaceId: string): P2pMember[] {
  assertWorkspaceMembershipAccess(workspaceId)
  ensureOwnerMemberRecord(workspaceId)
  ensureLocalMemberDisplayNameForWorkspace(workspaceId)
  return getMemberRepo()
    .listByWorkspace(workspaceId)
    .filter((row) => row.status === 'active' || row.status === 'invited')
    .map((row) => mapMemberRow(row, workspaceId))
}

export async function prepareP2pMemberList(workspaceId: string): Promise<P2pMember[]> {
  assertWorkspaceMembershipAccess(workspaceId)
  ensureOwnerMemberRecord(workspaceId)
  fireAndForget('p2p', ensureMemberConnectsToOwner(workspaceId))
  fireAndForget('p2p', reconcileOwnerWorkspaceMembers(workspaceId))
  return listP2pMembers(workspaceId)
}

function listVisiblePersonDevices(workspaceId: string, identityId: string) {
  return getMemberRepo()
    .listByWorkspaceAndIdentity(workspaceId, identityId)
    .filter((row) => row.status === 'active' || row.status === 'invited')
}

export async function removeP2pMember(rawInput: unknown): Promise<void> {
  const input = P2pMemberRemoveInputSchema.parse(rawInput)
  const { actor, target } = assertCanManageMembers(input.workspaceId, input.memberId)
  const devices = listVisiblePersonDevices(input.workspaceId, target.identityId)
  const targets = devices.length > 0 ? devices : [target]

  for (const device of targets) {
    await recordMemberDepartureEvent({
      workspaceId: input.workspaceId,
      memberId: device.id,
      operatorId: actor.id,
      reason: 'removed',
      displayName: device.displayName,
      deviceId: device.deviceId,
    })
    getMemberRepo().update({
      id: device.id,
      status: 'removed',
    })
  }

  const workspace = getWorkspaceRepo().findById(input.workspaceId)
  if (workspace) publishP2pGroupSyncChange(toWorkspaceDto(workspace))
}

export function updateP2pMemberRole(rawInput: unknown): P2pMember {
  const input = P2pMemberUpdateRoleInputSchema.parse(rawInput)
  const { target } = assertCanManageMembers(input.workspaceId, input.memberId)

  if (input.role === 'owner') {
    throw new Error('不能将成员设为群主')
  }

  const devices = listVisiblePersonDevices(input.workspaceId, target.identityId)
  const targets = devices.length > 0 ? devices : [target]
  let updated = target
  for (const device of targets) {
    updated =
      getMemberRepo().update({
        id: device.id,
        role: input.role as P2pMemberRole,
      }) ?? updated
  }

  const workspace = getWorkspaceRepo().findById(input.workspaceId)
  if (workspace) publishP2pGroupSyncChange(toWorkspaceDto(workspace))

  return mapMemberRow(updated, input.workspaceId)
}

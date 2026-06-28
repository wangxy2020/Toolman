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
  mapMemberRow,
} from './p2p-member-shared'

export { ensureOwnerMemberRecord } from './p2p-member-shared'
import { recordMemberDepartureEvent } from './p2p-member-departure.service'
import {
  applyRemoteMemberJoin,
  activateMemberAfterOwnerTrust,
  flushPendingJoinNotification,
  joinP2pWorkspace,
  P2pMemberLimitError,
} from './p2p-member-join.service'
import {
  ensureMemberConnectsToOwner,
  handleMemberSyncRequest,
  handleMemberSyncResponse,
  reconcileOwnerWorkspaceMembers,
  runOwnerPeerReconcileTick,
  runMemberOwnerConnectTick,
} from './p2p-member-reconcile.service'

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
  void ensureMemberConnectsToOwner(workspaceId)
  void reconcileOwnerWorkspaceMembers(workspaceId)
  return listP2pMembers(workspaceId)
}

export async function removeP2pMember(rawInput: unknown): Promise<void> {
  const input = P2pMemberRemoveInputSchema.parse(rawInput)
  const { actor, target } = assertCanManageMembers(input.workspaceId, input.memberId)

  await recordMemberDepartureEvent({
    workspaceId: input.workspaceId,
    memberId: target.id,
    operatorId: actor.id,
    reason: 'removed',
    displayName: target.displayName,
    deviceId: target.deviceId,
  })

  getMemberRepo().update({
    id: target.id,
    status: 'removed',
  })
}

export function updateP2pMemberRole(rawInput: unknown): P2pMember {
  const input = P2pMemberUpdateRoleInputSchema.parse(rawInput)
  const { target } = assertCanManageMembers(input.workspaceId, input.memberId)

  if (input.role === 'owner') {
    throw new Error('不能将成员设为群主')
  }

  const updated = getMemberRepo().update({
    id: target.id,
    role: input.role as P2pMemberRole,
  })
  if (!updated) {
    throw new Error('成员不存在')
  }

  return mapMemberRow(updated, input.workspaceId)
}

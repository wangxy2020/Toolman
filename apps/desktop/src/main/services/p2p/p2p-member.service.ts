import {
  P2pMemberRemoveInputSchema,
  P2pMemberUpdateRoleInputSchema,
  type P2pMember,
  type P2pMemberRole,
} from '@toolman/shared'
import { listP2pDiscoveredNodes } from './p2p-discovery.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertCanManageMembers as assertCanManageMembersGuard } from './p2p-permission.guard'
import { ensureLinkedIdentityRow } from './p2p-linked-identity.service'
import {
  assertWorkspaceMemberAccess,
  getIdentityDisplayName,
  getMemberRepo,
  getWorkspaceRepo,
  mapMemberRow,
} from './p2p-member-shared'
import {
  applyRemoteMemberJoin,
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
} from './p2p-member-reconcile.service'

export { P2pMemberVipRequiredError } from './p2p-workspace-vip-pool.service'
export {
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

export function ensureOwnerMemberRecord(workspaceId: string): void {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId === device.deviceId) {
    return
  }

  const memberRepo = getMemberRepo()
  const existing = memberRepo.findByWorkspaceAndDevice(workspaceId, workspace.ownerDeviceId)
  if (existing?.status === 'active') {
    return
  }

  const discovered = listP2pDiscoveredNodes(false).find(
    (node) => node.deviceId === workspace.ownerDeviceId,
  )
  const displayName = discovered?.userName ?? '群主'

  ensureLinkedIdentityRow(workspace.ownerIdentityId, displayName)

  if (existing) {
    memberRepo.update({
      id: existing.id,
      displayName,
      role: 'owner',
      status: 'active',
      joinedAt: existing.joinedAt ?? new Date(),
    })
    return
  }

  memberRepo.create({
    workspaceId,
    identityId: workspace.ownerIdentityId,
    deviceId: workspace.ownerDeviceId,
    displayName,
    role: 'owner',
    status: 'active',
    joinedAt: new Date(),
  })
}

export function listP2pMembers(workspaceId: string): P2pMember[] {
  assertWorkspaceMemberAccess(workspaceId)
  ensureOwnerMemberRecord(workspaceId)
  ensureLocalMemberDisplayNameForWorkspace(workspaceId)
  return getMemberRepo()
    .listByWorkspace(workspaceId)
    .filter((row) => row.status === 'active' || row.status === 'invited')
    .map((row) => mapMemberRow(row, workspaceId))
}

export async function prepareP2pMemberList(workspaceId: string): Promise<P2pMember[]> {
  assertWorkspaceMemberAccess(workspaceId)
  ensureOwnerMemberRecord(workspaceId)
  void ensureMemberConnectsToOwner(workspaceId)
  void reconcileOwnerWorkspaceMembers(workspaceId)
  return listP2pMembers(workspaceId)
}

export function removeP2pMember(rawInput: unknown): void {
  const input = P2pMemberRemoveInputSchema.parse(rawInput)
  const { target } = assertCanManageMembers(input.workspaceId, input.memberId)

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

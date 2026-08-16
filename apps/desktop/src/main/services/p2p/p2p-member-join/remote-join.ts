import { toErrorMessage } from '@toolman/shared'
import {
  createP2pDeviceIdentityRepository,
  type P2pWorkspaceMemberRow,
} from '@toolman/db'
import type { P2pJoinDeviceKind, P2pMember, ProductSku } from '@toolman/shared'
import { getDatabase } from '../../../bootstrap/database'
import { logStructured } from '../../structured-log.service'
import * as p2pConnectionService from '../p2p-connection.service'
import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import {
  assertPeerTrustedForSync,
  isPeerTrusted,
  prepareJoinPeerTrustPrompt,
  registerRemoteDevicePublicKey,
} from '../p2p-peer.service'
import { appendP2pEvent } from '../p2p-event.service'
import { broadcastP2pMemberChanged } from '../p2p-member-broadcast'
import { notifyJoinerMemberApproved } from '../p2p-member-activation.service'
import { ensureLinkedIdentityRow } from '../p2p-linked-identity.service'
import {
  assertRemoteJoinerEligibleForWorkspace,
  buildMemberCertSnapshot,
  entitlementContextFromJoinerSku,
  maybeActivateWorkspaceVipPool,
} from '../p2p-workspace-vip-pool.service'
import {
  DEFAULT_IDENTITY_ID,
  findIdentitySibling,
  getInviteRepo,
  getMemberRepo,
  getWorkspaceRepo,
  hasWorkspaceMemberCapacity,
  membershipFromIdentitySibling,
  toWorkspaceDto,
} from '../p2p-member-shared'
import { P2pMemberLimitError } from './errors'
import { publishP2pGroupSyncChange } from '../../group-mobile-sync'

function resolveRemoteMemberIdentityId(member: P2pMember): string {
  if (member.identityId) return member.identityId
  const row = createP2pDeviceIdentityRepository(getDatabase()).getByDeviceId(member.deviceId)
  return row?.identityId ?? DEFAULT_IDENTITY_ID
}

function reconcileAfterRemoteJoin(workspaceId: string): void {
  void import('../p2p-member-reconcile-owner')
    .then((module) => module.reconcileOwnerWorkspaceMembers(workspaceId, { immediate: true }))
    .catch(() => undefined)
}

export async function activateMemberAfterOwnerTrust(
  workspaceId: string,
  peerDeviceId: string,
): Promise<void> {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId !== device.deviceId) return

  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  if (!member || member.status === 'active') return

  const updated =
    getMemberRepo().update({
      id: member.id,
      status: 'active',
      joinedAt: member.joinedAt ?? new Date(),
    }) ?? member

  await appendP2pEvent({
    workspaceId,
    resourceType: 'Member',
    resourceId: updated.id,
    operatorId: updated.id,
    eventType: 'Joined',
    payload: {
      member_id: updated.id,
      device_id: updated.deviceId,
      identity_id: updated.identityId,
      display_name: updated.displayName,
      role: updated.role,
    },
  })

  try {
    await notifyJoinerMemberApproved(workspaceId, peerDeviceId, {
      id: updated.id,
      deviceId: updated.deviceId,
      displayName: updated.displayName,
      role: updated.role,
      identityId: updated.identityId,
    })
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `member.approved notify failed for ${peerDeviceId.slice(0, 8)}: ${toErrorMessage(error, 'member.approved notify failed')}`,
    )
  }

  try {
    const syncModule = await import('../p2p-sync.service')
    const pushed = await syncModule.pushWorkspaceEventsToPeer(workspaceId, peerDeviceId)
    if (pushed > 0) {
      logStructured(
        'p2p',
        'info',
        `pushed ${pushed} historical events to ${peerDeviceId.slice(0, 8)} after approval`,
      )
    }
    await syncModule.syncWithPeer(workspaceId, peerDeviceId)
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `post-approval sync failed for ${peerDeviceId.slice(0, 8)}: ${toErrorMessage(error, 'post-approval sync failed')}`,
    )
  }

  broadcastP2pMemberChanged({ workspaceId })
  reconcileAfterRemoteJoin(workspaceId)
  maybeActivateWorkspaceVipPool(workspaceId)
}

function certJsonWithDeviceKind(base: string, kind?: P2pJoinDeviceKind): string {
  if (!kind) return base
  try {
    return JSON.stringify({ ...JSON.parse(base), deviceKind: kind })
  } catch {
    return base
  }
}

export async function applyRemoteMemberJoin(
  payload: {
    workspaceId: string
    member: P2pMember
    inviteId?: string
    peerDeviceId?: string
    subscriptionSku?: ProductSku | null
    remoteDevicePublicKey?: string
    deviceKind?: P2pJoinDeviceKind
  },
  options?: { requirePeerTrust?: boolean; allowReactivation?: boolean; forcePendingApproval?: boolean },
): Promise<void> {
  const peerDeviceId = payload.peerDeviceId ?? payload.member.deviceId
  if (payload.member.deviceId !== peerDeviceId) {
    throw new Error('成员设备 ID 与连接对端不一致')
  }
  if (options?.requirePeerTrust ?? true) {
    assertPeerTrustedForSync(payload.workspaceId, peerDeviceId)
  }

  const workspace = getWorkspaceRepo().findById(payload.workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId !== device.deviceId) {
    return
  }

  if (payload.remoteDevicePublicKey) {
    registerRemoteDevicePublicKey(
      payload.workspaceId,
      peerDeviceId,
      payload.remoteDevicePublicKey,
      { displayName: payload.member.displayName },
    )
  }

  const existing = getMemberRepo().findByWorkspaceAndDevice(
    payload.workspaceId,
    payload.member.deviceId,
  )

  const joinerContext = entitlementContextFromJoinerSku(payload.subscriptionSku)
  assertRemoteJoinerEligibleForWorkspace(workspace, joinerContext)
  const memberCertJson = certJsonWithDeviceKind(
    buildMemberCertSnapshot(joinerContext),
    payload.deviceKind,
  )

  const upsertPendingMember = (): P2pWorkspaceMemberRow => {
    const remoteIdentityId = existing?.identityId ?? resolveRemoteMemberIdentityId(payload.member)
    const sibling = findIdentitySibling(
      payload.workspaceId,
      remoteIdentityId,
      payload.member.deviceId,
    )
    const inherited = membershipFromIdentitySibling(payload.member.role, sibling)
    const role =
      inherited.role === 'owner' && remoteIdentityId !== workspace.ownerIdentityId
        ? payload.member.role === 'owner'
          ? 'member'
          : payload.member.role
        : inherited.role

    if (existing) {
      if (existing.status !== 'active' && options?.allowReactivation === false) {
        return existing
      }
      return (
        getMemberRepo().update({
          id: existing.id,
          status: inherited.status,
          role,
          displayName: payload.member.displayName,
          joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
          certJson: memberCertJson,
        }) ?? existing
      )
    }

    ensureLinkedIdentityRow(
      remoteIdentityId,
      payload.member.displayName,
      payload.remoteDevicePublicKey,
    )

    return getMemberRepo().create({
      id: payload.member.id,
      workspaceId: payload.workspaceId,
      identityId: remoteIdentityId,
      deviceId: payload.member.deviceId,
      displayName: payload.member.displayName,
      role,
      status: inherited.status,
      joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
      certJson: memberCertJson,
    })
  }

  if (
    !options?.forcePendingApproval &&
    existing?.status === 'active' &&
    isPeerTrusted(payload.workspaceId, peerDeviceId)
  ) {
    if (
      payload.member.displayName.trim() &&
      existing.displayName !== payload.member.displayName
    ) {
      getMemberRepo().update({
        id: existing.id,
        displayName: payload.member.displayName,
      })
      broadcastP2pMemberChanged({ workspaceId: payload.workspaceId })
    }
    reconcileAfterRemoteJoin(payload.workspaceId)
    return
  }

  const joinerIdentityId = existing?.identityId ?? resolveRemoteMemberIdentityId(payload.member)
  if (
    !hasWorkspaceMemberCapacity({
      workspaceId: payload.workspaceId,
      maxMembers: workspace.maxMembers,
      joinerIdentityId,
      existingStatus: existing?.status,
    })
  ) {
    throw new P2pMemberLimitError(workspace.maxMembers)
  }

  upsertPendingMember()
  const workspaceRow = getWorkspaceRepo().findById(payload.workspaceId)
  if (workspaceRow) publishP2pGroupSyncChange(toWorkspaceDto(workspaceRow))
  prepareJoinPeerTrustPrompt(
    payload.workspaceId,
    peerDeviceId,
    payload.member.displayName,
  )
  void p2pConnectionService
    .ensurePeerReadyForWorkspace(peerDeviceId, payload.workspaceId)
    .catch((error) => {
      logStructured(
        'p2p',
        'warn',
        `owner connect after join request failed for ${peerDeviceId.slice(0, 8)}: ${toErrorMessage(error, 'owner connect after join request failed')}`,
      )
    })
  broadcastP2pMemberChanged({ workspaceId: payload.workspaceId })

  if (payload.inviteId) {
    const invite = getInviteRepo().findById(payload.inviteId)
    if (invite) {
      getInviteRepo().incrementUseCount(invite.id)
    }
  }
}

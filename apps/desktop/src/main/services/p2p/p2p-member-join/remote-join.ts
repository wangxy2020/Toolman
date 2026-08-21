import { toErrorMessage } from '@toolman/shared'
import {
  createP2pDeviceIdentityRepository,
  type P2pWorkspaceMemberRow,
} from '@toolman/db'
import type { P2pJoinDeviceKind, P2pMember, ProductSku } from '@toolman/shared'
import { preferUsableMemberIdentityId, resolveJoinedDeviceRole, isMailboxFirstP2pClient } from '@toolman/shared'
import { getDatabase } from '../../../bootstrap/database'
import { logStructured } from '../../structured-log.service'
import * as p2pConnectionService from '../p2p-connection.service'
import { getP2pDeviceInfo, getP2pPersonIdentityId } from '../p2p-device-identity.service'
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
  findSamePersonSibling,
  getInviteRepo,
  getMemberRepo,
  getWorkspaceRepo,
  hasWorkspaceMemberCapacity,
  membershipFromIdentitySibling,
  toWorkspaceDto,
} from '../p2p-member-shared'
import { P2pMemberLimitError } from './errors'
import { publishP2pGroupSyncChange } from '../../group-mobile-sync'
import {
  mailboxSessionDeviceKind,
  supersedeStaleMailboxFirstDevices,
} from '../p2p-mailbox-supersede'

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

function supersedeMailboxFirstJoiner(
  workspaceId: string,
  deviceId: string,
  deviceKind?: P2pJoinDeviceKind,
): void {
  const keepKind = mailboxSessionDeviceKind(deviceId, deviceKind)
  if (!isMailboxFirstP2pClient(deviceId, keepKind)) return
  if (
    supersedeStaleMailboxFirstDevices({
      workspaceId,
      keepDeviceId: deviceId,
      keepKind,
    }) === 0
  ) {
    return
  }
  const workspaceRow = getWorkspaceRepo().findById(workspaceId)
  if (workspaceRow) publishP2pGroupSyncChange(toWorkspaceDto(workspaceRow))
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
    if (!isMailboxFirstP2pClient(peerDeviceId)) {
      await notifyJoinerMemberApproved(workspaceId, peerDeviceId, {
        id: updated.id,
        deviceId: updated.deviceId,
        displayName: updated.displayName,
        role: updated.role,
        identityId: updated.identityId,
      })
    }
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `member.approved notify failed for ${peerDeviceId.slice(0, 8)}: ${toErrorMessage(error, 'member.approved notify failed')}`,
    )
  }

  try {
    if (isMailboxFirstP2pClient(peerDeviceId)) {
      const mailboxModule = await import('../p2p-mailbox-session')
      const deposited = await mailboxModule.depositCatchUpEventsToMailbox(
        workspaceId,
        peerDeviceId,
      )
      if (deposited > 0) {
        logStructured(
          'p2p',
          'info',
          `mailbox catch-up deposited ${deposited} events for ${peerDeviceId.slice(0, 8)}`,
        )
      }
    } else {
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
    }
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
  options?: {
    requirePeerTrust?: boolean
    allowReactivation?: boolean
    forcePendingApproval?: boolean
    /** Invite-token joins are already approved by the owner; do not revoke trust or prompt. */
    skipTrustPrompt?: boolean
  },
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
    const incomingIdentityId = resolveRemoteMemberIdentityId(payload.member)
    const remoteIdentityId =
      preferUsableMemberIdentityId(incomingIdentityId, existing?.identityId) ?? incomingIdentityId
    const sibling = findSamePersonSibling({
      workspaceId: payload.workspaceId,
      joinerIdentityId: remoteIdentityId,
      excludeDeviceId: payload.member.deviceId,
      localPersonIdentityId: getP2pPersonIdentityId(),
      localDeviceId: device.deviceId,
    })
    const inherited = membershipFromIdentitySibling(payload.member.role, sibling)
    const role = resolveJoinedDeviceRole({
      inheritedRole: inherited.role,
      requestedRole: payload.member.role,
      joinerIdentityId: remoteIdentityId,
      ownerIdentityId: workspace.ownerIdentityId,
      ownerDeviceId: workspace.ownerDeviceId,
      sibling,
    })
    ensureLinkedIdentityRow(
      remoteIdentityId,
      payload.member.displayName,
      payload.remoteDevicePublicKey,
    )

    if (existing) {
      if (existing.status !== 'active' && options?.allowReactivation === false) {
        return existing
      }
      return (
        getMemberRepo().update({
          id: existing.id,
          status: inherited.status,
          role,
          identityId: remoteIdentityId,
          displayName: payload.member.displayName,
          joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
          certJson: memberCertJson,
        }) ?? existing
      )
    }

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
    const incomingIdentityId = resolveRemoteMemberIdentityId(payload.member)
    const nextIdentityId = preferUsableMemberIdentityId(incomingIdentityId, existing.identityId)
    const nextDisplayName = payload.member.displayName.trim()
    const patch: { id: string; displayName?: string; identityId?: string } = { id: existing.id }
    if (nextDisplayName && existing.displayName !== nextDisplayName) {
      patch.displayName = nextDisplayName
    }
    if (nextIdentityId && existing.identityId !== nextIdentityId) {
      ensureLinkedIdentityRow(
        nextIdentityId,
        payload.member.displayName,
        payload.remoteDevicePublicKey,
      )
      patch.identityId = nextIdentityId
    }
    if (patch.displayName || patch.identityId) {
      getMemberRepo().update(patch)
      broadcastP2pMemberChanged({ workspaceId: payload.workspaceId })
    }
    supersedeMailboxFirstJoiner(payload.workspaceId, peerDeviceId, payload.deviceKind)
    reconcileAfterRemoteJoin(payload.workspaceId)
    return
  }

  const joinerIdentityId =
    preferUsableMemberIdentityId(
      resolveRemoteMemberIdentityId(payload.member),
      existing?.identityId,
    ) ?? resolveRemoteMemberIdentityId(payload.member)
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
  supersedeMailboxFirstJoiner(payload.workspaceId, peerDeviceId, payload.deviceKind)
  const workspaceRow = getWorkspaceRepo().findById(payload.workspaceId)
  if (workspaceRow) publishP2pGroupSyncChange(toWorkspaceDto(workspaceRow))
  if (!options?.skipTrustPrompt) {
    prepareJoinPeerTrustPrompt(
      payload.workspaceId,
      peerDeviceId,
      payload.member.displayName,
    )
  }
  if (!isMailboxFirstP2pClient(peerDeviceId, payload.deviceKind)) {
    void p2pConnectionService
      .ensurePeerReadyForWorkspace(peerDeviceId, payload.workspaceId)
      .catch((error) => {
        logStructured(
          'p2p',
          'warn',
          `owner connect after join request failed for ${peerDeviceId.slice(0, 8)}: ${toErrorMessage(error, 'owner connect after join request failed')}`,
        )
      })
  }
  broadcastP2pMemberChanged({ workspaceId: payload.workspaceId })

  if (payload.inviteId) {
    const invite = getInviteRepo().findById(payload.inviteId)
    if (invite) {
      getInviteRepo().incrementUseCount(invite.id)
    }
  }
}

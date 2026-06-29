import { P2pMemberJoinInputSchema, type P2pMember, type P2pWorkspace } from '@toolman/shared'
import type { P2pWorkspaceMemberRow } from '@toolman/db'
import { assertRegisteredForP2p } from '../p2p-auth.guard'
import {
  decodeInviteToken,
  parseInviteInput,
  verifyInviteToken,
} from '../p2p-invite.token'
import { saveWorkspaceKey, ensureWorkspaceKeyFromInvite } from '../p2p-workspace-key.store'
import { ensureOwnerPeerTrustedForSync } from '../p2p-peer.service'
import { reconcileAgentSharedResources } from '../p2p-agent-projection'
import {
  assertJoinerEligibleForWorkspace,
  buildMemberCertSnapshot,
  maybeActivateWorkspaceVipPool,
} from '../p2p-workspace-vip-pool.service'
import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import {
  ensureWorkspaceDir,
  getIdentityDisplayName,
  getMemberRepo,
  getWorkspaceRepo,
  mapMemberRow,
  toWorkspaceDto,
} from '../p2p-member-shared'
import { P2pMemberLimitError } from './errors'
import {
  stopAllBackgroundJoinNotifications,
  validateLocalInviteRecord,
} from './join-notify'
import {
  ensureOwnerMemberFromInvite,
  ensureWorkspaceFromInvite,
  recordJoinOnOwnerSide,
} from './join-workspace-setup'
import { scheduleJoinPeerSync } from './join-sync'

export async function joinP2pWorkspace(rawInput: unknown): Promise<{
  workspace: P2pWorkspace
  member: P2pMember
}> {
  assertRegisteredForP2p()
  const input = P2pMemberJoinInputSchema.parse(rawInput)
  const { token: inviteToken, offerSdp } = parseInviteInput(input.inviteToken)
  const payload = decodeInviteToken(inviteToken)
  verifyInviteToken(payload)
  stopAllBackgroundJoinNotifications()
  validateLocalInviteRecord(inviteToken, payload)

  const device = getP2pDeviceInfo()
  const displayName = input.displayName?.trim() || getIdentityDisplayName()
  const memberRepo = getMemberRepo()

  const workspace = ensureWorkspaceFromInvite(payload)
  ensureOwnerMemberFromInvite(payload, workspace.id)
  ensureOwnerPeerTrustedForSync(workspace.id, payload.ownerDeviceId)

  assertJoinerEligibleForWorkspace(workspace)

  const activeCount = memberRepo.countActiveByWorkspace(workspace.id)
  if (activeCount >= workspace.maxMembers) {
    throw new P2pMemberLimitError(workspace.maxMembers)
  }

  const memberCertJson = buildMemberCertSnapshot()

  saveWorkspaceKey(workspace.id, payload.workspaceKeyB64)
  ensureWorkspaceDir(workspace.id)

  const existing = memberRepo.findByWorkspaceAndDevice(workspace.id, device.deviceId)

  if (existing?.status === 'active') {
    ensureWorkspaceKeyFromInvite(payload)
    const member = mapMemberRow(existing, workspace.id)
    recordJoinOnOwnerSide(inviteToken, payload, existing)
    reconcileAgentSharedResources(workspace.id)
    scheduleJoinPeerSync(payload, offerSdp, member)
    return {
      workspace: toWorkspaceDto(workspace),
      member,
    }
  }

  let memberRow: P2pWorkspaceMemberRow

  if (existing) {
    if (existing.role === 'owner') {
      throw new Error('你是该群组群主，无需加入')
    }
    memberRow =
      memberRepo.update({
        id: existing.id,
        displayName,
        role: payload.role,
        status: 'invited',
        joinedAt: new Date(),
        certJson: memberCertJson,
      }) ?? existing
  } else {
    memberRow = memberRepo.create({
      workspaceId: workspace.id,
      identityId: device.identityId,
      deviceId: device.deviceId,
      displayName,
      role: payload.role,
      status: 'invited',
      joinedAt: new Date(),
      certJson: memberCertJson,
    })
  }

  const member = mapMemberRow(memberRow, workspace.id)
  recordJoinOnOwnerSide(inviteToken, payload, memberRow)

  if (memberRow.status === 'active') {
    reconcileAgentSharedResources(workspace.id)
  }
  scheduleJoinPeerSync(payload, offerSdp, member)

  if (payload.ownerDeviceId === device.deviceId) {
    maybeActivateWorkspaceVipPool(workspace.id)
  }

  return {
    workspace: toWorkspaceDto(getWorkspaceRepo().findById(workspace.id) ?? workspace),
    member,
  }
}

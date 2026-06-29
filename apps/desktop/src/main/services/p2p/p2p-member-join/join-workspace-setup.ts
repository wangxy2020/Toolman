import { hashInviteToken, hashWorkspaceKey, type P2pWorkspaceMemberRow, type P2pWorkspaceRow } from '@toolman/db'
import { listP2pDiscoveredNodes } from '../p2p-discovery.service'
import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import { registerRemoteDevicePublicKey } from '../p2p-peer.service'
import { ensureLinkedIdentityRow } from '../p2p-linked-identity.service'
import {
  getInviteRepo,
  getMemberRepo,
  getWorkspaceRepo,
} from '../p2p-member-shared'
import type { decodeInviteToken } from '../p2p-invite.token'

type InvitePayload = ReturnType<typeof decodeInviteToken>

function resolveOwnerDisplayNameFromInvite(
  payload: InvitePayload,
  discovered?: { userName: string },
): string {
  return payload.ownerDisplayName?.trim() || discovered?.userName?.trim() || '群主'
}

export function ensureOwnerMemberFromInvite(payload: InvitePayload, workspaceId: string): void {
  const device = getP2pDeviceInfo()
  if (payload.ownerDeviceId === device.deviceId) {
    return
  }

  const memberRepo = getMemberRepo()
  const existing = memberRepo.findByWorkspaceAndDevice(workspaceId, payload.ownerDeviceId)
  const discovered = listP2pDiscoveredNodes(false).find(
    (node) => node.deviceId === payload.ownerDeviceId,
  )
  const displayName = resolveOwnerDisplayNameFromInvite(payload, discovered)

  ensureLinkedIdentityRow(payload.ownerIdentityId, displayName, payload.ownerPublicKey)
  registerRemoteDevicePublicKey(workspaceId, payload.ownerDeviceId, payload.ownerPublicKey, {
    displayName,
    trusted: true,
  })

  if (existing) {
    if (existing.status !== 'active' || existing.role !== 'owner') {
      memberRepo.update({
        id: existing.id,
        displayName,
        role: 'owner',
        status: 'active',
        joinedAt: existing.joinedAt ?? new Date(),
      })
    }
    return
  }

  memberRepo.create({
    workspaceId,
    identityId: payload.ownerIdentityId,
    deviceId: payload.ownerDeviceId,
    displayName,
    role: 'owner',
    status: 'active',
    joinedAt: new Date(),
  })
}

export function recordJoinOnOwnerSide(
  inviteToken: string,
  payload: InvitePayload,
  member: P2pWorkspaceMemberRow,
): void {
  const invite = getInviteRepo().findActiveByTokenHash(hashInviteToken(inviteToken))
  if (!invite) return

  getInviteRepo().incrementUseCount(invite.id)

  const ownerDevice = getP2pDeviceInfo()
  if (ownerDevice.deviceId !== payload.ownerDeviceId) {
    return
  }

  const existing = getMemberRepo().findByWorkspaceAndDevice(
    payload.workspaceId,
    member.deviceId,
  )
  if (existing) {
    if (existing.status !== 'active') {
      getMemberRepo().update({
        id: existing.id,
        status: 'active',
        role: payload.role,
        displayName: member.displayName,
        joinedAt: new Date(),
      })
    }
    return
  }

  ensureLinkedIdentityRow(member.identityId, member.displayName)

  getMemberRepo().create({
    workspaceId: payload.workspaceId,
    identityId: member.identityId,
    deviceId: member.deviceId,
    displayName: member.displayName,
    role: payload.role,
    status: 'active',
    joinedAt: new Date(),
  })
}

export function ensureWorkspaceFromInvite(payload: InvitePayload): P2pWorkspaceRow {
  const discovered = listP2pDiscoveredNodes(false).find(
    (node) => node.deviceId === payload.ownerDeviceId,
  )
  ensureLinkedIdentityRow(
    payload.ownerIdentityId,
    resolveOwnerDisplayNameFromInvite(payload, discovered),
    payload.ownerPublicKey,
  )

  const workspaceRepo = getWorkspaceRepo()
  let workspace = workspaceRepo.findById(payload.workspaceId)
  if (!workspace) {
    return workspaceRepo.create({
      id: payload.workspaceId,
      name: payload.workspaceName,
      description: payload.workspaceDescription ?? undefined,
      ownerDeviceId: payload.ownerDeviceId,
      ownerIdentityId: payload.ownerIdentityId,
      workspaceKeyHash: hashWorkspaceKey(payload.workspaceKeyB64),
    })
  }

  const nextName = workspace.name.trim() ? workspace.name : payload.workspaceName
  const nextDescription =
    workspace.description ?? payload.workspaceDescription ?? undefined
  if (nextName !== workspace.name || nextDescription !== workspace.description) {
    workspace =
      workspaceRepo.update({
        id: workspace.id,
        name: nextName,
        description: nextDescription,
      }) ?? workspace
  }

  return workspace
}

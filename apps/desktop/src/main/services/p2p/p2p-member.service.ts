import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import {
  P2pInviteRepository,
  P2pMemberRepository,
  P2pPeerRepository,
  P2pWorkspaceRepository,
  hashInviteToken,
  hashWorkspaceKey,
  identities,
  type P2pWorkspaceMemberRow,
  type P2pWorkspaceRow,
} from '@toolman/db'
import type { P2pMember, P2pMemberRole, P2pWorkspace } from '@toolman/shared'
import {
  P2pMemberJoinInputSchema,
  P2pMemberRemoveInputSchema,
  P2pMemberUpdateRoleInputSchema,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import * as p2pConnectionService from './p2p-connection.service'
import { listP2pDiscoveredNodes } from './p2p-discovery.service'
import { P2pBridge } from './p2p-bridge'
import { isP2pDiscoveryRunning, startP2pDiscovery } from './p2p-discovery.service'
import { applyP2pNetworkConfig } from './p2p-network.config'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  decodeInviteToken,
  parseInviteInput,
  verifyInviteToken,
} from './p2p-invite.token'
import { saveWorkspaceKey } from './p2p-workspace-key.store'
import { assertPeerTrustedForSync } from './p2p-peer.service'
import { appendP2pEvent } from './p2p-event.service'
import { assertCanManageMembers as assertCanManageMembersGuard } from './p2p-permission.guard'
import { requestSnapshotFromOwner } from './p2p-sync.service'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
const MEMBER_JOIN_MESSAGE_TYPE = 'member.joined'

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getPeerRepo(): P2pPeerRepository {
  return new P2pPeerRepository(getDatabase())
}

function getInviteRepo(): P2pInviteRepository {
  return new P2pInviteRepository(getDatabase())
}

function getIdentityDisplayName(): string {
  const db = getDatabase()
  const row = db
    .select()
    .from(identities)
    .where(eq(identities.id, DEFAULT_IDENTITY_ID))
    .get()
  return row?.displayName ?? '本地用户'
}

function ensureWorkspaceDir(workspaceId: string): void {
  const dir = join(app.getPath('userData'), 'p2p', 'workspaces', workspaceId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function mapWorkspaceRow(row: P2pWorkspaceRow, memberCount: number): P2pWorkspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerDeviceId: row.ownerDeviceId,
    ownerIdentityId: row.ownerIdentityId,
    maxMembers: row.maxMembers,
    status: row.status,
    memberCount,
    lastEventSeq: row.lastEventSeq,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function toWorkspaceDto(row: P2pWorkspaceRow): P2pWorkspace {
  const memberCount = getMemberRepo().countActiveByWorkspace(row.id)
  return mapWorkspaceRow(row, memberCount)
}

function resolveMemberOnline(row: P2pWorkspaceMemberRow, workspaceId: string): boolean {
  const localDeviceId = getP2pDeviceInfo().deviceId
  if (row.deviceId === localDeviceId) return true

  const peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, row.deviceId)
  if (peer?.online) return true

  const connected = p2pConnectionService
    .getKnownP2pConnections()
    .some((item) => item.peerDeviceId === row.deviceId && item.state === 'connected')
  if (connected) return true

  const discovered = listP2pDiscoveredNodes(false).find(
    (node) => node.deviceId === row.deviceId,
  )
  return discovered?.online ?? false
}

function mapMemberRow(row: P2pWorkspaceMemberRow, workspaceId: string): P2pMember {
  const peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, row.deviceId)
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    identityId: row.identityId,
    deviceId: row.deviceId,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    online: resolveMemberOnline(row, workspaceId),
    connectionMode: p2pConnectionService.getPeerConnectionMode(row.deviceId),
    lastSeenAt: row.lastSeenAt?.getTime() ?? peer?.lastSeenAt?.getTime(),
    joinedAt: row.joinedAt?.getTime(),
  }
}

function assertWorkspaceMemberAccess(workspaceId: string): P2pWorkspaceRow {
  const row = getWorkspaceRepo().findById(workspaceId)
  if (!row) {
    throw new Error('群组不存在')
  }

  const device = getP2pDeviceInfo()
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, device.deviceId)
  if (!member || member.status !== 'active') {
    throw new Error('无权访问该群组')
  }

  return row
}

function assertCanManageMembers(
  workspaceId: string,
  targetMemberId: string,
): { actor: P2pWorkspaceMemberRow; target: P2pWorkspaceMemberRow } {
  return assertCanManageMembersGuard(workspaceId, targetMemberId)
}

function validateLocalInviteRecord(
  inviteToken: string,
  payload: ReturnType<typeof decodeInviteToken>,
): void {
  const invite = getInviteRepo().findActiveByTokenHash(hashInviteToken(inviteToken))
  if (!invite) return

  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new Error('邀请码已过期')
  }
  if (invite.useCount >= invite.maxUses) {
    throw new Error('邀请码已达使用上限')
  }
  if (invite.workspaceId !== payload.workspaceId || invite.role !== payload.role) {
    throw new Error('邀请码与群组记录不匹配')
  }
}

async function connectViaInviteIfPresent(
  payload: ReturnType<typeof decodeInviteToken>,
  offerSdp: string | undefined,
): Promise<void> {
  if (!offerSdp || payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return
  }

  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  await P2pBridge.inviteConnectAsJoiner(
    payload.ownerDeviceId,
    payload.workspaceId,
    offerSdp,
    payload.inviteId,
  )
}

async function tryNotifyOwnerOfJoin(
  payload: ReturnType<typeof decodeInviteToken>,
  member: P2pMember,
  offerSdp?: string,
): Promise<void> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return
  }

  try {
    if (!offerSdp) {
      await p2pConnectionService.connectP2pPeer(payload.ownerDeviceId, payload.workspaceId)
    }
    const envelope = JSON.stringify({
      type: MEMBER_JOIN_MESSAGE_TYPE,
      inviteId: payload.inviteId,
      workspaceId: payload.workspaceId,
      member,
    })
    await P2pBridge.connectionSend(
      payload.ownerDeviceId,
      'events',
      Buffer.from(envelope, 'utf8'),
    )
  } catch {
    // Owner may be offline; local join still succeeds.
  }
}

function recordJoinOnOwnerSide(
  inviteToken: string,
  payload: ReturnType<typeof decodeInviteToken>,
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

export function listP2pMembers(workspaceId: string): P2pMember[] {
  assertWorkspaceMemberAccess(workspaceId)
  return getMemberRepo()
    .listByWorkspace(workspaceId)
    .filter((row) => row.status === 'active' || row.status === 'invited')
    .map((row) => mapMemberRow(row, workspaceId))
}

export async function joinP2pWorkspace(rawInput: unknown): Promise<{
  workspace: P2pWorkspace
  member: P2pMember
}> {
  const input = P2pMemberJoinInputSchema.parse(rawInput)
  const { token: inviteToken, offerSdp } = parseInviteInput(input.inviteToken)
  const payload = decodeInviteToken(inviteToken)
  verifyInviteToken(payload)
  validateLocalInviteRecord(inviteToken, payload)

  const device = getP2pDeviceInfo()
  const displayName = input.displayName?.trim() || getIdentityDisplayName()
  const workspaceRepo = getWorkspaceRepo()
  const memberRepo = getMemberRepo()

  let workspace = workspaceRepo.findById(payload.workspaceId)
  if (!workspace) {
    workspace = workspaceRepo.create({
      id: payload.workspaceId,
      name: payload.workspaceName,
      description: payload.workspaceDescription ?? undefined,
      ownerDeviceId: payload.ownerDeviceId,
      ownerIdentityId: payload.ownerIdentityId,
      workspaceKeyHash: hashWorkspaceKey(payload.workspaceKeyB64),
    })
  }

  if (!workspace) {
    throw new Error('无法加入群组')
  }

  const activeCount = memberRepo.countActiveByWorkspace(workspace.id)
  if (activeCount >= workspace.maxMembers) {
    throw new Error('群组成员已达上限')
  }

  saveWorkspaceKey(workspace.id, payload.workspaceKeyB64)
  ensureWorkspaceDir(workspace.id)

  const existing = memberRepo.findByWorkspaceAndDevice(workspace.id, device.deviceId)
  let memberRow: P2pWorkspaceMemberRow

  if (existing) {
    if (existing.status === 'active') {
      throw new Error('你已是该群组成员')
    }
    if (existing.role === 'owner') {
      throw new Error('你是该群组群主，无需加入')
    }
    memberRow =
      memberRepo.update({
        id: existing.id,
        displayName,
        role: payload.role,
        status: 'active',
        joinedAt: new Date(),
      }) ?? existing
  } else {
    memberRow = memberRepo.create({
      workspaceId: workspace.id,
      identityId: device.identityId,
      deviceId: device.deviceId,
      displayName,
      role: payload.role,
      status: 'active',
      joinedAt: new Date(),
    })
  }

  const member = mapMemberRow(memberRow, workspace.id)
  recordJoinOnOwnerSide(inviteToken, payload, memberRow)

  await connectViaInviteIfPresent(payload, offerSdp)

  appendP2pEvent({
    workspaceId: workspace.id,
    resourceType: 'Member',
    resourceId: memberRow.id,
    operatorId: memberRow.id,
    eventType: 'Joined',
    payload: {
      member_id: memberRow.id,
      device_id: device.deviceId,
      display_name: displayName,
      role: payload.role,
    },
  })

  await tryNotifyOwnerOfJoin(payload, member, offerSdp)

  if (payload.ownerDeviceId !== device.deviceId) {
    void requestSnapshotFromOwner(workspace.id, payload.ownerDeviceId)
  }

  return {
    workspace: toWorkspaceDto(workspace),
    member,
  }
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

export function applyRemoteMemberJoin(payload: {
  workspaceId: string
  member: P2pMember
  inviteId?: string
  peerDeviceId?: string
}): void {
  const peerDeviceId = payload.peerDeviceId ?? payload.member.deviceId
  assertPeerTrustedForSync(payload.workspaceId, peerDeviceId)

  const workspace = getWorkspaceRepo().findById(payload.workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId !== device.deviceId) {
    return
  }

  const existing = getMemberRepo().findByWorkspaceAndDevice(
    payload.workspaceId,
    payload.member.deviceId,
  )
  if (existing) {
    if (existing.status !== 'active') {
      getMemberRepo().update({
        id: existing.id,
        status: 'active',
        role: payload.member.role,
        displayName: payload.member.displayName,
        joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
      })
    }
    return
  }

  getMemberRepo().create({
    workspaceId: payload.workspaceId,
    identityId: payload.member.identityId,
    deviceId: payload.member.deviceId,
    displayName: payload.member.displayName,
    role: payload.member.role,
    status: 'active',
    joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
  })

  if (payload.inviteId) {
    const invite = getInviteRepo().findById(payload.inviteId)
    if (invite) {
      getInviteRepo().incrementUseCount(invite.id)
    }
  }
}

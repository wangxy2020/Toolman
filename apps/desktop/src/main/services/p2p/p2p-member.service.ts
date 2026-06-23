import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import {
  P2pInviteRepository,
  P2pMemberRepository,
  P2pPeerRepository,
  P2pWorkspaceRepository,
  createP2pDeviceIdentityRepository,
  hashInviteToken,
  hashWorkspaceKey,
  identities,
  type P2pWorkspaceMemberRow,
  type P2pWorkspaceRow,
} from '@toolman/db'
import {
  formatGroupMemberLimitMessage,
  P2pMemberJoinInputSchema,
  P2pMemberRemoveInputSchema,
  P2pMemberUpdateRoleInputSchema,
  type P2pMember,
  type P2pMemberRole,
  type P2pWorkspace,
  type ProductSku,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import * as p2pConnectionService from './p2p-connection.service'
import { listP2pDiscoveredNodes, isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import { P2pBridge } from './p2p-bridge'
import { isP2pDiscoveryRunning, startP2pDiscovery } from './p2p-discovery.service'
import { applyP2pNetworkConfig } from './p2p-network.config'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import {
  decodeInviteToken,
  parseInviteInput,
  verifyInviteToken,
} from './p2p-invite.token'
import { saveWorkspaceKey } from './p2p-workspace-key.store'
import {
  assertPeerTrustedForSync,
  ensureOwnerPeerTrustedForSync,
  isPeerTrusted,
  promptPeerTrustIfNeeded,
  upsertPeerFromDiscovery,
} from './p2p-peer.service'
import { appendP2pEvent } from './p2p-event.service'
import { assertCanManageMembers as assertCanManageMembersGuard } from './p2p-permission.guard'
import { requestSnapshotFromOwner, syncWithPeer, awaitJoinerEventCatchUp } from './p2p-sync.service'
import { reconcileWorkspaceMemberMesh } from './p2p-member-mesh.service'
import {
  assertJoinerEligibleForWorkspace,
  assertRemoteJoinerEligibleForWorkspace,
  buildMemberCertSnapshot,
  entitlementContextFromJoinerSku,
  maybeActivateWorkspaceVipPool,
} from './p2p-workspace-vip-pool.service'
import { getEntitlementContext } from '../auth/entitlement.service'
import { encodeReplicationMessage } from './p2p-sync-protocol'
import { broadcastP2pMemberChanged } from './p2p-member-broadcast'
import { countWanSdpCandidates } from './wan-transport'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
const MEMBER_JOIN_MESSAGE_TYPE = 'member.joined'
const JOIN_NOTIFY_MAX_ATTEMPTS = 30
const JOIN_NOTIFY_INTERVAL_MS = 2_000

export { P2pMemberVipRequiredError } from './p2p-workspace-vip-pool.service'

export class P2pMemberLimitError extends Error {
  readonly code = 'P2P_MEMBER_LIMIT' as const

  constructor(maxMembers = 10, message = formatGroupMemberLimitMessage(maxMembers)) {
    super(message)
    this.name = 'P2pMemberLimitError'
  }
}

const pendingJoinNotifications = new Map<
  string,
  {
    payload: ReturnType<typeof decodeInviteToken>
    member: P2pMember
    timer: ReturnType<typeof setInterval>
  }
>()

function pendingJoinKey(payload: ReturnType<typeof decodeInviteToken>): string {
  return `${payload.workspaceId}:${payload.ownerDeviceId}`
}

function stopBackgroundJoinNotify(key: string): void {
  const pending = pendingJoinNotifications.get(key)
  if (!pending) return
  clearInterval(pending.timer)
  pendingJoinNotifications.delete(key)
}

function startBackgroundJoinNotify(
  payload: ReturnType<typeof decodeInviteToken>,
  member: P2pMember,
): void {
  const key = pendingJoinKey(payload)
  stopBackgroundJoinNotify(key)

  let attempts = 0
  const timer = setInterval(() => {
    attempts += 1
    if (attempts > JOIN_NOTIFY_MAX_ATTEMPTS) {
      stopBackgroundJoinNotify(key)
      console.warn(`[p2p] gave up notifying owner of join for workspace ${payload.workspaceId}`)
      return
    }

    void (async () => {
      if (await notifyOwnerOfJoinOnce(payload, member)) {
        stopBackgroundJoinNotify(key)
      }
    })()
  }, JOIN_NOTIFY_INTERVAL_MS)

  pendingJoinNotifications.set(key, { payload, member, timer })
}

export function flushPendingJoinNotification(
  ownerDeviceId: string,
  workspaceId?: string,
): void {
  for (const [key, pending] of pendingJoinNotifications) {
    if (pending.payload.ownerDeviceId !== ownerDeviceId) continue
    if (workspaceId && pending.payload.workspaceId !== workspaceId) continue
    void notifyOwnerOfJoinOnce(pending.payload, pending.member).then((sent) => {
      if (sent) stopBackgroundJoinNotify(key)
    })
  }
}

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

function resolveMemberOnline(row: P2pWorkspaceMemberRow, _workspaceId: string): boolean {
  const localDeviceId = getP2pDeviceInfo().deviceId
  if (row.deviceId === localDeviceId) return true

  if (
    p2pConnectionService
      .getKnownP2pConnections()
      .some((item) => item.peerDeviceId === row.deviceId && item.state === 'connected')
  ) {
    return true
  }

  return isP2pPeerDiscoverableOnline(row.deviceId)
}

function ensureLocalMemberDisplayNameForWorkspace(workspaceId: string): void {
  const localDeviceId = getP2pDeviceInfo().deviceId
  const identityName = getIdentityDisplayName()
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, localDeviceId)
  if (member && member.displayName !== identityName) {
    getMemberRepo().update({ id: member.id, displayName: identityName })
  }
}

function mapMemberRow(row: P2pWorkspaceMemberRow, workspaceId: string): P2pMember {
  const peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, row.deviceId)
  const localDeviceId = getP2pDeviceInfo().deviceId
  const displayName =
    row.deviceId === localDeviceId ? getIdentityDisplayName() : row.displayName
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    identityId: row.identityId,
    deviceId: row.deviceId,
    displayName,
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

function shouldInitiatePeerConnection(localDeviceId: string, peerDeviceId: string): boolean {
  return localDeviceId < peerDeviceId
}

async function connectToOwnerPeer(
  ownerDeviceId: string,
  workspaceId: string,
  context: string,
): Promise<boolean> {
  if (!isP2pPeerDiscoverableOnline(ownerDeviceId)) {
    return false
  }
  try {
    await p2pConnectionService.ensurePeerReadyForWorkspace(ownerDeviceId, workspaceId)
    return p2pConnectionService.isPeerConnected(ownerDeviceId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'connect owner failed'
    console.warn(`[p2p] ${context}: ${message}`)
    return false
  }
}

async function isOwnerPeerConnected(ownerDeviceId: string): Promise<boolean> {
  if (
    p2pConnectionService
      .getKnownP2pConnections()
      .some((item) => item.peerDeviceId === ownerDeviceId && item.state === 'connected')
  ) {
    return true
  }

  const connections = await p2pConnectionService.listP2pConnections()
  return connections.some(
    (item) => item.peerDeviceId === ownerDeviceId && item.state === 'connected',
  )
}

async function tryLanConnectToOwner(
  payload: ReturnType<typeof decodeInviteToken>,
): Promise<boolean> {
  return connectToOwnerPeer(
    payload.ownerDeviceId,
    payload.workspaceId,
    'LAN connect during join failed',
  )
}

async function ensureJoinPeerConnection(
  payload: ReturnType<typeof decodeInviteToken>,
  offerSdp: string | undefined,
): Promise<{ connected: boolean; lastError?: string }> {
  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  let lastError: string | undefined

  // 局域网/WebRTC：双方都应调用 connect，Rust 按 deviceId 决定 offerer/answerer
  if (await tryLanConnectToOwner(payload)) {
    return { connected: true }
  }
  lastError = '局域网连接失败'

  const hasIceCandidates = offerSdp ? countWanSdpCandidates(offerSdp) > 0 : false
  if (offerSdp && hasIceCandidates) {
    try {
      await P2pBridge.inviteConnectAsJoiner(
        payload.ownerDeviceId,
        payload.workspaceId,
        offerSdp,
        payload.inviteId,
      )
      if (await isOwnerPeerConnected(payload.ownerDeviceId)) {
        return { connected: true }
      }
      lastError = '邀请链路未建立连接'
    } catch (error) {
      lastError = error instanceof Error ? error.message : '邀请链路连接失败'
      console.warn(`[p2p] WAN invite connect failed: ${lastError}`)
    }
  } else if (offerSdp) {
    lastError = '邀请 SDP 不含 ICE 候选，无法广域网打洞'
    console.warn('[p2p] skipping WAN invite connect: no ICE candidates in offer')
  }

  return { connected: false, lastError }
}

async function notifyOwnerOfJoinOnce(
  payload: ReturnType<typeof decodeInviteToken>,
  member: P2pMember,
): Promise<boolean> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return true
  }

  try {
    if (!(await isOwnerPeerConnected(payload.ownerDeviceId))) {
      await tryLanConnectToOwner(payload)
    }
    if (!(await isOwnerPeerConnected(payload.ownerDeviceId))) {
      return false
    }

    const envelope = encodeReplicationMessage({
      type: MEMBER_JOIN_MESSAGE_TYPE,
      workspaceId: payload.workspaceId,
      inviteId: payload.inviteId,
      member: {
        id: member.id,
        workspaceId: payload.workspaceId,
        identityId: member.identityId,
        deviceId: member.deviceId,
        displayName: member.displayName,
        role: member.role,
        subscriptionSku: getEntitlementContext().subscriptionSku ?? 'community',
      },
    })
    await P2pBridge.connectionSend(payload.ownerDeviceId, 'events', envelope)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'notify owner failed'
    console.warn(`[p2p] notify owner of join failed: ${message}`)
    return false
  }
}

async function tryNotifyOwnerOfJoin(
  payload: ReturnType<typeof decodeInviteToken>,
  member: P2pMember,
): Promise<void> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await notifyOwnerOfJoinOnce(payload, member)) {
      return
    }
    await sleep(500 * (attempt + 1))
  }

  startBackgroundJoinNotify(payload, member)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function ensureOwnerMemberFromInvite(
  payload: ReturnType<typeof decodeInviteToken>,
  workspaceId: string,
): void {
  const device = getP2pDeviceInfo()
  if (payload.ownerDeviceId === device.deviceId) {
    return
  }

  const memberRepo = getMemberRepo()
  const existing = memberRepo.findByWorkspaceAndDevice(workspaceId, payload.ownerDeviceId)
  const discovered = listP2pDiscoveredNodes(false).find(
    (node) => node.deviceId === payload.ownerDeviceId,
  )
  const displayName = discovered?.userName ?? '群主'

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

async function publishJoinToOwner(
  payload: ReturnType<typeof decodeInviteToken>,
  member: P2pMember,
): Promise<void> {
  await tryNotifyOwnerOfJoin(payload, member)
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

async function requestMemberSyncFromPeer(
  workspaceId: string,
  peerDeviceId: string,
): Promise<void> {
  const payload = encodeReplicationMessage({
    type: 'member.sync_request',
    workspaceId,
  })
  await P2pBridge.connectionSend(peerDeviceId, 'events', payload)
}

const ownerConnectInFlight = new Map<string, Promise<void>>()
const ownerConnectLastRunAt = new Map<string, number>()
const OWNER_CONNECT_COOLDOWN_MS = 10_000

export async function ensureMemberConnectsToOwner(
  workspaceId: string,
  options?: { immediate?: boolean },
): Promise<void> {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId === device.deviceId) return

  const inFlight = ownerConnectInFlight.get(workspaceId)
  if (inFlight) {
    await inFlight
    return
  }

  if (!options?.immediate) {
    const lastRun = ownerConnectLastRunAt.get(workspaceId) ?? 0
    if (Date.now() - lastRun < OWNER_CONNECT_COOLDOWN_MS) {
      return
    }
  }

  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  const promise = connectToOwnerPeer(
    workspace.ownerDeviceId,
    workspaceId,
    'member connect to owner failed',
  ).then(() => undefined).finally(() => {
    ownerConnectInFlight.delete(workspaceId)
    ownerConnectLastRunAt.set(workspaceId, Date.now())
  })
  ownerConnectInFlight.set(workspaceId, promise)
  await promise
}

const reconcileInFlight = new Map<string, Promise<void>>()
const reconcileLastRunAt = new Map<string, number>()
const RECONCILE_COOLDOWN_MS = 8_000

export async function reconcileOwnerWorkspaceMembers(
  workspaceId: string,
  options?: { immediate?: boolean },
): Promise<void> {
  const inFlight = reconcileInFlight.get(workspaceId)
  if (inFlight) {
    await inFlight
    return
  }

  if (!options?.immediate) {
    const lastRun = reconcileLastRunAt.get(workspaceId) ?? 0
    if (Date.now() - lastRun < RECONCILE_COOLDOWN_MS) {
      return
    }
  }

  const promise = reconcileOwnerWorkspaceMembersNow(workspaceId).finally(() => {
    reconcileInFlight.delete(workspaceId)
    reconcileLastRunAt.set(workspaceId, Date.now())
  })
  reconcileInFlight.set(workspaceId, promise)
  await promise
}

export async function runOwnerPeerReconcileTick(): Promise<void> {
  const device = getP2pDeviceInfo()
  const workspaces = getWorkspaceRepo().listByOwnerDevice(device.deviceId)
  for (const workspace of workspaces) {
    try {
      await reconcileOwnerWorkspaceMembersNow(workspace.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'owner reconcile tick failed'
      console.warn(`[p2p] owner reconcile tick failed for ${workspace.id}: ${message}`)
    }
  }
}

async function reconcileOwnerWorkspaceMembersNow(workspaceId: string): Promise<void> {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId !== device.deviceId) return

  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  const activeMemberDeviceIds = new Set(
    getMemberRepo()
      .listByWorkspace(workspaceId, 'active')
      .map((item) => item.deviceId),
  )

  for (const member of getMemberRepo().listByWorkspace(workspaceId, 'active')) {
    if (member.deviceId === device.deviceId) continue
    if (!shouldInitiatePeerConnection(device.deviceId, member.deviceId)) continue
    if (!isP2pPeerDiscoverableOnline(member.deviceId)) continue
    try {
      await p2pConnectionService.ensurePeerReadyForWorkspace(member.deviceId, workspaceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'connect active member failed'
      console.warn(`[p2p] owner connect to member ${member.deviceId} failed: ${message}`)
    }
  }

  for (const node of listP2pDiscoveredNodes(true)) {
    if (node.deviceId === device.deviceId || activeMemberDeviceIds.has(node.deviceId)) {
      continue
    }
    if (p2pConnectionService.isPeerConnected(node.deviceId)) {
      continue
    }
    if (!shouldInitiatePeerConnection(device.deviceId, node.deviceId)) {
      continue
    }
    if (!isP2pPeerDiscoverableOnline(node.deviceId)) continue
    try {
      await p2pConnectionService.ensurePeerReadyForWorkspace(node.deviceId, workspaceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'connect peer failed'
      console.warn(`[p2p] owner reconcile connect failed for ${node.deviceId}: ${message}`)
    }
  }

  const connections = await p2pConnectionService.listP2pConnections()
  for (const connection of connections) {
    if (connection.state !== 'connected') continue
    if (connection.peerDeviceId === device.deviceId) continue
    if (activeMemberDeviceIds.has(connection.peerDeviceId)) continue
    if (connection.workspaceId && connection.workspaceId !== workspaceId) continue
    try {
      await requestMemberSyncFromPeer(workspaceId, connection.peerDeviceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'member sync request failed'
      console.warn(
        `[p2p] owner member sync request failed for ${connection.peerDeviceId}: ${message}`,
      )
    }
  }
}

export async function handleMemberSyncRequest(
  peerDeviceId: string,
  workspaceId: string,
): Promise<void> {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace || workspace.ownerDeviceId !== peerDeviceId) {
    return
  }

  const device = getP2pDeviceInfo()
  const memberRow = getMemberRepo().findByWorkspaceAndDevice(workspaceId, device.deviceId)
  if (!memberRow || memberRow.status !== 'active') {
    return
  }

  const payload = encodeReplicationMessage({
    type: 'member.sync_response',
    workspaceId,
    member: {
      id: memberRow.id,
      workspaceId,
      deviceId: memberRow.deviceId,
      displayName: memberRow.displayName,
      role: memberRow.role,
      identityId: memberRow.identityId,
    },
  })
  await P2pBridge.connectionSend(peerDeviceId, 'events', payload)
}

export function handleMemberSyncResponse(
  peerDeviceId: string,
  message: {
    workspaceId: string
    member: {
      id: string
      workspaceId: string
      deviceId: string
      displayName: string
      role: string
      identityId?: string
    }
  },
): void {
  void applyRemoteMemberJoin(
    {
      workspaceId: message.workspaceId,
      member: {
        id: message.member.id,
        workspaceId: message.workspaceId,
        identityId: message.member.identityId ?? '',
        deviceId: message.member.deviceId,
        displayName: message.member.displayName,
        role: message.member.role as P2pMember['role'],
        status: 'active',
        online: true,
      },
      peerDeviceId,
    },
    { requirePeerTrust: false },
  )
}

function ensureWorkspaceFromInvite(
  payload: ReturnType<typeof decodeInviteToken>,
): P2pWorkspaceRow {
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

async function finishJoinSync(
  payload: ReturnType<typeof decodeInviteToken>,
  offerSdp: string | undefined,
): Promise<void> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return
  }

  const connection = await ensureJoinPeerConnection(payload, offerSdp)

  if (connection.lastError && !connection.connected) {
    console.warn(
      `[p2p] join completed locally; peer connection pending (${connection.lastError})`,
    )
  }

  void requestSnapshotFromOwner(payload.workspaceId, payload.ownerDeviceId).catch((error) => {
    const message = error instanceof Error ? error.message : 'request snapshot failed'
    console.warn(`[p2p] snapshot request after join failed: ${message}`)
  })
}

function scheduleJoinPeerSync(
  payload: ReturnType<typeof decodeInviteToken>,
  offerSdp: string | undefined,
  member: P2pMember,
): void {
  void (async () => {
    try {
      await publishJoinToOwner(payload, member)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'notify owner failed'
      console.warn(`[p2p] publish join to owner failed: ${message}`)
    }

    await finishJoinSync(payload, offerSdp)

    if (payload.ownerDeviceId !== getP2pDeviceInfo().deviceId) {
      try {
        await syncWithPeer(payload.workspaceId, payload.ownerDeviceId)
        await awaitJoinerEventCatchUp(payload.workspaceId)
        await reconcileWorkspaceMemberMesh(payload.workspaceId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'post-join sync failed'
        console.warn(`[p2p] post-join event sync failed: ${message}`)
      }
    }
  })()
  void ensureMemberConnectsToOwner(payload.workspaceId)
}

export async function joinP2pWorkspace(rawInput: unknown): Promise<{
  workspace: P2pWorkspace
  member: P2pMember
}> {
  assertRegisteredForP2p()
  const input = P2pMemberJoinInputSchema.parse(rawInput)
  const { token: inviteToken, offerSdp } = parseInviteInput(input.inviteToken)
  const payload = decodeInviteToken(inviteToken)
  verifyInviteToken(payload)
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
    const member = mapMemberRow(existing, workspace.id)
    recordJoinOnOwnerSide(inviteToken, payload, existing)
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
        status: 'active',
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
      status: 'active',
      joinedAt: new Date(),
      certJson: memberCertJson,
    })
  }

  const member = mapMemberRow(memberRow, workspace.id)
  recordJoinOnOwnerSide(inviteToken, payload, memberRow)

  scheduleJoinPeerSync(payload, offerSdp, member)

  if (payload.ownerDeviceId === device.deviceId) {
    maybeActivateWorkspaceVipPool(workspace.id)
  }

  return {
    workspace: toWorkspaceDto(getWorkspaceRepo().findById(workspace.id) ?? workspace),
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

function resolveRemoteMemberIdentityId(member: P2pMember): string {
  if (member.identityId) return member.identityId
  const row = createP2pDeviceIdentityRepository(getDatabase()).getByDeviceId(member.deviceId)
  return row?.identityId ?? DEFAULT_IDENTITY_ID
}

function registerJoiningPeerForTrust(
  workspaceId: string,
  peerDeviceId: string,
  displayName: string,
): void {
  const node = listP2pDiscoveredNodes(false).find((item) => item.deviceId === peerDeviceId)
  if (node) {
    upsertPeerFromDiscovery(workspaceId, node, 'connected')
    return
  }

  getPeerRepo().upsert({
    workspaceId,
    deviceId: peerDeviceId,
    displayName,
    deviceName: peerDeviceId.slice(0, 8),
    publicKey: peerDeviceId,
    online: true,
    connectionState: 'connected',
  })
}

export async function applyRemoteMemberJoin(
  payload: {
    workspaceId: string
    member: P2pMember
    inviteId?: string
    peerDeviceId?: string
    subscriptionSku?: ProductSku | null
  },
  options?: { requirePeerTrust?: boolean },
): Promise<void> {
  const peerDeviceId = payload.peerDeviceId ?? payload.member.deviceId
  if (options?.requirePeerTrust ?? true) {
    assertPeerTrustedForSync(payload.workspaceId, peerDeviceId)
  }

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
  if (existing?.status === 'active') {
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
    if (!isPeerTrusted(payload.workspaceId, peerDeviceId)) {
      registerJoiningPeerForTrust(
        payload.workspaceId,
        peerDeviceId,
        payload.member.displayName,
      )
      if (p2pConnectionService.isPeerConnected(peerDeviceId)) {
        promptPeerTrustIfNeeded(payload.workspaceId, peerDeviceId, { connected: true })
      }
    }
    void reconcileOwnerWorkspaceMembers(payload.workspaceId, { immediate: true })
    return
  }

  const joinerContext = entitlementContextFromJoinerSku(payload.subscriptionSku)
  assertRemoteJoinerEligibleForWorkspace(workspace, joinerContext)

  const memberCertJson = buildMemberCertSnapshot(joinerContext)

  const activeCount = getMemberRepo().countActiveByWorkspace(payload.workspaceId)
  if (activeCount >= workspace.maxMembers) {
    throw new P2pMemberLimitError(workspace.maxMembers)
  }

  if (existing) {
    if (existing.status !== 'active') {
      getMemberRepo().update({
        id: existing.id,
        status: 'active',
        role: payload.member.role,
        displayName: payload.member.displayName,
        joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
        certJson: memberCertJson,
      })
      broadcastP2pMemberChanged({ workspaceId: payload.workspaceId })
    }
    if (!isPeerTrusted(payload.workspaceId, peerDeviceId)) {
      registerJoiningPeerForTrust(
        payload.workspaceId,
        peerDeviceId,
        payload.member.displayName,
      )
      if (p2pConnectionService.isPeerConnected(peerDeviceId)) {
        promptPeerTrustIfNeeded(payload.workspaceId, peerDeviceId, { connected: true })
      }
    }
    void reconcileOwnerWorkspaceMembers(payload.workspaceId, { immediate: true })
    maybeActivateWorkspaceVipPool(payload.workspaceId)
    return
  }

  registerJoiningPeerForTrust(
    payload.workspaceId,
    peerDeviceId,
    payload.member.displayName,
  )

  const memberRow = getMemberRepo().create({
    id: payload.member.id,
    workspaceId: payload.workspaceId,
    identityId: resolveRemoteMemberIdentityId(payload.member),
    deviceId: payload.member.deviceId,
    displayName: payload.member.displayName,
    role: payload.member.role,
    status: 'active',
    joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
    certJson: memberCertJson,
  })

  await appendP2pEvent({
    workspaceId: payload.workspaceId,
    resourceType: 'Member',
    resourceId: payload.member.id,
    operatorId: memberRow.id,
    eventType: 'Joined',
    payload: {
      member_id: memberRow.id,
      device_id: memberRow.deviceId,
      identity_id: memberRow.identityId,
      display_name: memberRow.displayName,
      role: memberRow.role,
    },
  })

  broadcastP2pMemberChanged({ workspaceId: payload.workspaceId })

  if (p2pConnectionService.isPeerConnected(peerDeviceId)) {
    promptPeerTrustIfNeeded(payload.workspaceId, peerDeviceId, { connected: true })
  }

  if (payload.inviteId) {
    const invite = getInviteRepo().findById(payload.inviteId)
    if (invite) {
      getInviteRepo().incrementUseCount(invite.id)
    }
  }

  void reconcileOwnerWorkspaceMembers(payload.workspaceId, { immediate: true })
  maybeActivateWorkspaceVipPool(payload.workspaceId)
}

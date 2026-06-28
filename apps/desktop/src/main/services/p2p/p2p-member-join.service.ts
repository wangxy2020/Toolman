import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import {
  createP2pDeviceIdentityRepository,
  hashInviteToken,
  hashWorkspaceKey,
  type P2pWorkspaceMemberRow,
  type P2pWorkspaceRow,
} from '@toolman/db'
import {
  formatGroupMemberLimitMessage,
  P2pMemberJoinInputSchema,
  type P2pMember,
  type ProductSku,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import * as p2pConnectionService from './p2p-connection.service'
import { isP2pDiscoveryRunning, listP2pDiscoveredNodes, startP2pDiscovery } from './p2p-discovery.service'
import { P2pBridge } from './p2p-bridge'
import { applyP2pNetworkConfig, getP2pWanNetworkReadiness } from './p2p-network.config'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import {
  decodeInviteToken,
  parseInviteInput,
  verifyInviteToken,
} from './p2p-invite.token'
import { saveWorkspaceKey, ensureWorkspaceKeyFromInvite } from './p2p-workspace-key.store'
import {
  assertPeerTrustedForSync,
  ensureOwnerPeerTrustedForSync,
  isPeerTrusted,
  prepareJoinPeerTrustPrompt,
  registerRemoteDevicePublicKey,
} from './p2p-peer.service'
import { appendP2pEvent } from './p2p-event.service'
import { requestSnapshotFromOwner, syncWithPeer, awaitJoinerEventCatchUp } from './p2p-sync.service'
import { reconcileAgentSharedResources } from './p2p-agent-projection'
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
import { signMemberJoinedWireMessage } from './p2p-member-sync-signing.service'
import { broadcastP2pMemberChanged } from './p2p-member-broadcast'
import { notifyJoinerMemberApproved } from './p2p-member-activation.service'
import { countWanSdpCandidates } from './wan-transport'
import { ensureLinkedIdentityRow } from './p2p-linked-identity.service'
import {
  DEFAULT_IDENTITY_ID,
  ensureWorkspaceDir,
  getIdentityDisplayName,
  getInviteRepo,
  getMemberRepo,
  getWorkspaceRepo,
  mapMemberRow,
  toWorkspaceDto,
} from './p2p-member-shared'
import type { P2pWorkspace } from '@toolman/shared'

const JOIN_NOTIFY_MAX_ATTEMPTS = 30
const JOIN_NOTIFY_INTERVAL_MS = 1_000
const JOIN_NOTIFY_RETRY_BASE_MS = 200

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

function stopAllBackgroundJoinNotifications(): void {
  for (const key of [...pendingJoinNotifications.keys()]) {
    stopBackgroundJoinNotify(key)
  }
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
      logStructured('p2p', 'warn', `gave up notifying owner of join for workspace ${payload.workspaceId}`)
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

export async function connectToOwnerPeer(
  ownerDeviceId: string,
  workspaceId: string,
  context: string,
  workspaceKeyB64?: string,
): Promise<boolean> {
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  try {
    await p2pConnectionService.ensurePeerReadyForWorkspace(ownerDeviceId, workspaceId, {
      workspaceKeyB64,
    })
    return p2pConnectionService.isPeerConnected(ownerDeviceId)
  } catch (error) {
    const message = toErrorMessage(error, 'connect owner failed')
    logStructured('p2p', 'warn', `${context}: ${message}`)
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
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (
      await connectToOwnerPeer(
        payload.ownerDeviceId,
        payload.workspaceId,
        'LAN connect during join failed',
        payload.workspaceKeyB64,
      )
    ) {
      return true
    }
    await sleep(500)
  }
  return false
}

async function ensureJoinPeerConnection(
  payload: ReturnType<typeof decodeInviteToken>,
  offerSdp: string | undefined,
): Promise<{ connected: boolean; lastError?: string }> {
  ensureWorkspaceKeyFromInvite(payload)
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
    const wanReady = getP2pWanNetworkReadiness()
    if (!wanReady.ready) {
      lastError = wanReady.reason ?? '广域网网络未就绪'
      logStructured('p2p', 'warn', `WAN invite connect blocked: ${lastError}`)
    } else {
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
      lastError = toErrorMessage(error, '邀请链路连接失败')
      logStructured('p2p', 'warn', `WAN invite connect failed: ${lastError}`)
    }
    }
  } else if (offerSdp) {
    lastError = '邀请 SDP 不含 ICE 候选，无法广域网打洞'
    logStructured('p2p', 'warn', `skipping WAN invite connect: no ICE candidates in offer`)
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

  ensureWorkspaceKeyFromInvite(payload)

  try {
    if (!(await isOwnerPeerConnected(payload.ownerDeviceId))) {
      await connectToOwnerPeer(
        payload.ownerDeviceId,
        payload.workspaceId,
        'notify owner connect failed',
        payload.workspaceKeyB64,
      )
    }
    if (!(await isOwnerPeerConnected(payload.ownerDeviceId))) {
      return false
    }

    const signed = signMemberJoinedWireMessage({
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
    const envelope = encodeReplicationMessage(signed)
    await P2pBridge.connectionSend(payload.ownerDeviceId, 'events', envelope)
    return true
  } catch (error) {
    const message = toErrorMessage(error, 'notify owner failed')
    logStructured('p2p', 'warn', `notify owner of join failed: ${message}`)
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
    await sleep(JOIN_NOTIFY_RETRY_BASE_MS * (attempt + 1))
  }

  startBackgroundJoinNotify(payload, member)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function resolveOwnerDisplayNameFromInvite(
  payload: ReturnType<typeof decodeInviteToken>,
  discovered?: { userName: string },
): string {
  return payload.ownerDisplayName?.trim() || discovered?.userName?.trim() || '群主'
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

function ensureWorkspaceFromInvite(
  payload: ReturnType<typeof decodeInviteToken>,
): P2pWorkspaceRow {
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

async function finishJoinSync(
  payload: ReturnType<typeof decodeInviteToken>,
  offerSdp: string | undefined,
): Promise<void> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return
  }

  const connection = await ensureJoinPeerConnection(payload, offerSdp)

  if (connection.lastError && !connection.connected) {
    logStructured('p2p', 'warn', `join completed locally; peer connection pending (${connection.lastError})`)
  }

  void requestSnapshotFromOwner(payload.workspaceId, payload.ownerDeviceId).catch((error) => {
    const message = toErrorMessage(error, 'request snapshot failed')
    logStructured('p2p', 'warn', `snapshot request after join failed: ${message}`)
  })
}

function scheduleJoinPeerSync(
  payload: ReturnType<typeof decodeInviteToken>,
  offerSdp: string | undefined,
  member: P2pMember,
): void {
  void (async () => {
    const notifyPromise = publishJoinToOwner(payload, member)

    await finishJoinSync(payload, offerSdp)

    try {
      await notifyPromise
    } catch (error) {
      const message = toErrorMessage(error, 'notify owner failed')
      logStructured('p2p', 'warn', `publish join to owner failed: ${message}`)
    }

    if (payload.ownerDeviceId !== getP2pDeviceInfo().deviceId) {
      try {
        await syncWithPeer(payload.workspaceId, payload.ownerDeviceId)
        await awaitJoinerEventCatchUp(payload.workspaceId)
        await reconcileWorkspaceMemberMesh(payload.workspaceId)
      } catch (error) {
        const message = toErrorMessage(error, 'post-join sync failed')
        logStructured('p2p', 'warn', `post-join event sync failed: ${message}`)
      }
    }
  })()
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

function resolveRemoteMemberIdentityId(member: P2pMember): string {
  if (member.identityId) return member.identityId
  const row = createP2pDeviceIdentityRepository(getDatabase()).getByDeviceId(member.deviceId)
  return row?.identityId ?? DEFAULT_IDENTITY_ID
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
    const syncModule = await import('./p2p-sync.service')
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

function reconcileAfterRemoteJoin(workspaceId: string): void {
  void import('./p2p-member-reconcile.service').then((module) =>
    module.reconcileOwnerWorkspaceMembers(workspaceId, { immediate: true }),
  )
}

export async function applyRemoteMemberJoin(
  payload: {
    workspaceId: string
    member: P2pMember
    inviteId?: string
    peerDeviceId?: string
    subscriptionSku?: ProductSku | null
    remoteDevicePublicKey?: string
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
  const memberCertJson = buildMemberCertSnapshot(joinerContext)

  const upsertPendingMember = (): P2pWorkspaceMemberRow => {
    if (existing) {
      if (existing.status !== 'active' && options?.allowReactivation === false) {
        return existing
      }
      return (
        getMemberRepo().update({
          id: existing.id,
          status: 'invited',
          role: payload.member.role,
          displayName: payload.member.displayName,
          joinedAt: payload.member.joinedAt ? new Date(payload.member.joinedAt) : new Date(),
          certJson: memberCertJson,
        }) ?? existing
      )
    }

    const remoteIdentityId = resolveRemoteMemberIdentityId(payload.member)
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
      role: payload.member.role,
      status: 'invited',
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

  const activeCount = getMemberRepo().countActiveByWorkspace(payload.workspaceId)
  if (activeCount >= workspace.maxMembers && existing?.status !== 'active') {
    throw new P2pMemberLimitError(workspace.maxMembers)
  }

  upsertPendingMember()
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

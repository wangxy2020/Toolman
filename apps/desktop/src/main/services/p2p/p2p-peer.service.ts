import {
  P2pMemberRepository,
  P2pPeerRepository,
  P2pWorkspaceRepository,
  createP2pDeviceIdentityRepository,
  p2pPeerNodes,
} from '@toolman/db'
import { logStructured } from '../structured-log.service'
import type { DiscoveredNode, P2pConnectionState } from '@toolman/shared'
import {P2pMemberTrustDeviceInputSchema, toErrorMessage, type P2pPeerTrustRequiredPayload } from '@toolman/shared'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceId } from './p2p-device-identity.service'
import { isP2pPeerDiscoverableOnline, listP2pDiscoveredNodes } from './p2p-discovery.service'
import { broadcastP2pPeerTrustRequired } from './p2p-peer-broadcast'
import { P2pBridge } from './p2p-bridge'
import { notifyP2pPeerConnected } from './p2p-sync-lifecycle'
import { resolveSharedMembershipWorkspaceId } from './p2p-member-shared'

const promptedPeers = new Set<string>()
const pendingTrustPrompts = new Map<string, P2pPeerTrustRequiredPayload>()

function peerPromptKey(workspaceId: string, deviceId: string): string {
  return `${workspaceId}:${deviceId}`
}

function getPeerRepo(): P2pPeerRepository {
  return new P2pPeerRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function resolveDiscoveredNode(deviceId: string): DiscoveredNode | null {
  return listP2pDiscoveredNodes(false).find((node) => node.deviceId === deviceId) ?? null
}

function isValidEd25519PublicKeyB64(value: string | null | undefined): value is string {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length < 40) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return false
  }
  try {
    return Buffer.from(trimmed, 'base64').length === 32
  } catch {
    return false
  }
}

function findStoredPeerPublicKey(deviceId: string): string | null {
  const rows = getDatabase()
    .select({ publicKey: p2pPeerNodes.publicKey })
    .from(p2pPeerNodes)
    .where(eq(p2pPeerNodes.deviceId, deviceId))
    .all()

  for (const row of rows) {
    if (isValidEd25519PublicKeyB64(row.publicKey)) {
      return row.publicKey
    }
  }
  return null
}

export function resolveWorkspaceIdForPeerConnection(
  peerDeviceId: string,
  workspaceId?: string,
): string | undefined {
  const sharedWorkspaceId = resolveSharedMembershipWorkspaceId(peerDeviceId)
  if (sharedWorkspaceId) return sharedWorkspaceId

  if (workspaceId) return workspaceId

  const localDeviceId = getP2pDeviceId()
  const ownedWorkspaces = getWorkspaceRepo().listByOwnerDevice(localDeviceId)
  if (ownedWorkspaces.length === 0) return undefined

  for (const workspace of ownedWorkspaces) {
    const member = getMemberRepo().findByWorkspaceAndDevice(workspace.id, peerDeviceId)
    if (member?.status === 'invited') return workspace.id
  }

  for (const workspace of ownedWorkspaces) {
    const member = getMemberRepo().findByWorkspaceAndDevice(workspace.id, peerDeviceId)
    if (!member || member.status !== 'active') return workspace.id
  }

  if (ownedWorkspaces.length === 1) {
    return ownedWorkspaces[0].id
  }

  return undefined
}

export function resolvePeerPublicKey(deviceId: string, fingerprint: string): string {
  const repo = createP2pDeviceIdentityRepository(getDatabase())
  const row = repo.getByDeviceId(deviceId)
  if (isValidEd25519PublicKeyB64(row?.publicKey)) {
    return row!.publicKey
  }

  const fromPeer = findStoredPeerPublicKey(deviceId)
  if (fromPeer) return fromPeer

  if (isValidEd25519PublicKeyB64(fingerprint)) {
    return fingerprint
  }

  return row?.publicKey ?? fingerprint
}

export function registerRemoteDevicePublicKey(
  workspaceId: string,
  deviceId: string,
  publicKey: string,
  options?: { displayName?: string; trusted?: boolean },
): void {
  if (!isValidEd25519PublicKeyB64(publicKey)) return

  const localDeviceId = getP2pDeviceId()
  if (deviceId === localDeviceId) return

  const node = resolveDiscoveredNode(deviceId)
  const existing = getPeerRepo().findByWorkspaceAndDevice(workspaceId, deviceId)
  getPeerRepo().upsert({
    workspaceId,
    deviceId,
    displayName: options?.displayName ?? existing?.displayName ?? node?.userName ?? '成员',
    deviceName: node?.deviceName ?? existing?.deviceName ?? deviceId.slice(0, 8),
    publicKey,
    online: node?.online ?? existing?.online ?? false,
    lastSeenAt: node ? new Date(node.lastSeenAt) : existing?.lastSeenAt ?? undefined,
    connectionState: existing?.connectionState ?? null,
    trusted: options?.trusted ?? existing?.trusted ?? false,
  })
}

function resolvePeerDisplayName(workspaceId: string, deviceId: string, fallback: string): string {
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, deviceId)
  return member?.displayName ?? fallback
}

export function upsertPeerFromDiscovery(
  workspaceId: string,
  node: DiscoveredNode,
  connectionState: P2pConnectionState | null = null,
): void {
  getPeerRepo().upsert({
    workspaceId,
    deviceId: node.deviceId,
    displayName: resolvePeerDisplayName(workspaceId, node.deviceId, node.userName),
    deviceName: node.deviceName,
    publicKey: resolvePeerPublicKey(node.deviceId, node.publicKeyFingerprint),
    online: connectionState ? connectionState === 'connected' && node.online : node.online,
    lastSeenAt: new Date(node.lastSeenAt),
    connectionState,
  })
}

export function isPeerTrusted(workspaceId: string, peerDeviceId: string): boolean {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return true

  const row = getPeerRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  return row?.trusted === true
}

export function assertPeerTrustedForSync(workspaceId: string, peerDeviceId: string): void {
  if (!isPeerTrusted(workspaceId, peerDeviceId)) {
    throw new Error('对端设备尚未信任，无法同步事件')
  }
}

export function ensureOwnerPeerTrustedForSync(
  workspaceId: string,
  ownerDeviceId: string,
  displayName = '群主',
): void {
  trustPeerSilentlyForWorkspaceMesh(workspaceId, ownerDeviceId, displayName)
}

export function trustPeerSilentlyForWorkspaceMesh(
  workspaceId: string,
  peerDeviceId: string,
  displayName?: string,
): void {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return

  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  const resolvedDisplayName =
    displayName ?? member?.displayName ?? resolvePeerDisplayName(workspaceId, peerDeviceId, '成员')

  const node = resolveDiscoveredNode(peerDeviceId)
  if (node) {
    getPeerRepo().upsert({
      workspaceId,
      deviceId: peerDeviceId,
      displayName: resolvedDisplayName,
      deviceName: node.deviceName,
      publicKey: resolvePeerPublicKey(peerDeviceId, node.publicKeyFingerprint),
      trusted: true,
      online: node.online,
      lastSeenAt: new Date(node.lastSeenAt),
      connectionState: 'connected',
    })
    return
  }

  getPeerRepo().upsert({
    workspaceId,
    deviceId: peerDeviceId,
    displayName: resolvedDisplayName,
    deviceName: peerDeviceId.slice(0, 8),
    publicKey: resolvePeerPublicKey(peerDeviceId, peerDeviceId),
    trusted: true,
    online: true,
    connectionState: 'connected',
  })
}

export function revokePeerTrustForWorkspace(workspaceId: string, peerDeviceId: string): void {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return
  getPeerRepo().setTrusted(workspaceId, peerDeviceId, false)
}

export function clearPeerTrustPrompt(workspaceId: string, peerDeviceId: string): void {
  promptedPeers.delete(peerPromptKey(workspaceId, peerDeviceId))
}

export function prepareJoinPeerTrustPrompt(
  workspaceId: string,
  peerDeviceId: string,
  displayName: string,
): void {
  revokePeerTrustForWorkspace(workspaceId, peerDeviceId)
  clearPeerTrustPrompt(workspaceId, peerDeviceId)
  registerJoiningPeerForTrust(workspaceId, peerDeviceId, displayName)
  promptPeerTrustIfNeeded(workspaceId, peerDeviceId, { connected: true })
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

export function promptPeerTrustIfNeeded(
  workspaceId: string,
  peerDeviceId: string,
  options?: { connected?: boolean },
): void {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return
  if (options?.connected === false) return
  if (isPeerTrusted(workspaceId, peerDeviceId)) return

  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace || workspace.ownerDeviceId !== localDeviceId) {
    return
  }

  const promptKey = peerPromptKey(workspaceId, peerDeviceId)
  if (promptedPeers.has(promptKey)) return

  let peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  if (!peer) {
    registerJoiningPeerForTrust(workspaceId, peerDeviceId, '成员')
    peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  }
  if (!peer) return

  promptedPeers.add(promptKey)

  const node = resolveDiscoveredNode(peerDeviceId)
  logStructured(
    'p2p',
    'info',
    `peer trust prompt: workspace=${workspaceId} peer=${peerDeviceId.slice(0, 8)}`,
  )
  pendingTrustPrompts.set(promptKey, {
    workspaceId,
    peerDeviceId,
    displayName: peer.displayName,
    deviceName: peer.deviceName,
    publicKeyFingerprint: node?.publicKeyFingerprint ?? peer.publicKey.slice(0, 16),
  })
  broadcastP2pPeerTrustRequired({
    workspaceId,
    peerDeviceId,
    displayName: peer.displayName,
    deviceName: peer.deviceName,
    publicKeyFingerprint: node?.publicKeyFingerprint ?? peer.publicKey.slice(0, 16),
  })
}

export function handlePeerDiscoveryOffline(peerDeviceId: string): void {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return
  if (isP2pPeerDiscoverableOnline(peerDeviceId)) return

  const peerRepo = getPeerRepo()
  const rows = getDatabase()
    .select({ workspaceId: p2pPeerNodes.workspaceId })
    .from(p2pPeerNodes)
    .where(eq(p2pPeerNodes.deviceId, peerDeviceId))
    .all()

  for (const row of rows) {
    peerRepo.updateConnectionState(row.workspaceId, peerDeviceId, 'closed', false)
  }

  void import('./p2p-connection.service').then((module) => {
    void module.disconnectP2pPeer(peerDeviceId).catch(() => undefined)
  })
}

export function handlePeerDiscoveryOnline(peerDeviceId: string): void {
  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return

  const memberRepo = getMemberRepo()
  const workspaceRepo = getWorkspaceRepo()
  const memberships = memberRepo.listActiveMembershipsByDevice(localDeviceId)

  void (async () => {
    const connectionModule = await import('./p2p-connection.service')
    await connectionModule.resetStalePeerConnection(peerDeviceId)

    let ownerReconcileQueued = false
    for (const membership of memberships) {
      const workspace = workspaceRepo.findById(membership.workspaceId)
      if (!workspace) continue

      const peerIsMember = memberRepo.findByWorkspaceAndDevice(membership.workspaceId, peerDeviceId)
      const peerIsOwner = workspace.ownerDeviceId === peerDeviceId
      if (workspace.ownerDeviceId === localDeviceId) {
        if (!ownerReconcileQueued) {
          ownerReconcileQueued = true
          const module = await import('./p2p-member.service')
          void module.runOwnerPeerReconcileTick()
        }
        continue
      }

      if (!peerIsMember && !peerIsOwner) continue

      try {
        if (peerIsOwner) {
          const module = await import('./p2p-member.service')
          await module.ensureMemberConnectsToOwner(workspace.id, { immediate: true })
        } else {
          const module = await import('./p2p-member-mesh.service')
          await module.reconcileWorkspaceMemberMesh(workspace.id, { immediate: true })
        }
      } catch (error) {
        const message = toErrorMessage(error, 'discovery online reconnect failed')
        logStructured('p2p', 'warn', `discovery online reconnect failed for ${peerDeviceId.slice(0, 8)} in ${workspace.id}: ${message}`)
      }
    }
  })()
}

export function handlePeerConnectionChange(
  workspaceId: string | undefined,
  peerDeviceId: string,
  state: P2pConnectionState,
): void {
  const resolvedWorkspaceId = resolveWorkspaceIdForPeerConnection(peerDeviceId, workspaceId)
  if (!resolvedWorkspaceId) return

  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return

  const node = resolveDiscoveredNode(peerDeviceId)
  if (node) {
    upsertPeerFromDiscovery(resolvedWorkspaceId, node, state)
  } else {
    getPeerRepo().upsert({
      workspaceId: resolvedWorkspaceId,
      deviceId: peerDeviceId,
      displayName: resolvePeerDisplayName(resolvedWorkspaceId, peerDeviceId, '未知用户'),
      deviceName: peerDeviceId.slice(0, 8),
      publicKey: peerDeviceId,
      online: state === 'connected',
      connectionState: state,
    })
  }

  if (state !== 'connected') return

  const workspace = getWorkspaceRepo().findById(resolvedWorkspaceId)
  const member = getMemberRepo().findByWorkspaceAndDevice(resolvedWorkspaceId, peerDeviceId)
  const isOwner = workspace?.ownerDeviceId === localDeviceId

  if (!isOwner && member?.status === 'active') {
    trustPeerSilentlyForWorkspaceMesh(resolvedWorkspaceId, peerDeviceId, member.displayName)
    return
  }

  promptPeerTrustIfNeeded(resolvedWorkspaceId, peerDeviceId, { connected: true })
}

export function trustP2pPeerDevice(rawInput: unknown): { trusted: boolean } {
  const input = P2pMemberTrustDeviceInputSchema.parse(rawInput)
  const localDeviceId = getP2pDeviceId()
  if (input.peerDeviceId === localDeviceId) {
    throw new Error('不能信任本机设备')
  }

  const node = resolveDiscoveredNode(input.peerDeviceId)
  if (node) {
    upsertPeerFromDiscovery(input.workspaceId, node, 'connected')
  }

  const updated = getPeerRepo().setTrusted(
    input.workspaceId,
    input.peerDeviceId,
    input.trusted,
  )
  if (!updated) {
    getPeerRepo().upsert({
      workspaceId: input.workspaceId,
      deviceId: input.peerDeviceId,
      displayName: resolvePeerDisplayName(input.workspaceId, input.peerDeviceId, '未知用户'),
      deviceName: node?.deviceName ?? input.peerDeviceId.slice(0, 8),
      publicKey: resolvePeerPublicKey(
        input.peerDeviceId,
        node?.publicKeyFingerprint ?? input.peerDeviceId,
      ),
      trusted: input.trusted,
      connectionState: 'connected',
      online: true,
    })
  }

  const promptKey = peerPromptKey(input.workspaceId, input.peerDeviceId)
  pendingTrustPrompts.delete(promptKey)
  if (input.trusted) {
    promptedPeers.delete(promptKey)
    void (async () => {
      const joinModule = await import('./p2p-member-join.service')
      await joinModule.activateMemberAfterOwnerTrust(input.workspaceId, input.peerDeviceId)
      await notifyP2pPeerConnected(input.workspaceId, input.peerDeviceId)
      const meshModule = await import('./p2p-member-mesh.service')
      void meshModule.reconcileWorkspaceMemberMesh(input.workspaceId)
    })()
  } else {
    void P2pBridge.connectionDisconnect(input.peerDeviceId)
    promptedPeers.delete(promptKey)
  }

  return { trusted: input.trusted }
}

export function listPendingTrustPrompts(): P2pPeerTrustRequiredPayload[] {
  return [...pendingTrustPrompts.values()]
}

export function reemitPendingTrustPromptsToRenderer(): void {
  for (const payload of pendingTrustPrompts.values()) {
    broadcastP2pPeerTrustRequired(payload)
  }
}

export function resetPeerTrustPrompts(): void {
  promptedPeers.clear()
  pendingTrustPrompts.clear()
}

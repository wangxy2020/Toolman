import { logStructured } from '../structured-log.service'
import { fireAndForget } from '../../lib/fire-and-forget'
import type { P2pConnectionState } from '@toolman/shared'
import {
  P2pMemberTrustDeviceInputSchema,
  type P2pPeerTrustRequiredPayload,
} from '@toolman/shared'
import { getP2pDeviceId } from './p2p-device-identity.service'
import { broadcastP2pPeerTrustRequired } from './p2p-peer-broadcast'
import { P2pBridge } from './p2p-bridge'
import { notifyP2pPeerConnected } from './p2p-sync-lifecycle'
import {
  getMemberRepo,
  getPeerRepo,
  getWorkspaceRepo,
  resolveDiscoveredNode,
  resolvePeerDisplayName,
  resolvePeerPublicKey,
  resolveWorkspaceIdForPeerConnection,
} from './p2p-peer-keys'
import { upsertPeerFromDiscovery } from './p2p-peer-registry'

const promptedPeers = new Set<string>()
const pendingTrustPrompts = new Map<string, P2pPeerTrustRequiredPayload>()

function peerPromptKey(workspaceId: string, deviceId: string): string {
  return `${workspaceId}:${deviceId}`
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

export function registerJoiningPeerForTrust(
  workspaceId: string,
  peerDeviceId: string,
  displayName: string,
): void {
  const node = resolveDiscoveredNode(peerDeviceId)
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
    fireAndForget('p2p', (async () => {
      const joinModule = await import('./p2p-member-join.service')
      await joinModule.activateMemberAfterOwnerTrust(input.workspaceId, input.peerDeviceId)
      await notifyP2pPeerConnected(input.workspaceId, input.peerDeviceId)
      const meshModule = await import('./p2p-member-mesh.service')
      void meshModule.reconcileWorkspaceMemberMesh(input.workspaceId)
    })())
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

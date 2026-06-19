import {
  P2pMemberRepository,
  P2pPeerRepository,
  createP2pDeviceIdentityRepository,
} from '@toolman/db'
import type { DiscoveredNode, P2pConnectionState } from '@toolman/shared'
import { P2pMemberTrustDeviceInputSchema } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceId } from './p2p-device-identity.service'
import { listP2pDiscoveredNodes } from './p2p-discovery.service'
import { broadcastP2pPeerTrustRequired } from './p2p-peer-broadcast'
import { P2pBridge } from './p2p-bridge'

const promptedPeers = new Set<string>()

function peerPromptKey(workspaceId: string, deviceId: string): string {
  return `${workspaceId}:${deviceId}`
}

function getPeerRepo(): P2pPeerRepository {
  return new P2pPeerRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function resolveDiscoveredNode(deviceId: string): DiscoveredNode | null {
  return listP2pDiscoveredNodes(false).find((node) => node.deviceId === deviceId) ?? null
}

function resolvePeerPublicKey(deviceId: string, fingerprint: string): string {
  const repo = createP2pDeviceIdentityRepository(getDatabase())
  const row = repo.getByDeviceId(deviceId)
  return row?.publicKey ?? fingerprint
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
    online: node.online,
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

export function handlePeerConnectionChange(
  workspaceId: string | undefined,
  peerDeviceId: string,
  state: P2pConnectionState,
): void {
  if (!workspaceId) return

  const localDeviceId = getP2pDeviceId()
  if (peerDeviceId === localDeviceId) return

  const node = resolveDiscoveredNode(peerDeviceId)
  if (node) {
    upsertPeerFromDiscovery(workspaceId, node, state)
  } else {
    getPeerRepo().upsert({
      workspaceId,
      deviceId: peerDeviceId,
      displayName: resolvePeerDisplayName(workspaceId, peerDeviceId, '未知用户'),
      deviceName: peerDeviceId.slice(0, 8),
      publicKey: peerDeviceId,
      online: state === 'connected',
      connectionState: state,
    })
  }

  if (state !== 'connected') return

  if (isPeerTrusted(workspaceId, peerDeviceId)) return

  const promptKey = peerPromptKey(workspaceId, peerDeviceId)
  if (promptedPeers.has(promptKey)) return
  promptedPeers.add(promptKey)

  const peer = getPeerRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  if (!peer) return

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
  if (input.trusted) {
    promptedPeers.delete(promptKey)
    void import('./p2p-sync.service').then((module) => {
      void module.handleP2pPeerConnected(input.workspaceId, input.peerDeviceId)
    })
  } else {
    void P2pBridge.connectionDisconnect(input.peerDeviceId)
    promptedPeers.delete(promptKey)
  }

  return { trusted: input.trusted }
}

export function resetPeerTrustPrompts(): void {
  promptedPeers.clear()
}

import {
  P2pMemberRepository,
  P2pPeerRepository,
  P2pWorkspaceRepository,
  createP2pDeviceIdentityRepository,
  p2pPeerNodes,
} from '@toolman/db'
import type { DiscoveredNode, P2pConnectionState } from '@toolman/shared'
import {P2pMemberTrustDeviceInputSchema, toErrorMessage } from '@toolman/shared'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceId } from './p2p-device-identity.service'
import { isP2pPeerDiscoverableOnline, listP2pDiscoveredNodes } from './p2p-discovery.service'
import { broadcastP2pPeerTrustRequired } from './p2p-peer-broadcast'
import { P2pBridge } from './p2p-bridge'
import { notifyP2pPeerConnected } from './p2p-sync-lifecycle'

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

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function resolveDiscoveredNode(deviceId: string): DiscoveredNode | null {
  return listP2pDiscoveredNodes(false).find((node) => node.deviceId === deviceId) ?? null
}

export function resolvePeerPublicKey(deviceId: string, fingerprint: string): string {
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
  promptedPeers.add(promptKey)

  const node = resolveDiscoveredNode(peerDeviceId)
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
    for (const membership of memberships) {
      const workspace = workspaceRepo.findById(membership.workspaceId)
      if (!workspace) continue

      const peerIsMember = memberRepo.findByWorkspaceAndDevice(membership.workspaceId, peerDeviceId)
      const peerIsOwner = workspace.ownerDeviceId === peerDeviceId
      if (!peerIsMember && !peerIsOwner) continue

      try {
        if (workspace.ownerDeviceId === localDeviceId) {
          const module = await import('./p2p-member.service')
          await module.reconcileOwnerWorkspaceMembers(workspace.id, { immediate: true })
        } else if (peerIsOwner) {
          const module = await import('./p2p-member.service')
          await module.ensureMemberConnectsToOwner(workspace.id, { immediate: true })
        } else {
          const module = await import('./p2p-member-mesh.service')
          await module.reconcileWorkspaceMemberMesh(workspace.id, { immediate: true })
        }
      } catch (error) {
        const message = toErrorMessage(error, 'discovery online reconnect failed')
        console.warn(
          `[p2p] discovery online reconnect failed for ${peerDeviceId.slice(0, 8)} in ${workspace.id}: ${message}`,
        )
      }
    }
  })()
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

  const workspace = getWorkspaceRepo().findById(workspaceId)
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  const isOwner = workspace?.ownerDeviceId === localDeviceId

  if (!isOwner && member?.status === 'active') {
    trustPeerSilentlyForWorkspaceMesh(workspaceId, peerDeviceId, member.displayName)
    return
  }

  promptPeerTrustIfNeeded(workspaceId, peerDeviceId, { connected: true })
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
    void notifyP2pPeerConnected(input.workspaceId, input.peerDeviceId)
    void import('./p2p-member-mesh.service').then((module) => {
      void module.reconcileWorkspaceMemberMesh(input.workspaceId)
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

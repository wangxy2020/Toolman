import { eq } from 'drizzle-orm'
import { identities } from '@toolman/db'
import os from 'node:os'
import type { DiscoveredNode } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getAppInfo } from '../../ipc/app'
import { P2pBridge, type NativeDiscoveredNode } from './p2p-bridge'
import {
  getP2pDeviceId,
  getP2pPublicKeyFingerprint,
} from './p2p-device-identity.service'
import { applyP2pNetworkConfig } from './p2p-network.config'
import {
  broadcastP2pDiscoveryNodeOffline,
  broadcastP2pDiscoveryNodeOnline,
} from './p2p-discovery-broadcast'
import { handlePeerDiscoveryOffline, handlePeerDiscoveryOnline } from './p2p-peer.service'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
const POLL_INTERVAL_MS = 2_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let ownerReconcileTimer: ReturnType<typeof setInterval> | null = null
const OWNER_RECONCILE_INTERVAL_MS = 6_000
const knownNodes = new Map<string, DiscoveredNode>()

function getLocalUserName(): string {
  const row = getDatabase()
    .select({ displayName: identities.displayName })
    .from(identities)
    .where(eq(identities.id, DEFAULT_IDENTITY_ID))
    .get()
  return row?.displayName ?? '本地用户'
}

function mapNativeNode(node: NativeDiscoveredNode): DiscoveredNode {
  return {
    deviceId: node.deviceId,
    deviceName: node.deviceName,
    userName: node.userName,
    publicKeyFingerprint: node.publicKeyFingerprint || 'pending',
    online: node.online,
    lastSeenAt: node.lastSeenAt,
  }
}

function syncPushEvents(nodes: DiscoveredNode[]): void {
  const nextById = new Map(nodes.map((node) => [node.deviceId, node]))

  for (const [deviceId, node] of nextById) {
    const previous = knownNodes.get(deviceId)
    if (!previous) {
      broadcastP2pDiscoveryNodeOnline(node)
      void handlePeerDiscoveryOnline(deviceId)
      continue
    }
    if (!previous.online && node.online) {
      broadcastP2pDiscoveryNodeOnline(node)
      void handlePeerDiscoveryOnline(deviceId)
    }
  }

  for (const [deviceId, previous] of knownNodes) {
    const next = nextById.get(deviceId)
    if (!next) {
      broadcastP2pDiscoveryNodeOffline(deviceId)
      void handlePeerDiscoveryOffline(deviceId)
      continue
    }
    if (previous.online && !next.online) {
      broadcastP2pDiscoveryNodeOffline(deviceId)
      void handlePeerDiscoveryOffline(deviceId)
    }
  }

  knownNodes.clear()
  for (const [deviceId, node] of nextById) {
    knownNodes.set(deviceId, node)
  }
}

function pollDiscoveredNodes(): void {
  if (!P2pBridge.discoveryIsRunning()) return
  const nodes = P2pBridge.discoveryListNodes(false).map(mapNativeNode)
  syncPushEvents(nodes)
}

function stopOwnerReconcileLoop(): void {
  if (ownerReconcileTimer) {
    clearInterval(ownerReconcileTimer)
    ownerReconcileTimer = null
  }
}

function startOwnerReconcileLoop(): void {
  if (ownerReconcileTimer) return
  ownerReconcileTimer = setInterval(() => {
    void import('./p2p-member.service').then((module) => module.runOwnerPeerReconcileTick())
  }, OWNER_RECONCILE_INTERVAL_MS)
}

function startPolling(): void {
  stopPolling()
  pollDiscoveredNodes()
  pollTimer = setInterval(pollDiscoveredNodes, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  knownNodes.clear()
}

export function startP2pDiscovery(): void {
  try {
    applyP2pNetworkConfig()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[p2p] ICE config apply failed (discovery will still start): ${message}`)
  }

  const { version } = getAppInfo()
  P2pBridge.discoveryStart({
    deviceId: getP2pDeviceId(),
    deviceName: os.hostname(),
    userName: getLocalUserName(),
    publicKeyFingerprint: getP2pPublicKeyFingerprint(),
    appVersion: version,
  })
  startPolling()
  startOwnerReconcileLoop()
}

export function stopP2pDiscovery(): void {
  stopPolling()
  stopOwnerReconcileLoop()
  P2pBridge.discoveryStop()
}

export function listP2pDiscoveredNodes(onlineOnly = false): DiscoveredNode[] {
  return P2pBridge.discoveryListNodes(onlineOnly).map(mapNativeNode)
}

export function isP2pPeerDiscoverableOnline(peerDeviceId: string): boolean {
  return listP2pDiscoveredNodes(true).some((node) => node.deviceId === peerDeviceId)
}

export function isP2pDiscoveryRunning(): boolean {
  return P2pBridge.discoveryIsRunning()
}

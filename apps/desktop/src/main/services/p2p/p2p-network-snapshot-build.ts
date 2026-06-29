import { toErrorMessage } from '@toolman/shared'
import {
  P2pLibp2pDhtModeSchema,
  P2pNetworkGetSnapshotOutputSchema,
  type P2pNetworkSnapshot,
} from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { listP2pConnections } from './p2p-connection.service'
import { Libp2pBridge } from './libp2p-bridge'
import { readLibp2pConfig } from './p2p-libp2p.config'

let lastError: string | null = null

export function getLastNetworkError(): string | null {
  return lastError
}

export function setLastNetworkError(error: string | null): void {
  lastError = error
}

function parseDhtMode(value: string): P2pNetworkSnapshot['dht']['mode'] {
  const parsed = P2pLibp2pDhtModeSchema.safeParse(value)
  return parsed.success ? parsed.data : 'client'
}

async function countWebrtcConnectedPeers(): Promise<number> {
  try {
    const connections = await listP2pConnections()
    return connections.filter((row) => row.state === 'connected').length
  } catch {
    return 0
  }
}

export async function buildP2pNetworkSnapshot(): Promise<P2pNetworkSnapshot> {
  const libp2pAvailable = Libp2pBridge.isAvailable()
  let libp2pVersion: string | null = null
  let libp2pRunning = false
  let localPeerId: string | null = null
  let libp2pPeerCount = 0
  let libp2pPeers: P2pNetworkSnapshot['peers'] = []
  let dhtHealth: P2pNetworkSnapshot['dht'] = {
    mode: readLibp2pConfig().dhtMode,
    bootstrapCount: readLibp2pConfig().bootstrapMultiaddrs.length,
    ready: false,
    error: null,
  }

  if (libp2pAvailable) {
    try {
      libp2pVersion = Libp2pBridge.version()
      const nativeSnapshot = Libp2pBridge.networkGetSnapshot()
      libp2pRunning = nativeSnapshot.running
      localPeerId = nativeSnapshot.localPeerId ?? null
      libp2pPeerCount = nativeSnapshot.peerCount
      libp2pPeers = nativeSnapshot.peers.map((peer) => ({
        peerId: peer.peerId,
        deviceId: null,
        transport: 'libp2p' as const,
        connectedAt: peer.connectedAt,
      }))
      dhtHealth = {
        mode: parseDhtMode(nativeSnapshot.dht.mode),
        bootstrapCount: nativeSnapshot.dht.bootstrapCount,
        ready: nativeSnapshot.dht.ready,
        error: nativeSnapshot.dht.error ?? null,
      }
      if (nativeSnapshot.error) {
        lastError = nativeSnapshot.error
      }
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      lastError = message
      recordDiagnosticEvent('libp2p', 'warn', message)
    }
  }

  const webrtcConnectedPeers = await countWebrtcConnectedPeers()
  const webrtcPeers: P2pNetworkSnapshot['peers'] = []
  try {
    const connections = await listP2pConnections()
    for (const connection of connections) {
      if (connection.state !== 'connected') continue
      webrtcPeers.push({
        peerId: connection.peerDeviceId,
        deviceId: connection.peerDeviceId,
        transport: 'webrtc',
        connectedAt: connection.connectedAt,
      })
    }
  } catch {
    // Ignore WebRTC list failures; libp2p snapshot still useful.
  }

  return P2pNetworkGetSnapshotOutputSchema.parse({
    collectedAt: Date.now(),
    libp2pAvailable,
    libp2pVersion,
    libp2pRunning,
    localPeerId,
    libp2pPeerCount,
    webrtcConnectedPeers,
    peers: [...libp2pPeers, ...webrtcPeers],
    dht: dhtHealth,
    error: lastError,
  })
}

export function getP2pNetworkSnapshot(): Promise<P2pNetworkSnapshot> {
  return buildP2pNetworkSnapshot()
}

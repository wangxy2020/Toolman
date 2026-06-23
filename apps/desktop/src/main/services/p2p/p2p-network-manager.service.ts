import { app } from 'electron'
import {
  P2pLibp2pDhtModeSchema,
  P2pNetworkGetSnapshotOutputSchema,
  type P2pNetworkSnapshot,
} from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { P2pBridge } from './p2p-bridge'
import { listP2pConnections } from './p2p-connection.service'
import { ensureP2pDeviceIdentity } from './p2p-device-identity.service'
import { Libp2pBridge } from './libp2p-bridge'
import { broadcastP2pNetworkSnapshotUpdated } from './p2p-network-broadcast'
import { ensureDefaultLibp2pConfig, readLibp2pConfig } from './p2p-libp2p.config'

const POLL_INTERVAL_MS = 3_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let started = false
let lastError: string | null = null

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
      const message = error instanceof Error ? error.message : String(error)
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

async function pollAndBroadcast(): Promise<void> {
  const snapshot = await buildP2pNetworkSnapshot()
  broadcastP2pNetworkSnapshotUpdated(snapshot)
}

export function startP2pNetworkManager(): void {
  if (started) return
  started = true

  if (!Libp2pBridge.isAvailable()) {
    recordDiagnosticEvent('libp2p', 'warn', 'toolman-libp2p native module unavailable')
    void pollAndBroadcast()
    pollTimer = setInterval(() => {
      void pollAndBroadcast()
    }, POLL_INTERVAL_MS)
    return
  }

  void bootstrapLibp2pNetwork()

  pollTimer = setInterval(() => {
    void pollAndBroadcast()
  }, POLL_INTERVAL_MS)
}

async function bootstrapLibp2pNetwork(): Promise<void> {
  try {
    ensureP2pDeviceIdentity()
    if (P2pBridge.isAvailable()) {
      P2pBridge.ping()
    }
    const config = ensureDefaultLibp2pConfig()
    Libp2pBridge.networkStart(app.getPath('userData'), JSON.stringify(config))
    await waitForLibp2pRunning(5_000)
    const peerId = Libp2pBridge.networkLocalPeerId()
    const running = Libp2pBridge.networkIsRunning()
    if (!running) {
      const snapshot = Libp2pBridge.networkGetSnapshot()
      const message = snapshot.error ?? 'libp2p swarm failed to start'
      lastError = message
      recordDiagnosticEvent('libp2p', 'error', message)
    } else {
      recordDiagnosticEvent(
        'libp2p',
        'info',
        `network started (peer=${peerId ?? 'unknown'})`,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    lastError = message
    recordDiagnosticEvent('libp2p', 'error', message)
  }

  void pollAndBroadcast()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForLibp2pRunning(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (Libp2pBridge.networkIsRunning()) {
      return true
    }
    await sleep(100)
  }
  return Libp2pBridge.networkIsRunning()
}

export function stopP2pNetworkManager(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  if (Libp2pBridge.isAvailable()) {
    try {
      Libp2pBridge.networkStop()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recordDiagnosticEvent('libp2p', 'warn', `network stop failed: ${message}`)
    }
  }

  started = false
}

export function isP2pNetworkManagerRunning(): boolean {
  if (!Libp2pBridge.isAvailable()) return false
  try {
    return Libp2pBridge.networkIsRunning()
  } catch {
    return false
  }
}

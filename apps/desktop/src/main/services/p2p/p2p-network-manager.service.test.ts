import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/toolman-network-manager-test' },
}))

vi.mock('./libp2p-bridge', () => ({
  Libp2pBridge: {
    isAvailable: vi.fn(() => true),
    version: vi.fn(() => '0.1.0-test'),
    networkGetSnapshot: vi.fn(() => ({
      running: true,
      localPeerId: 'peer-local',
      peerCount: 2,
      peers: [{ peerId: 'peer-a', connectedAt: Date.now() }],
      dht: { mode: 'client', bootstrapCount: 1, ready: true, error: null },
    })),
    networkIsRunning: vi.fn(() => true),
    networkStop: vi.fn(),
  },
}))

vi.mock('./p2p-bridge', () => ({
  P2pBridge: {
    isAvailable: vi.fn(() => true),
    version: vi.fn(() => '0.1.0-native'),
  },
}))

vi.mock('./p2p-connection.service', () => ({
  listP2pConnections: vi.fn(async () => [
    { peerDeviceId: 'dev-a', state: 'connected' },
    { peerDeviceId: 'dev-b', state: 'idle' },
  ]),
}))

vi.mock('./p2p-device-identity.service', () => ({
  ensureP2pDeviceIdentity: vi.fn(),
}))

vi.mock('../diagnostics-log', () => ({
  recordDiagnosticEvent: vi.fn(),
}))

vi.mock('./p2p-network-broadcast', () => ({
  broadcastP2pNetworkSnapshotUpdated: vi.fn(),
}))

vi.mock('./p2p-libp2p-resync', () => ({
  ensureLibp2pDependentPubsubResync: vi.fn(),
}))

import { Libp2pBridge } from './libp2p-bridge'
import {
  buildP2pNetworkSnapshot,
  getLibp2pRestartStatus,
  isP2pNetworkManagerRunning,
  stopP2pNetworkManager,
} from './p2p-network-manager.service'

describe('p2p-network-manager.service', () => {
  beforeEach(() => {
    stopP2pNetworkManager()
    vi.clearAllMocks()
    vi.mocked(Libp2pBridge.isAvailable).mockReturnValue(true)
  })

  it('builds network snapshot from native bridge', async () => {
    const snapshot = await buildP2pNetworkSnapshot()
    expect(snapshot.libp2pRunning).toBe(true)
    expect(snapshot.libp2pPeerCount).toBe(2)
    expect(snapshot.webrtcConnectedPeers).toBe(1)
  })

  it('reports libp2p restart status', () => {
    expect(getLibp2pRestartStatus().enabled).toBe(false)
  })

  it('checks whether libp2p network is running', () => {
    expect(isP2pNetworkManagerRunning()).toBe(true)
    vi.mocked(Libp2pBridge.isAvailable).mockReturnValue(false)
    expect(isP2pNetworkManagerRunning()).toBe(false)
  })
})

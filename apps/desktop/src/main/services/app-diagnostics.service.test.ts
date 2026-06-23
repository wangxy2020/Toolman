import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-test-userdata',
    getVersion: () => '0.1.0-test',
  },
}))

vi.mock('../bootstrap/database', () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => ({ count: 0 }),
        }),
      }),
    }),
  }),
}))

vi.mock('./community/community-bridge.service', () => ({
  getCommunityHubStatus: () => ({
    running: false,
    port: null,
    host: '127.0.0.1',
    baseUrl: null,
    binaryPath: null,
  }),
}))

vi.mock('./community/community-ipc.facade', () => ({
  getHubHealth: vi.fn(),
}))

vi.mock('./p2p/p2p-bridge', () => ({
  P2pBridge: {
    ping: () => 'pong',
    version: () => '0.1.0-test',
  },
}))

vi.mock('./p2p/p2p-connection.service', () => ({
  listP2pConnections: async () => [],
}))

vi.mock('./p2p/p2p-device-identity.service', () => ({
  getP2pDeviceInfo: () => ({
    deviceId: '00000000-0000-0000-0000-000000000099',
    displayName: 'Tester',
  }),
}))

vi.mock('./p2p/p2p-discovery.service', () => ({
  isP2pDiscoveryRunning: () => true,
}))

vi.mock('./identity.service', () => ({
  getIdentityProfile: () => ({
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Tester',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
}))

vi.mock('./p2p/p2p-workspace.service', () => ({
  listP2pWorkspaces: () => [],
}))

describe('getAppDiagnostics', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns a structured diagnostics snapshot', async () => {
    const { getAppDiagnostics } = await import('./app-diagnostics.service')
    const snapshot = await getAppDiagnostics()

    expect(snapshot.database.path).toContain('toolman.db')
    expect(snapshot.p2p.nativeAvailable).toBe(true)
    expect(snapshot.p2p.deviceId).toBe('00000000-0000-0000-0000-000000000099')
    expect(snapshot.communityHub.running).toBe(false)
    expect(snapshot.ingest.pendingJobs).toBe(0)
  })
})

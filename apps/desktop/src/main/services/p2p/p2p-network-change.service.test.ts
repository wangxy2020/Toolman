import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isOnline = vi.hoisted(() => vi.fn(() => true))

vi.mock('electron', () => ({
  net: { isOnline },
}))

vi.mock('../structured-log.service', () => ({
  logStructured: vi.fn(),
}))

vi.mock('./p2p-network.config', () => ({
  applyP2pNetworkConfig: vi.fn(),
}))

vi.mock('./p2p-discovery.service', () => ({
  stopP2pDiscovery: vi.fn(),
  startP2pDiscovery: vi.fn(),
}))

vi.mock('./p2p-connection.service', () => ({
  listP2pConnections: vi.fn(async () => []),
  disconnectP2pPeer: vi.fn(async () => undefined),
}))

vi.mock('./p2p-member.service', () => ({
  reconcileOwnerWorkspaceMembers: vi.fn(async () => undefined),
}))

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

vi.mock('@toolman/db', () => ({
  P2pWorkspaceRepository: class {
    listActive() {
      return [{ id: 'ws-1' }]
    }
  },
}))

import { logStructured } from '../structured-log.service'
import { startP2pDiscovery, stopP2pDiscovery } from './p2p-discovery.service'
import {
  startP2pNetworkChangeMonitor,
  stopP2pNetworkChangeMonitor,
} from './p2p-network-change.service'

describe('p2p-network-change.service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stopP2pNetworkChangeMonitor()
    vi.clearAllMocks()
    isOnline.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    stopP2pNetworkChangeMonitor()
  })

  it('starts and stops network polling', () => {
    startP2pNetworkChangeMonitor()
    startP2pNetworkChangeMonitor()
    stopP2pNetworkChangeMonitor()
    expect(logStructured).not.toHaveBeenCalled()
  })

  it('recovers when network goes offline then online', async () => {
    startP2pNetworkChangeMonitor()
    isOnline.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(stopP2pDiscovery).toHaveBeenCalled()

    isOnline.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(startP2pDiscovery).toHaveBeenCalled()
    stopP2pNetworkChangeMonitor()
  })

  it('logs recovery failures without crashing', async () => {
    const { applyP2pNetworkConfig } = await import('./p2p-network.config')
    vi.mocked(applyP2pNetworkConfig).mockImplementationOnce(() => {
      throw new Error('config failed')
    })
    startP2pNetworkChangeMonitor()
    isOnline.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(logStructured).toHaveBeenCalledWith(
      'p2p.network_change',
      'warn',
      'network change recovery failed',
      expect.objectContaining({ message: 'config failed' }),
    )
    stopP2pNetworkChangeMonitor()
  })
})

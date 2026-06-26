import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp/toolman-test') },
}))

vi.mock('./p2p-bridge', () => ({
  P2pBridge: {
    isAvailable: vi.fn(() => false),
    connectionSetIceServers: vi.fn(),
  },
}))

vi.mock('../diagnostics-log', () => ({
  recordDiagnosticEvent: vi.fn(),
}))

vi.mock('../structured-log.service', () => ({
  logStructured: vi.fn(),
}))

import { P2pBridge } from './p2p-bridge'
import { recordDiagnosticEvent } from '../diagnostics-log'
import {
  applyP2pNetworkConfig,
  getP2pIceServers,
  getP2pStunServers,
  getP2pWanNetworkReadiness,
  resetP2pNetworkLogDedupForTests,
  setP2pIceServers,
  setP2pStunServers,
} from './p2p-network.config'

describe('p2p-network.config', () => {
  const originalEnv = { ...process.env }
  const configDir = join('/tmp/toolman-test', 'p2p')

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.TOOLMAN_P2P_ICE_SERVERS
    delete process.env.TOOLMAN_P2P_TURN_URL
    delete process.env.TOOLMAN_P2P_TURN_USERNAME
    delete process.env.TOOLMAN_P2P_TURN_CREDENTIAL
    delete process.env.TOOLMAN_P2P_XIRSYS_IDENT
    delete process.env.TOOLMAN_P2P_XIRSYS_SECRET
    delete process.env.TOOLMAN_P2P_XIRSYS_CHANNEL
    delete process.env.TOOLMAN_P2P_XIRSYS_PATH
    if (existsSync(configDir)) {
      rmSync(configDir, { recursive: true, force: true })
    }
    mkdirSync(configDir, { recursive: true })
    resetP2pNetworkLogDedupForTests()
    vi.mocked(P2pBridge.isAvailable).mockReturnValue(false)
    vi.mocked(P2pBridge.connectionSetIceServers).mockClear()
    vi.mocked(recordDiagnosticEvent).mockClear()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('reports WAN not ready when TURN is missing', () => {
    const readiness = getP2pWanNetworkReadiness()
    expect(readiness.ready).toBe(false)
    expect(readiness.reasonCode).toBe('turn_not_configured')
  })

  it('reads TURN config from env', () => {
    process.env.TOOLMAN_P2P_TURN_URL = 'turn:turn.example.com:3478'
    process.env.TOOLMAN_P2P_TURN_USERNAME = 'user'
    process.env.TOOLMAN_P2P_TURN_CREDENTIAL = 'pass'
    const servers = getP2pIceServers()
    expect(servers.some((server) => String(server.urls).includes('turn.example.com'))).toBe(true)
    expect(getP2pWanNetworkReadiness().ready).toBe(true)
  })

  it('persists xirsys config when writing ice servers', () => {
    process.env.TOOLMAN_P2P_XIRSYS_IDENT = 'toolman'
    process.env.TOOLMAN_P2P_XIRSYS_SECRET = 'secret'
    process.env.TOOLMAN_P2P_XIRSYS_CHANNEL = 'channel-test'
    setP2pIceServers([
      {
        urls: 'turn:turn.example.com:3478',
        username: 'user',
        credential: 'pass',
      },
    ])
    const raw = JSON.parse(readFileSync(join(configDir, 'network.json'), 'utf8')) as {
      xirsys?: { channel?: string }
    }
    expect(raw.xirsys?.channel).toBe('channel-test')
  })

  it('persists stun and ice servers to network.json', () => {
    setP2pStunServers(['stun:stun.example.com:3478'])
    expect(getP2pStunServers()).toContain('stun:stun.example.com:3478')

    setP2pIceServers([
      {
        urls: 'turn:turn.example.com:3478',
        username: 'user',
        credential: 'pass',
      },
    ])
    expect(getP2pIceServers()[0]?.credential).toBe('pass')
  })

  it('applies network config when native bridge is available', () => {
    vi.mocked(P2pBridge.isAvailable).mockReturnValue(true)
    applyP2pNetworkConfig()
    expect(P2pBridge.connectionSetIceServers).toHaveBeenCalled()
  })

  it('logs WAN readiness warning only once until config changes', () => {
    vi.mocked(P2pBridge.isAvailable).mockReturnValue(true)
    vi.mocked(recordDiagnosticEvent).mockClear()

    applyP2pNetworkConfig()
    applyP2pNetworkConfig()
    applyP2pNetworkConfig()

    expect(recordDiagnosticEvent).toHaveBeenCalledTimes(1)

    setP2pIceServers([
      {
        urls: 'turn:turn.example.com:3478',
        username: 'user',
        credential: 'pass',
      },
    ])
    vi.mocked(recordDiagnosticEvent).mockClear()

    applyP2pNetworkConfig()
    expect(recordDiagnosticEvent).not.toHaveBeenCalled()
  })
})

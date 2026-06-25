import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/toolman-libp2p-config-test' },
}))

import {
  ensureDefaultLibp2pConfig,
  readLibp2pConfig,
  writeLibp2pConfig,
} from './p2p-libp2p.config'

describe('p2p-libp2p.config', () => {
  const configDir = join('/tmp/toolman-libp2p-config-test', 'p2p')

  beforeEach(() => {
    if (existsSync(configDir)) {
      rmSync(configDir, { recursive: true, force: true })
    }
    mkdirSync(configDir, { recursive: true })
  })

  it('returns defaults when config file is missing', () => {
    expect(readLibp2pConfig()).toMatchObject({
      mdnsEnabled: true,
      dhtMode: 'client',
    })
  })

  it('writes and reads libp2p config', () => {
    writeLibp2pConfig({
      mdnsEnabled: false,
      dhtMode: 'server',
      bootstrapMultiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
    })
    expect(readLibp2pConfig()).toMatchObject({
      mdnsEnabled: false,
      dhtMode: 'server',
    })
  })

  it('creates default config file on first ensure', () => {
    const config = ensureDefaultLibp2pConfig()
    expect(config.mdnsEnabled).toBe(true)
    expect(existsSync(join(configDir, 'libp2p.json'))).toBe(true)
  })
})

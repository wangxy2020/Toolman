import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

vi.mock('../config/release-update', () => ({
  getBakedUpdateChannel: () => 'stable',
  getBakedUpdateFeedUrl: () => '',
}))

import { getAppUpdateConfig } from './app-update.config'

describe('app-update.config', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.TOOLMAN_UPDATE_CHANNEL
    delete process.env.TOOLMAN_UPDATE_FEED_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('defaults to stable channel with updates disabled in dev', () => {
    const config = getAppUpdateConfig()
    expect(config.channel).toBe('stable')
    expect(config.enabled).toBe(false)
  })

  it('builds manifest urls when feed url is configured', () => {
    process.env.TOOLMAN_UPDATE_FEED_URL = 'https://cdn.example.com/toolman'
    const config = getAppUpdateConfig()
    expect(config.manifestUrl).toContain('https://cdn.example.com/toolman')
    expect(config.autoUpdaterFeedUrl).toContain(process.platform)
  })
})

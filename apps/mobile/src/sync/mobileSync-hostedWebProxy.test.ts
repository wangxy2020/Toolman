import { afterEach, describe, expect, it, vi } from 'vitest'
import { OFFICIAL_TOOLMAN_HUB_URL } from '@toolman/shared'

const hostedWeb = vi.hoisted(() => ({ current: false }))

vi.mock('./desktopDevHost', () => ({
  isHostedWebPage: () => hostedWeb.current,
  listDesktopDevHostnames: () => [],
  shouldProbeLoopbackSyncHub: () => false,
  pageHostname: () => (hostedWeb.current ? 'www.toolman.work' : ''),
}))

vi.mock('../storage/identityScope', () => ({
  getCurrentDataIdentity: () => null,
}))

vi.mock('../storage/secure', () => ({
  loadIdentity: async () => null,
}))

vi.mock('../settings/prefs', () => ({
  loadModulePrefs: async () => ({ sync: {}, community: {} }),
}))

import {
  COMMUNITY_HUB_SYNC_PROXY_BASE,
  classifyMobileSyncTransport,
  isWanCommunitySyncUrl,
  rewriteSyncBaseUrlForClient,
} from './mobileSync-client'

describe('hosted web sync proxy rewrite', () => {
  afterEach(() => {
    hostedWeb.current = false
  })

  it('keeps official hub absolute on native / local web', () => {
    hostedWeb.current = false
    expect(rewriteSyncBaseUrlForClient(OFFICIAL_TOOLMAN_HUB_URL)).toBe(OFFICIAL_TOOLMAN_HUB_URL)
    expect(classifyMobileSyncTransport(OFFICIAL_TOOLMAN_HUB_URL)).toBe('community-hub')
  })

  it('rewrites official hub to same-origin proxy on hosted web', () => {
    hostedWeb.current = true
    expect(rewriteSyncBaseUrlForClient(OFFICIAL_TOOLMAN_HUB_URL)).toBe(COMMUNITY_HUB_SYNC_PROXY_BASE)
    expect(rewriteSyncBaseUrlForClient(`${OFFICIAL_TOOLMAN_HUB_URL}/`)).toBe(
      COMMUNITY_HUB_SYNC_PROXY_BASE,
    )
    expect(isWanCommunitySyncUrl(COMMUNITY_HUB_SYNC_PROXY_BASE)).toBe(true)
    expect(classifyMobileSyncTransport(COMMUNITY_HUB_SYNC_PROXY_BASE)).toBe('community-hub')
  })

  it('does not rewrite LAN Sync Hub URLs on hosted web', () => {
    hostedWeb.current = true
    expect(rewriteSyncBaseUrlForClient('http://192.168.1.8:17890')).toBe('http://192.168.1.8:17890')
  })
})

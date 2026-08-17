import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}))

vi.mock('./desktopDevHost', () => ({
  isHostedWebPage: vi.fn(() => true),
}))

vi.mock('./mobileSync-client', () => ({
  COMMUNITY_HUB_SYNC_PROXY_BASE: '/api/community-hub',
  createMobileSyncClient: vi.fn(),
  getMobileSyncBaseUrl: () => 'http://127.0.0.1:17890',
  rewriteSyncBaseUrlForClient: (baseUrl: string) => baseUrl.trim().replace(/\/+$/, ''),
}))

import { isHostedWebPage } from './desktopDevHost'
import {
  isBrowserSafeMailboxUrl,
  listPersonalMailboxBaseUrls,
} from './personalMailboxHubs'

const samplePairing = {
  identityId: 'ag-1',
  workspaceId: 'psync:ag-1',
  workspaceKeyB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  grant: 'grant-token-at-least-16',
  localDeviceId: 'phone-1',
  peerDeviceId: 'desk-1',
  pairedAt: Date.now(),
  role: 'web' as const,
  hubBaseUrlHint: 'http://127.0.0.1:17890',
  reachableHubUrls: ['http://127.0.0.1:17890', 'http://192.168.1.8:17890', 'https://desktop.ts.net'],
}

describe('personalMailboxHubs', () => {
  afterEach(() => {
    vi.mocked(isHostedWebPage).mockReturnValue(true)
  })

  it('rejects LAN HTTP and same-origin Hub proxy on hosted HTTPS web', () => {
    expect(isBrowserSafeMailboxUrl('http://127.0.0.1:17890')).toBe(false)
    expect(isBrowserSafeMailboxUrl('http://192.168.1.8:17890')).toBe(false)
    expect(isBrowserSafeMailboxUrl('/api/community-hub')).toBe(false)
    expect(isBrowserSafeMailboxUrl('https://hub.toolman.app')).toBe(true)
    expect(isBrowserSafeMailboxUrl('https://desktop.ts.net')).toBe(true)
  })

  it('on hosted web only keeps HTTPS reachable Hub URLs (no official Hub fallback)', () => {
    const hubs = listPersonalMailboxBaseUrls(samplePairing)
    expect(hubs).toEqual(['https://desktop.ts.net'])
    expect(hubs.some((url) => url.includes('hub.toolman'))).toBe(false)
    expect(hubs.some((url) => url.includes('community-hub'))).toBe(false)
  })

  it('keeps LAN URLs when page is not hosted web', () => {
    vi.mocked(isHostedWebPage).mockReturnValue(false)
    const hubs = listPersonalMailboxBaseUrls(samplePairing)
    expect(hubs[0]).toBe('http://127.0.0.1:17890')
    expect(hubs).toContain('http://192.168.1.8:17890')
  })
})

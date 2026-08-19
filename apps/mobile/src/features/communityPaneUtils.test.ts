import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'web' },
}))

import { communityListPageStatus } from './communityPaneUtils'

describe('communityListPageStatus', () => {
  it('does not tell hosted web to start a local desktop for public news', () => {
    const status = communityListPageStatus({
      error: null,
      offline: true,
      loading: false,
      itemCount: 0,
      hubBaseUrl: 'http://127.0.0.1:3721',
      triedHubUrls: [],
      hostedWeb: true,
    })
    expect(status.tone).toBe('warning')
    expect(status.message).not.toMatch(/请先启动本机桌面端/)
    expect(status.message).toMatch(/社区 Hub/)
    expect(status.meta).toBeUndefined()
  })

  it('keeps tried addresses in the status meta', () => {
    const status = communityListPageStatus({
      error: null,
      offline: true,
      loading: false,
      itemCount: 0,
      hubBaseUrl: 'http://127.0.0.1:3721',
      triedHubUrls: ['http://192.168.1.8:3721'],
      hostedWeb: true,
    })
    expect(status.meta).toBe('http://192.168.1.8:3721')
  })
})

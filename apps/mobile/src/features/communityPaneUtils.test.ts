import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'web' },
}))

import { communityListPageStatus } from './communityPaneUtils'

describe('communityListPageStatus', () => {
  it('tells hosted web to use the local desktop sidecar, not a central Hub', () => {
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
    expect(status.message).toMatch(/允许访问本地网络/)
    expect(status.message).not.toMatch(/公共社区目录/)
    expect(status.meta).toBeUndefined()
  })

  it('keeps tried addresses in the status meta', () => {
    const status = communityListPageStatus({
      error: null,
      offline: true,
      loading: false,
      itemCount: 0,
      hubBaseUrl: 'http://127.0.0.1:3721',
      triedHubUrls: [
        'https://hub.toolman.app',
        'http://localhost:3721',
        'http://127.0.0.1:3721',
      ],
      hostedWeb: true,
    })
    expect(status.meta).toBe('hub.toolman.app · localhost:3721')
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'web' },
}))

import { communityListPageStatus } from './communityPaneUtils'

describe('communityListPageStatus', () => {
  it('does not point hosted web at the official Hub', () => {
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
    expect(status.message).not.toMatch(/官方 Hub/)
    expect(status.message).toMatch(/HTTPS/)
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

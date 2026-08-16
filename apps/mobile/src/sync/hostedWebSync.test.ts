import { describe, expect, it, vi } from 'vitest'

vi.mock('./desktopDevHost', () => ({
  isHostedWebPage: () => true,
}))

import { hostedWebSyncBlockedReason, isHttpsSyncUrl } from './hostedWebSync'

describe('hostedWebSync', () => {
  it('allows official HTTPS hub fallback on hosted web', () => {
    expect(isHttpsSyncUrl('http://127.0.0.1:17890')).toBe(false)
    expect(hostedWebSyncBlockedReason({ configuredSyncBaseUrl: 'http://192.168.1.8:17890' })).toBeNull()
    expect(
      hostedWebSyncBlockedReason({ configuredSyncBaseUrl: 'https://desktop.ts.net' }),
    ).toBeNull()
  })
})

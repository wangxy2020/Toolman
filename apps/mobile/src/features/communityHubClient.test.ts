import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: {}, expoGoConfig: {} },
}))
vi.mock('../sync/desktopDevHost', () => ({
  isHostedWebPage: vi.fn(() => false),
  pageHostname: vi.fn(() => ''),
}))

import { isHostedWebPage } from '../sync/desktopDevHost'
import { communityHubRequestUrl, isCommunityHubHealthBody } from './communityHubClient'

describe('communityHubRequestUrl', () => {
  it('uses the Expo same-origin proxy for loopback hubs on web', () => {
    expect(communityHubRequestUrl('http://127.0.0.1:3721', '/health')).toBe(
      '/api/community-hub/health',
    )
    expect(communityHubRequestUrl('http://localhost:3721', '/api/v1/health')).toBe(
      '/api/community-hub/api/v1/health',
    )
  })

  it('keeps remote hubs on their own origin', () => {
    expect(communityHubRequestUrl('https://hub.toolman.app', '/health')).toBe(
      'https://hub.toolman.app/health',
    )
  })

  it('talks to loopback Community Hub directly on hosted web', () => {
    vi.mocked(isHostedWebPage).mockReturnValue(true)
    expect(communityHubRequestUrl('http://127.0.0.1:3721', '/health')).toBe(
      'http://127.0.0.1:3721/health',
    )
    vi.mocked(isHostedWebPage).mockReturnValue(false)
  })
})

describe('isCommunityHubHealthBody', () => {
  it('accepts Hub JSON and rejects HTML', () => {
    expect(isCommunityHubHealthBody('{"ok":true}')).toBe(true)
    expect(isCommunityHubHealthBody('{"status":"ok"}')).toBe(true)
    expect(isCommunityHubHealthBody('<!doctype html>')).toBe(false)
    expect(isCommunityHubHealthBody('')).toBe(false)
  })
})

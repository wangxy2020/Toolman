import { describe, expect, it } from 'vitest'
import { OFFICIAL_TOOLMAN_HUB_URL } from '@toolman/shared'
import {
  DEFAULT_COMMUNITY_HUB_BASE_URL,
  pickReachableCommunityHubBaseUrl,
  resolveCommunityHubBaseUrl,
} from '../settings/communityHubUrl'

describe('resolveCommunityHubBaseUrl', () => {
  it('falls back to the local desktop hub when unset', () => {
    expect(resolveCommunityHubBaseUrl('')).toBe(DEFAULT_COMMUNITY_HUB_BASE_URL)
    expect(resolveCommunityHubBaseUrl('   ')).toBe(DEFAULT_COMMUNITY_HUB_BASE_URL)
    expect(resolveCommunityHubBaseUrl(null)).toBe(DEFAULT_COMMUNITY_HUB_BASE_URL)
  })

  it('keeps a custom address and strips a trailing slash', () => {
    expect(resolveCommunityHubBaseUrl('http://192.168.1.8:3721/')).toBe(
      'http://192.168.1.8:3721',
    )
  })
})

describe('pickReachableCommunityHubBaseUrl', () => {
  it('uses the first candidate the probe accepts', async () => {
    const picked = await pickReachableCommunityHubBaseUrl('', async (url) =>
      url === OFFICIAL_TOOLMAN_HUB_URL,
    )
    expect(picked.online).toBe(true)
    expect(picked.url).toBe(OFFICIAL_TOOLMAN_HUB_URL)
    expect(picked.tried[0]).toBe('http://localhost:3721')
  })
})

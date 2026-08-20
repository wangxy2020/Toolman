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

  it('ignores the unused central Hub hostname', () => {
    expect(resolveCommunityHubBaseUrl(OFFICIAL_TOOLMAN_HUB_URL)).toBe(DEFAULT_COMMUNITY_HUB_BASE_URL)
  })
})

describe('pickReachableCommunityHubBaseUrl', () => {
  it('uses the first candidate the probe accepts', async () => {
    const picked = await pickReachableCommunityHubBaseUrl('', async (url) =>
      url === 'http://localhost:3721',
    )
    expect(picked.online).toBe(true)
    expect(picked.url).toBe('http://localhost:3721')
    expect(picked.tried[0]).toBe('http://localhost:3721')
  })

  it('does not auto-probe the official Hub unless asked', async () => {
    const picked = await pickReachableCommunityHubBaseUrl('', async () => false, {
      includeLoopback: false,
    })
    expect(picked.online).toBe(false)
    expect(picked.tried).toEqual([])
    expect(picked.tried).not.toContain(OFFICIAL_TOOLMAN_HUB_URL)
  })

  it('can probe a public Hub URL only when explicitly asked', async () => {
    const picked = await pickReachableCommunityHubBaseUrl('', async (url) => url === OFFICIAL_TOOLMAN_HUB_URL, {
      includeLoopback: false,
      includeOfficialHub: true,
      officialHubFirst: true,
    })
    expect(picked.online).toBe(true)
    expect(picked.url).toBe(OFFICIAL_TOOLMAN_HUB_URL)
    expect(picked.tried).toEqual([OFFICIAL_TOOLMAN_HUB_URL])
  })

  it('uses same-computer loopback as the decentralized catalog', async () => {
    const picked = await pickReachableCommunityHubBaseUrl('', async (url) => url === DEFAULT_COMMUNITY_HUB_BASE_URL, {
      includeLoopback: true,
      includeOfficialHub: false,
      officialHubFirst: false,
    })
    expect(picked.online).toBe(true)
    expect(picked.url).toBe(DEFAULT_COMMUNITY_HUB_BASE_URL)
    expect(picked.tried[0]).not.toBe(OFFICIAL_TOOLMAN_HUB_URL)
    expect(picked.tried).toContain(DEFAULT_COMMUNITY_HUB_BASE_URL)
  })
})

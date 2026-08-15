import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL, OFFICIAL_TOOLMAN_HUB_URL } from '@toolman/shared'
import { communityHubProxyTarget, resolveCommunityHubProxyOrigin } from './communityHubProxy'

describe('communityHubProxy', () => {
  const previousVercel = process.env.VERCEL
  const previousUpstream = process.env.COMMUNITY_HUB_UPSTREAM

  afterEach(() => {
    if (previousVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previousVercel
    if (previousUpstream === undefined) delete process.env.COMMUNITY_HUB_UPSTREAM
    else process.env.COMMUNITY_HUB_UPSTREAM = previousUpstream
  })

  it('forwards local Expo web to the desktop sidecar', () => {
    delete process.env.VERCEL
    delete process.env.COMMUNITY_HUB_UPSTREAM
    expect(resolveCommunityHubProxyOrigin()).toBe(DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL)
    expect(communityHubProxyTarget('http://localhost/api/community-hub/health')).toBe(
      `${DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL}/health`,
    )
  })

  it('forwards Vercel to the official Hub unless overridden', () => {
    process.env.VERCEL = '1'
    delete process.env.COMMUNITY_HUB_UPSTREAM
    expect(resolveCommunityHubProxyOrigin()).toBe(OFFICIAL_TOOLMAN_HUB_URL)
  })
})

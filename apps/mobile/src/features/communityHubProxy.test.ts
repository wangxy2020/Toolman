import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL } from '@toolman/shared'
import { communityHubProxyTarget, resolveCommunityHubProxyOrigin } from './communityHubProxy'

describe('communityHubProxy', () => {
  const previousVercel = process.env.VERCEL
  const previousUpstream = process.env.COMMUNITY_HUB_UPSTREAM
  const previousExpoUpstream = process.env.EXPO_PUBLIC_COMMUNITY_HUB_UPSTREAM

  afterEach(() => {
    if (previousVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previousVercel
    if (previousUpstream === undefined) delete process.env.COMMUNITY_HUB_UPSTREAM
    else process.env.COMMUNITY_HUB_UPSTREAM = previousUpstream
    if (previousExpoUpstream === undefined) delete process.env.EXPO_PUBLIC_COMMUNITY_HUB_UPSTREAM
    else process.env.EXPO_PUBLIC_COMMUNITY_HUB_UPSTREAM = previousExpoUpstream
  })

  it('forwards local Expo web to the desktop sidecar', () => {
    delete process.env.VERCEL
    delete process.env.COMMUNITY_HUB_UPSTREAM
    delete process.env.EXPO_PUBLIC_COMMUNITY_HUB_UPSTREAM
    expect(resolveCommunityHubProxyOrigin()).toBe(DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL)
    expect(communityHubProxyTarget('http://localhost/api/community-hub/health')).toBe(
      `${DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL}/health`,
    )
    expect(
      communityHubProxyTarget(
        'http://localhost/api/community-hub?u=%2Fapi%2Fv1%2Fnews%2Farticles%3Fsort%3Ddiverse%26limit%3D1',
      ),
    ).toBe(`${DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL}/api/v1/news/articles?sort=diverse&limit=1`)
  })

  it('does not invent a central Hub on Vercel', () => {
    process.env.VERCEL = '1'
    delete process.env.COMMUNITY_HUB_UPSTREAM
    delete process.env.EXPO_PUBLIC_COMMUNITY_HUB_UPSTREAM
    expect(resolveCommunityHubProxyOrigin()).toBe('')
  })

  it('ignores a loopback Expo upstream on Vercel', () => {
    process.env.VERCEL = '1'
    delete process.env.COMMUNITY_HUB_UPSTREAM
    process.env.EXPO_PUBLIC_COMMUNITY_HUB_UPSTREAM = 'http://127.0.0.1:3721'
    expect(resolveCommunityHubProxyOrigin()).toBe('')
  })
})

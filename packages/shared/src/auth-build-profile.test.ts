import { describe, expect, it } from 'vitest'

import {
  isAuthLoginAllowed,
  resolveAllowedRegions,
  resolveDefaultRegionForBuild,
  type AuthBuildProfile,
} from './auth-build-profile.js'

function profile(buildRegion: AuthBuildProfile['buildRegion']): AuthBuildProfile {
  const allowedRegions = resolveAllowedRegions(buildRegion)
  return {
    buildRegion,
    allowedRegions,
    defaultRegion: resolveDefaultRegionForBuild(buildRegion),
    regionSwitchEnabled: buildRegion === 'global',
    cnAuthEnabled: buildRegion === 'cn' || buildRegion === 'global',
    intlAuthEnabled: buildRegion === 'intl' || buildRegion === 'global',
  }
}

describe('auth-build-profile', () => {
  it('global build allows both regions and providers', () => {
    const p = profile('global')
    expect(isAuthLoginAllowed(p, 'cn', 'tencent_phone')).toBe(true)
    expect(isAuthLoginAllowed(p, 'intl', 'firebase_email')).toBe(true)
  })

  it('cn build rejects intl login', () => {
    const p = profile('cn')
    expect(isAuthLoginAllowed(p, 'cn', 'tencent_wechat')).toBe(true)
    expect(isAuthLoginAllowed(p, 'intl', 'firebase_google')).toBe(false)
  })

  it('intl build rejects cn login', () => {
    const p = profile('intl')
    expect(isAuthLoginAllowed(p, 'intl', 'firebase_apple')).toBe(true)
    expect(isAuthLoginAllowed(p, 'cn', 'tencent_phone')).toBe(false)
  })
})

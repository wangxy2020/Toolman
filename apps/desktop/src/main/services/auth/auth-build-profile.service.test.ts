import { afterEach, describe, expect, it, vi } from 'vitest'

describe('auth-build-profile.service', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('defaults to global build with both regions enabled', async () => {
    delete process.env.TOOLMAN_AUTH_BUILD_REGION
    delete process.env.TOOLMAN_BUILD_REGION

    const { getAuthBuildProfile } = await import('./auth-build-profile.service')
    const profile = getAuthBuildProfile()

    expect(profile.buildRegion).toBe('global')
    expect(profile.allowedRegions).toEqual(['cn', 'intl'])
    expect(profile.regionSwitchEnabled).toBe(true)
    expect(profile.cnAuthEnabled).toBe(true)
    expect(profile.intlAuthEnabled).toBe(true)
  })

  it('locks cn build to domestic providers only', async () => {
    process.env.TOOLMAN_AUTH_BUILD_REGION = 'cn'

    const { getAuthBuildProfile, assertAuthLoginAllowed } = await import('./auth-build-profile.service')
    const profile = getAuthBuildProfile()

    expect(profile.buildRegion).toBe('cn')
    expect(profile.allowedRegions).toEqual(['cn'])
    expect(profile.regionSwitchEnabled).toBe(false)
    expect(() => assertAuthLoginAllowed('intl', 'firebase_email')).toThrow('国内版')
  })

  it('locks intl build to firebase providers only', async () => {
    process.env.TOOLMAN_AUTH_BUILD_REGION = 'intl'

    const { getAuthBuildProfile, assertAuthLoginAllowed } = await import('./auth-build-profile.service')
    const profile = getAuthBuildProfile()

    expect(profile.buildRegion).toBe('intl')
    expect(profile.allowedRegions).toEqual(['intl'])
    expect(() => assertAuthLoginAllowed('cn', 'tencent_phone')).toThrow('国际版')
  })
})

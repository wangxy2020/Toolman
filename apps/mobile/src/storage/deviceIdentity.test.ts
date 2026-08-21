import { describe, expect, it } from 'vitest'
import {
  bindIdentityToDevice,
  createMobileDeviceId,
  normalizeDeviceIdentity,
  shouldKeepLegacyDeviceId,
} from './deviceIdentityCore'

describe('deviceIdentity', () => {
  it('creates a prefixed UUID-shaped device id', () => {
    const id = createMobileDeviceId()
    expect(shouldKeepLegacyDeviceId(id)).toBe(true)
    expect(id).toMatch(
      /^(web-|mobile-)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('keeps legacy mobile-* and web-* ids and binds login identity', () => {
    expect(shouldKeepLegacyDeviceId('mobile-abc-1234')).toBe(true)
    expect(shouldKeepLegacyDeviceId('web-abc-1234')).toBe(true)
    const device = normalizeDeviceIdentity(null, 'mobile-abc-1234')
    expect(device.deviceId).toBe('mobile-abc-1234')
    expect(device.identityId).toBeNull()
    const bound = bindIdentityToDevice(device, 'id-user-b')
    expect(bound.identityId).toBe('id-user-b')
    expect(bound.boundAt).toEqual(expect.any(Number))
    expect(bindIdentityToDevice(bound, null).identityId).toBeNull()
  })
})

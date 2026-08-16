import { describe, expect, it } from 'vitest'
import { looksLikeAuthingUserId, resolveDeviceSyncIdentityId } from './device-sync-identity.js'

describe('resolveDeviceSyncIdentityId', () => {
  it('maps Firebase bindings to fb-{subject}', () => {
    expect(
      resolveDeviceSyncIdentityId({
        bindings: [{ provider: 'firebase_google', subjectId: 'uid-1' }],
        fallbackIdentityId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toBe('fb-uid-1')
  })

  it('maps Authing 24-hex subject to ag-{subject}', () => {
    expect(
      resolveDeviceSyncIdentityId({
        bindings: [{ provider: 'tencent_phone', subjectId: 'abcdef0123456789abcdef01' }],
        fallbackIdentityId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toBe('ag-abcdef0123456789abcdef01')
  })

  it('keeps mobile ag-/fb- fallback identity', () => {
    expect(
      resolveDeviceSyncIdentityId({
        bindings: [],
        fallbackIdentityId: 'ag-abcdef0123456789abcdef01',
      }),
    ).toBe('ag-abcdef0123456789abcdef01')
  })

  it('falls back to desktop guest UUID when no account binding', () => {
    expect(
      resolveDeviceSyncIdentityId({
        bindings: [{ provider: 'tencent_phone', subjectId: '+8613800138000' }],
        fallbackIdentityId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('detects Authing user ids', () => {
    expect(looksLikeAuthingUserId('abcdef0123456789abcdef01')).toBe(true)
    expect(looksLikeAuthingUserId('+8613800138000')).toBe(false)
  })
})

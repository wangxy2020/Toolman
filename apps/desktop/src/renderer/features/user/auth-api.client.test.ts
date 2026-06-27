import { describe, expect, it } from 'vitest'

import {
  AuthGetSessionOutputSchema,
  AuthLoginInputSchema,
  AuthLogoutOutputSchema,
  canBrowseCommunityReadOnly,
  canUseCommunityWrite,
  isRegisteredAuthSession,
} from '@toolman/shared'

describe('auth shared schemas', () => {
  it('parses guest session output', () => {
    const parsed = AuthGetSessionOutputSchema.parse({
      registrationStatus: 'guest',
      identityId: '00000000-0000-0000-0000-000000000001',
      authRegion: null,
      subscriptionSku: null,
      entitlements: [],
      userType: 'guest',
      authingRoles: [],
      displayName: '本地用户',
      avatarUrl: null,
      bindings: [],
      isLoggedIn: false,
      preferredRegion: null,
      tokenExpiresAt: null,
      lastLoginAt: null,
    })

    expect(canBrowseCommunityReadOnly(parsed)).toBe(true)
    expect(isRegisteredAuthSession(parsed)).toBe(false)
    expect(canUseCommunityWrite(parsed)).toBe(false)
  })

  it('parses login input', () => {
    const parsed = AuthLoginInputSchema.parse({
      region: 'intl',
      method: 'firebase_email',
      payload: { email: 'a@b.com' },
    })
    expect(parsed.method).toBe('firebase_email')
  })

  it('parses logout output', () => {
    const parsed = AuthLogoutOutputSchema.parse({
      session: {
        registrationStatus: 'registered',
        identityId: '00000000-0000-0000-0000-000000000001',
        authRegion: 'cn',
        subscriptionSku: 'community',
        entitlements: [],
        userType: 'normal',
        authingRoles: [],
        displayName: 'User',
        bindings: [],
        isLoggedIn: false,
      },
    })
    expect(parsed.session.isLoggedIn).toBe(false)
  })
})

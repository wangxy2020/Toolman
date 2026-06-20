import { afterEach, describe, expect, it } from 'vitest'

import { DELETE_REAUTH_RECENT_LOGIN_MS } from '@toolman/shared'

import {
  assertDeleteAccountReauth,
  consumeReauthToken,
  createReauthToken,
  resetReauthTokensForTests,
} from './auth-reauth.service.js'
import { AuthLoginError } from './auth-login.error.js'

const IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

function registeredSession(lastLoginAt: number | null) {
  return {
    registrationStatus: 'registered' as const,
    identityId: IDENTITY_ID,
    authRegion: 'intl' as const,
    subscriptionSku: 'community' as const,
    entitlements: ['community.write'],
    displayName: 'User',
    avatarUrl: null,
    bindings: [],
    isLoggedIn: true,
    preferredRegion: 'intl' as const,
    tokenExpiresAt: null,
    lastLoginAt,
  }
}

describe('auth-reauth.service', () => {
  afterEach(() => {
    resetReauthTokensForTests()
  })

  it('allows delete when login is recent', () => {
    const now = 1_700_000_000_000
    expect(() =>
      assertDeleteAccountReauth(
        { confirmation: 'DELETE' },
        registeredSession(now - 60_000),
        now,
      ),
    ).not.toThrow()
  })

  it('requires reauth token when login is stale', () => {
    const now = 1_700_000_000_000
    expect(() =>
      assertDeleteAccountReauth(
        { confirmation: 'DELETE' },
        registeredSession(now - DELETE_REAUTH_RECENT_LOGIN_MS - 1),
        now,
      ),
    ).toThrow(AuthLoginError)
  })

  it('accepts a one-time reauth token', () => {
    const now = 1_700_000_000_000
    const token = createReauthToken(IDENTITY_ID, now)
    expect(consumeReauthToken(token, IDENTITY_ID, now)).toBe(true)
    expect(consumeReauthToken(token, IDENTITY_ID, now)).toBe(false)
  })
})

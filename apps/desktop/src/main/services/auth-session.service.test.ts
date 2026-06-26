import { describe, expect, it } from 'vitest'

import {
  canUseCommunityWrite,
  canUseGroupFeatures,
  isRegisteredAuthSession,
} from '@toolman/shared'

import { buildAuthSessionView } from './auth-session.service'
import { AUTH_SESSION_SLOT } from '@toolman/db'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

describe('buildAuthSessionView', () => {
  it('maps guest session defaults', () => {
    const session = buildAuthSessionView({
      registrationStatus: 'guest',
      identityId: DEFAULT_IDENTITY_ID,
      displayName: '本地用户',
      bindings: [],
      session: {
        id: AUTH_SESSION_SLOT,
        identityId: DEFAULT_IDENTITY_ID,
        isLoggedIn: false,
        preferredRegion: null,
        accessTokenRef: null,
        refreshTokenRef: null,
        idTokenRef: null,
        hubTokenRef: null,
        tokenExpiresAt: null,
        lastLoginAt: null,
        updatedAt: new Date(),
      },
    })

    expect(session.registrationStatus).toBe('guest')
    expect(session.isLoggedIn).toBe(false)
    expect(session.userType).toBe('guest')
    expect(session.authingRoles).toEqual([])
    expect(isRegisteredAuthSession(session)).toBe(false)
    expect(canUseCommunityWrite(session)).toBe(false)
    expect(canUseGroupFeatures(session)).toBe(false)
  })

  it('maps registered logged-in session', () => {
    const now = new Date()
    const session = buildAuthSessionView({
      registrationStatus: 'registered',
      identityId: DEFAULT_IDENTITY_ID,
      displayName: 'Registered User',
      authRegion: 'intl',
      subscriptionSku: 'community',
      entitlements: ['community.write'],
      bindings: [
        {
          provider: 'firebase_email',
          subjectId: 'uid-1',
          label: 'user@example.com',
          verifiedAt: now.getTime(),
        },
      ],
      session: {
        id: AUTH_SESSION_SLOT,
        identityId: DEFAULT_IDENTITY_ID,
        isLoggedIn: true,
        preferredRegion: 'intl',
        accessTokenRef: 'keychain:access',
        refreshTokenRef: null,
        idTokenRef: null,
        hubTokenRef: null,
        tokenExpiresAt: now,
        lastLoginAt: now,
        updatedAt: now,
      },
    })

    expect(session.subscriptionSku).toBe('community')
    expect(session.userType).toBe('normal')
    expect(canUseCommunityWrite(session)).toBe(true)
    expect(canUseGroupFeatures(session)).toBe(true)
  })
})

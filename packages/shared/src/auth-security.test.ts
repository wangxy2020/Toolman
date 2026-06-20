import { describe, expect, it } from 'vitest'

import {
  isRecentAuthLogin,
  pickPrimaryDeleteReauthMethod,
  requiresDeleteReauth,
  resolveDeleteReauthMethods,
  DELETE_REAUTH_RECENT_LOGIN_MS,
} from './auth-security.js'

describe('auth-security', () => {
  const now = 1_700_000_000_000

  it('treats login within 15 minutes as recent', () => {
    expect(isRecentAuthLogin(now - DELETE_REAUTH_RECENT_LOGIN_MS + 1, now)).toBe(true)
    expect(isRecentAuthLogin(now - DELETE_REAUTH_RECENT_LOGIN_MS - 1, now)).toBe(false)
  })

  it('prefers phone reauth when both bindings exist', () => {
    const bindings = [
      {
        provider: 'firebase_email' as const,
        subjectId: 'uid-1',
        verifiedAt: now,
      },
      {
        provider: 'tencent_phone' as const,
        subjectId: '+8613800138000',
        verifiedAt: now,
      },
    ]

    expect(resolveDeleteReauthMethods(bindings)).toEqual(['tencent_phone', 'firebase_email'])
    expect(pickPrimaryDeleteReauthMethod(bindings)).toBe('tencent_phone')
  })

  it('requires reauth when login is stale and a method exists', () => {
    const bindings = [
      {
        provider: 'firebase_email' as const,
        subjectId: 'uid-1',
        label: 'user@example.com',
        verifiedAt: now,
      },
    ]

    expect(requiresDeleteReauth(now - DELETE_REAUTH_RECENT_LOGIN_MS - 1, bindings, now)).toBe(true)
    expect(requiresDeleteReauth(now - 60_000, bindings, now)).toBe(false)
  })
})

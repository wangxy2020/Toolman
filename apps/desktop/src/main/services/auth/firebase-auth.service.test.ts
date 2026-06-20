import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  firebaseLookupIdToken,
  firebaseSignInWithEmail,
  mapFirebaseProviderIds,
} from './firebase-auth.service'

const config = {
  apiKey: 'test-api-key',
  authDomain: 'toolman-test.firebaseapp.com',
  projectId: 'toolman-test',
}

describe('firebase-auth.service', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signs in with email via Identity Toolkit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          localId: 'uid-email',
          email: 'user@example.com',
          idToken: 'id-token',
          refreshToken: 'refresh-token',
          expiresIn: '3600',
        }),
      ),
    )

    const result = await firebaseSignInWithEmail(config, 'user@example.com', 'secret123', 'login')
    expect(result.localId).toBe('uid-email')
    expect(result.idToken).toBe('id-token')
    expect(result.providerIds).toEqual(['password'])
  })

  it('maps firebase provider ids', () => {
    expect(mapFirebaseProviderIds(['google.com'], 'firebase_google')).toBe('firebase_google')
    expect(mapFirebaseProviderIds(['apple.com'], 'firebase_apple')).toBe('firebase_apple')
    expect(mapFirebaseProviderIds(['password'], 'firebase_email')).toBe('firebase_email')
  })

  it('looks up id token and extracts provider ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          users: [
            {
              localId: 'uid-google',
              email: 'user@gmail.com',
              providerUserInfo: [{ providerId: 'google.com' }],
            },
          ],
        }),
      ),
    )

    const result = await firebaseLookupIdToken(config, 'google-id-token')
    expect(result.localId).toBe('uid-google')
    expect(result.providerIds).toEqual(['google.com'])
  })

  it('maps firebase errors to friendly messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { message: 'EMAIL_EXISTS', code: 400 } },
          { status: 400 },
        ),
      ),
    )

    await expect(
      firebaseSignInWithEmail(config, 'user@example.com', 'secret123', 'register'),
    ).rejects.toThrow('该邮箱已注册，请直接登录')
  })
})

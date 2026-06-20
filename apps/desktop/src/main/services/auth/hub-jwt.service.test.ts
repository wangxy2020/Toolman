import { jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'

import { mintHubAccessToken } from './hub-jwt.service'
import {
  HUB_JWT_AUDIENCE,
  HUB_JWT_ISSUER,
} from './hub-jwt.constants'

describe('hub-jwt.service', () => {
  it('mints a verifiable HS256 hub access token', async () => {
    const secret = 'unit-test-hub-jwt-secret'
    const identityId = '00000000-0000-0000-0000-000000000001'

    const { accessToken, expiresAt } = await mintHubAccessToken({
      identityId,
      registrationStatus: 'registered',
      sku: 'community',
      ttlSeconds: 120,
      secretOverride: secret,
    })

    expect(expiresAt).toBeGreaterThan(Date.now())

    const verified = await jwtVerify(
      accessToken,
      new TextEncoder().encode(secret),
      {
        issuer: HUB_JWT_ISSUER,
        audience: HUB_JWT_AUDIENCE,
      },
    )

    expect(verified.payload.sub).toBe(identityId)
    expect(verified.payload.registration_status).toBe('registered')
    expect(verified.payload.sku).toBe('community')
  })

  it('includes guest registration status for read-only sessions', async () => {
    const secret = 'unit-test-hub-jwt-secret-guest'

    const { accessToken } = await mintHubAccessToken({
      identityId: '00000000-0000-0000-0000-000000000001',
      registrationStatus: 'guest',
      ttlSeconds: 120,
      secretOverride: secret,
    })

    const verified = await jwtVerify(
      accessToken,
      new TextEncoder().encode(secret),
      {
        issuer: HUB_JWT_ISSUER,
        audience: HUB_JWT_AUDIENCE,
      },
    )

    expect(verified.payload.registration_status).toBe('guest')
    expect(verified.payload.sku).toBeUndefined()
  })
})

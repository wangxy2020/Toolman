import { SignJWT } from 'jose'

import type { ProductSku, RegistrationStatus } from '@toolman/shared'

import {
  HUB_JWT_AUDIENCE,
  HUB_JWT_ISSUER,
  HUB_JWT_TTL_SECONDS,
} from './hub-jwt.constants'
import { getHubJwtSecret } from './hub-jwt-secret.service'

export interface MintHubAccessTokenInput {
  identityId: string
  registrationStatus: RegistrationStatus
  sku?: ProductSku | null
  ttlSeconds?: number
  /** Test-only override to avoid Electron secret storage. */
  secretOverride?: string
}

export interface MintHubAccessTokenResult {
  accessToken: string
  expiresAt: number
}

export async function mintHubAccessToken(
  input: MintHubAccessTokenInput,
): Promise<MintHubAccessTokenResult> {
  const ttlSeconds = input.ttlSeconds ?? HUB_JWT_TTL_SECONDS
  const secretMaterial = input.secretOverride ?? (await getHubJwtSecret())
  const secret = new TextEncoder().encode(secretMaterial)
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = (issuedAt + ttlSeconds) * 1000

  const payload: Record<string, string> = {
    registration_status: input.registrationStatus,
  }
  if (input.sku) {
    payload.sku = input.sku
  }

  const accessToken = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.identityId)
    .setIssuer(HUB_JWT_ISSUER)
    .setAudience(HUB_JWT_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(secret)

  return { accessToken, expiresAt }
}

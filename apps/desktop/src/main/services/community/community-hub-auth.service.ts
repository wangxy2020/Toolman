import type { ProductSku } from '@toolman/shared'

import { getAuthSession } from '../auth-session.service'
import { exchangeAuthHubToken } from '../auth/auth-hub-token.service'
import { HUB_JWT_TTL_SECONDS } from '../auth/hub-jwt.constants'

export interface CommunityHubAuthContext {
  authorization?: string
  identityId: string
  sku?: ProductSku
}

let cached: {
  token: string
  expiresAt: number
  identityId: string
  registrationStatus: string
} | null = null

const REFRESH_SKEW_MS = 60_000

export function invalidateHubTokenCache(): void {
  cached = null
}

export async function resolveCommunityHubAuth(): Promise<CommunityHubAuthContext> {
  const session = getAuthSession()

  if (
    cached &&
    cached.identityId === session.identityId &&
    cached.registrationStatus === session.registrationStatus &&
    cached.expiresAt > Date.now() + REFRESH_SKEW_MS
  ) {
    return {
      authorization: `Bearer ${cached.token}`,
      identityId: session.identityId,
      sku: session.subscriptionSku ?? undefined,
    }
  }

  const { accessToken, expiresAt } = await exchangeAuthHubToken()
  const resolvedExpiresAt = expiresAt ?? Date.now() + HUB_JWT_TTL_SECONDS * 1000
  cached = {
    token: accessToken,
    expiresAt: resolvedExpiresAt,
    identityId: session.identityId,
    registrationStatus: session.registrationStatus,
  }

  return {
    authorization: `Bearer ${accessToken}`,
    identityId: session.identityId,
    sku: session.subscriptionSku ?? undefined,
  }
}

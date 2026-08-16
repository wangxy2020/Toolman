import { resolveDeviceSyncIdentityId, type ProductSku } from '@toolman/shared'

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
  /** Desktop session id — cache key (not the device_sync bucket id). */
  sessionIdentityId: string
  deviceSyncIdentityId: string
  registrationStatus: string
} | null = null

const REFRESH_SKEW_MS = 60_000

export function invalidateHubTokenCache(): void {
  cached = null
}

export function resolveCommunityDeviceSyncIdentityId(): string {
  const session = getAuthSession()
  return resolveDeviceSyncIdentityId({
    bindings: session.bindings,
    fallbackIdentityId: session.identityId,
  })
}

export async function resolveCommunityHubAuth(): Promise<CommunityHubAuthContext> {
  const session = getAuthSession()
  const deviceSyncIdentityId = resolveCommunityDeviceSyncIdentityId()

  if (
    cached &&
    cached.sessionIdentityId === session.identityId &&
    cached.deviceSyncIdentityId === deviceSyncIdentityId &&
    cached.registrationStatus === session.registrationStatus &&
    cached.expiresAt > Date.now() + REFRESH_SKEW_MS
  ) {
    return {
      authorization: `Bearer ${cached.token}`,
      identityId: deviceSyncIdentityId,
      sku: session.subscriptionSku ?? undefined,
    }
  }

  const { accessToken, expiresAt } = await exchangeAuthHubToken()
  const resolvedExpiresAt = expiresAt ?? Date.now() + HUB_JWT_TTL_SECONDS * 1000
  cached = {
    token: accessToken,
    expiresAt: resolvedExpiresAt,
    sessionIdentityId: session.identityId,
    deviceSyncIdentityId,
    registrationStatus: session.registrationStatus,
  }

  return {
    authorization: `Bearer ${accessToken}`,
    identityId: deviceSyncIdentityId,
    sku: session.subscriptionSku ?? undefined,
  }
}

import { AuthSessionRepository } from '@toolman/db'
import { resolveDeviceSyncIdentityId, type AuthExchangeHubTokenOutput } from '@toolman/shared'

import { getDatabase } from '../../bootstrap/database'
import { getAuthSession } from '../auth-session.service'
import { encryptSecret } from '../secret-store'
import { mintHubAccessToken } from './hub-jwt.service'
import { resolveRegisteredEmail } from './resolve-registered-email'

export async function exchangeAuthHubToken(): Promise<AuthExchangeHubTokenOutput> {
  const session = getAuthSession()
  const identityId = resolveDeviceSyncIdentityId({
    bindings: session.bindings,
    fallbackIdentityId: session.identityId,
  })
  const { accessToken, expiresAt } = await mintHubAccessToken({
    identityId,
    registrationStatus: session.registrationStatus,
    sku: session.subscriptionSku,
    email: resolveRegisteredEmail(session.identityId),
    communityRole: session.communityRole ?? null,
  })

  const db = getDatabase()
  const sessionRepo = new AuthSessionRepository(db)
  sessionRepo.updateCurrent({
    hubTokenRef: encryptSecret(accessToken),
  })

  return {
    accessToken,
    expiresAt,
  }
}

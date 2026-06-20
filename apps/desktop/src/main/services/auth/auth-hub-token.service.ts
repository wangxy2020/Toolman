import { AuthSessionRepository } from '@toolman/db'
import type { AuthExchangeHubTokenOutput } from '@toolman/shared'

import { getDatabase } from '../../bootstrap/database'
import { getAuthSession } from '../auth-session.service'
import { encryptSecret } from '../secret-store'
import { mintHubAccessToken } from './hub-jwt.service'

export async function exchangeAuthHubToken(): Promise<AuthExchangeHubTokenOutput> {
  const session = getAuthSession()
  const { accessToken, expiresAt } = await mintHubAccessToken({
    identityId: session.identityId,
    registrationStatus: session.registrationStatus,
    sku: session.subscriptionSku,
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

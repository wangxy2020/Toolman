import { eq } from 'drizzle-orm'

import {
  AuthBindingRepository,
  AuthSessionRepository,
  identities,
  type AuthBindingMetadata,
} from '@toolman/db'
import type { AuthProvider, AuthRegion, AuthSession } from '@toolman/shared'

import { getDatabase } from '../../bootstrap/database'
import { invalidateHubTokenCache } from '../community/community-hub-auth.service'
import { encryptSecret } from '../secret-store'
import { getAuthSession } from '../auth-session.service'
import { bindP2pDeviceToIdentity, refreshP2pDeviceIdentityBinding } from '../p2p/p2p-device-identity.service'
import { AuthLoginError } from './auth-login.error.js'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

export interface PersistAuthLoginInput {
  region: AuthRegion
  provider: AuthProvider
  subjectId: string
  bindingLabel?: string
  bindingMetadata?: AuthBindingMetadata
  accessToken: string
  refreshToken?: string | null
  expiresInSeconds?: number
}

function computeTokenExpiresAt(expiresInSeconds?: number): Date {
  const ttlMs =
    expiresInSeconds && expiresInSeconds > 0 ? expiresInSeconds * 1000 : 3600_000
  return new Date(Date.now() + ttlMs)
}

export function upsertAuthBinding(input: {
  identityId?: string
  provider: AuthProvider
  subjectId: string
  bindingLabel?: string
  bindingMetadata?: AuthBindingMetadata
}): void {
  const identityId = input.identityId ?? DEFAULT_IDENTITY_ID
  const db = getDatabase()
  const bindingRepo = new AuthBindingRepository(db)
  const existingBinding = bindingRepo.findByProviderSubject(input.provider, input.subjectId)
  if (existingBinding && existingBinding.identityId !== identityId) {
    throw new AuthLoginError('该登录方式已绑定到其他 Toolman 账户')
  }

  bindingRepo.upsert({
    identityId,
    provider: input.provider,
    subjectId: input.subjectId,
    metadata: {
      ...(input.bindingMetadata ?? {}),
      label: input.bindingLabel ?? input.bindingMetadata?.label,
    },
    verifiedAt: new Date(),
  })
}

export function persistAuthLogin(input: PersistAuthLoginInput): AuthSession {
  const db = getDatabase()
  const sessionRepo = new AuthSessionRepository(db)
  const now = new Date()
  const identityId = DEFAULT_IDENTITY_ID

  upsertAuthBinding({
    identityId,
    provider: input.provider,
    subjectId: input.subjectId,
    bindingLabel: input.bindingLabel,
    bindingMetadata: input.bindingMetadata,
  })

  const identityRow = db.select().from(identities).where(eq(identities.id, identityId)).get()
  if (!identityRow) {
    throw new Error('Default identity not found')
  }

  db.update(identities)
    .set({
      type: 'linked',
      registrationStatus: 'registered',
      authRegion: input.region,
      subscriptionSku: identityRow.subscriptionSku ?? 'community',
      entitlementsJson: identityRow.entitlementsJson || JSON.stringify(['community.write']),
      registeredAt: identityRow.registeredAt ?? now,
      updatedAt: now,
    })
    .where(eq(identities.id, identityId))
    .run()

  sessionRepo.ensureCurrent(identityId)
  sessionRepo.updateCurrent({
    identityId,
    isLoggedIn: true,
    preferredRegion: input.region,
    accessTokenRef: encryptSecret(input.accessToken),
    refreshTokenRef: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    idTokenRef: encryptSecret(input.accessToken),
    hubTokenRef: null,
    tokenExpiresAt: computeTokenExpiresAt(input.expiresInSeconds),
    lastLoginAt: now,
  })

  invalidateHubTokenCache()
  bindP2pDeviceToIdentity(identityId)
  return getAuthSession()
}

export function resetIdentityToGuest(identityId: string = DEFAULT_IDENTITY_ID): void {
  const db = getDatabase()
  const now = new Date()
  db.update(identities)
    .set({
      type: 'local',
      registrationStatus: 'guest',
      authRegion: null,
      subscriptionSku: null,
      entitlementsJson: '[]',
      registeredAt: null,
      updatedAt: now,
    })
    .where(eq(identities.id, identityId))
    .run()
  refreshP2pDeviceIdentityBinding()
}

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
import { getLocalIdentityId } from '../local-identity'
import { bindP2pDeviceToIdentity, refreshP2pDeviceIdentityBinding } from '../p2p/p2p-device-identity.service'
import { AuthLoginError } from './auth-login.error.js'
import { syncDocumentsFolderSlugWithAccount } from '../documents-folder-slug.service'
import { bootstrapToolmanUserDocumentLayout } from '../knowledge-folder.service'

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
  const identityId = input.identityId ?? getLocalIdentityId()
  const db = getDatabase()
  const bindingRepo = new AuthBindingRepository(db)
  const existingBinding = bindingRepo.findByProviderSubject(input.provider, input.subjectId)
  if (existingBinding && existingBinding.identityId !== identityId) {
    throw new AuthLoginError('该登录方式已绑定到其他 Toolman 账户')
  }

  // 同一 identity 下同 provider 仅保留当前登录账户（避免双实例测试切换账号后显示多个邮箱）
  bindingRepo.deleteByIdentityIdAndProvider(identityId, input.provider)

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
  const identityId = getLocalIdentityId()

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
  const session = getAuthSession()
  if (syncDocumentsFolderSlugWithAccount()) {
    bootstrapToolmanUserDocumentLayout()
  }
  return session
}

export function refreshAuthSessionTokens(input: {
  accessToken: string
  refreshToken?: string | null
  expiresInSeconds?: number
}): void {
  const sessionRepo = new AuthSessionRepository(getDatabase())
  sessionRepo.updateCurrent({
    accessTokenRef: encryptSecret(input.accessToken),
    refreshTokenRef: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    idTokenRef: encryptSecret(input.accessToken),
    hubTokenRef: null,
    tokenExpiresAt: computeTokenExpiresAt(input.expiresInSeconds),
  })
  invalidateHubTokenCache()
}

export function resetIdentityToGuest(identityId: string = getLocalIdentityId()): void {
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

import { eq } from 'drizzle-orm'

import {
  AuthBindingRepository,
  AuthSessionRepository,
  identities,
  type AuthBindingMetadata,
  type AuthBindingRow,
  type AuthSessionRow,
} from '@toolman/db'
import {
  AuthSessionSchema,
  type AuthBindingSummary,
  type AuthSession,
  type ProductSku,
  type RegistrationStatus,
} from '@toolman/shared'

import { getDatabase } from '../bootstrap/database'
import { invalidateHubTokenCache } from './community/community-hub-auth.service'
import { refreshP2pDeviceIdentityBinding } from './p2p/p2p-device-identity.service'
import { getIdentityProfile } from './identity.service'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

function parseEntitlements(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseBindingMetadata(raw: string): AuthBindingMetadata {
  try {
    return JSON.parse(raw) as AuthBindingMetadata
  } catch {
    return {}
  }
}

export function mapBindingRow(row: AuthBindingRow): AuthBindingSummary {
  const metadata = parseBindingMetadata(row.metadataJson)
  return {
    provider: row.provider,
    subjectId: row.subjectId,
    label: metadata.label,
    verifiedAt: row.verifiedAt.getTime(),
  }
}

export function buildAuthSessionView(input: {
  registrationStatus: RegistrationStatus
  identityId: string
  displayName: string
  avatarUrl?: string | null
  authRegion?: 'cn' | 'intl' | null
  subscriptionSku?: ProductSku | null
  entitlements?: string[]
  bindings: AuthBindingSummary[]
  session: AuthSessionRow | null
}): AuthSession {
  const isLoggedIn = Boolean(input.session?.isLoggedIn)
  return AuthSessionSchema.parse({
    registrationStatus: input.registrationStatus,
    identityId: input.identityId,
    authRegion: input.authRegion ?? null,
    subscriptionSku: input.subscriptionSku ?? null,
    entitlements: input.entitlements ?? [],
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
    bindings: input.bindings,
    isLoggedIn,
    preferredRegion: input.session?.preferredRegion ?? null,
    tokenExpiresAt: input.session?.tokenExpiresAt?.getTime() ?? null,
    lastLoginAt: input.session?.lastLoginAt?.getTime() ?? null,
  })
}

function loadIdentityAuthFields(identityId: string) {
  const db = getDatabase()
  const row = db.select().from(identities).where(eq(identities.id, identityId)).get()
  if (!row) {
    throw new Error('Default identity not found')
  }
  return row
}

export function initAuthSessionStore(): void {
  const db = getDatabase()
  const sessionRepo = new AuthSessionRepository(db)
  sessionRepo.ensureCurrent(DEFAULT_IDENTITY_ID)
}

export function getAuthSession(): AuthSession {
  const db = getDatabase()
  const sessionRepo = new AuthSessionRepository(db)
  const bindingRepo = new AuthBindingRepository(db)

  const identityProfile = getIdentityProfile()
  const identityRow = loadIdentityAuthFields(identityProfile.id)
  const sessionRow = sessionRepo.ensureCurrent(identityProfile.id)
  const bindings = bindingRepo.listByIdentityId(identityProfile.id).map(mapBindingRow)

  return buildAuthSessionView({
    registrationStatus: identityRow.registrationStatus,
    identityId: identityProfile.id,
    displayName: identityProfile.displayName,
    avatarUrl: identityProfile.avatarUrl,
    authRegion: identityRow.authRegion,
    subscriptionSku: identityRow.subscriptionSku,
    entitlements: parseEntitlements(identityRow.entitlementsJson),
    bindings,
    session: sessionRow,
  })
}

export function logoutAuthSession(): AuthSession {
  const db = getDatabase()
  const sessionRepo = new AuthSessionRepository(db)
  sessionRepo.clearLocalSession()
  invalidateHubTokenCache()
  refreshP2pDeviceIdentityBinding()
  return getAuthSession()
}

export function assertAuthFeatureImplemented(feature: string): never {
  throw new Error(`${feature} 尚未实现（Task-005+）`)
}

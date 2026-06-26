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
  AuthUserTypeSchema,
  CommunityUserRoleSchema,
  type AuthBindingSummary,
  type AuthProvider,
  type AuthSession,
  type AuthUserType,
  type ProductSku,
  type RegistrationStatus,
} from '@toolman/shared'

import { getDatabase } from '../bootstrap/database'
import { invalidateHubTokenCache } from './community/community-hub-auth.service'
import { refreshP2pDeviceIdentityBinding } from './p2p/p2p-device-identity.service'
import { getIdentityProfile } from './identity.service'
import { getLocalIdentityId } from './local-identity'

/** 同一 identity 下每种登录方式只保留一个账户（桌面端 V1 单用户） */
const SINGLE_ACCOUNT_AUTH_PROVIDERS = new Set<AuthProvider>([
  'tencent_phone',
  'firebase_email',
  'firebase_google',
  'firebase_apple',
  'tencent_wechat',
  'tencent_douyin',
])

function dedupeExclusiveAuthBindings(
  bindingRepo: AuthBindingRepository,
  identityId: string,
): AuthBindingSummary[] {
  const rows = bindingRepo.listByIdentityId(identityId)
  const keepRows: AuthBindingRow[] = []
  const grouped = new Map<AuthProvider, AuthBindingRow[]>()

  for (const row of rows) {
    if (!SINGLE_ACCOUNT_AUTH_PROVIDERS.has(row.provider)) {
      keepRows.push(row)
      continue
    }
    const group = grouped.get(row.provider) ?? []
    group.push(row)
    grouped.set(row.provider, group)
  }

  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => b.verifiedAt.getTime() - a.verifiedAt.getTime())
    keepRows.push(sorted[0]!)
    for (const duplicate of sorted.slice(1)) {
      bindingRepo.deleteById(duplicate.id)
    }
  }

  return keepRows
    .sort((a, b) => b.verifiedAt.getTime() - a.verifiedAt.getTime())
    .map(mapBindingRow)
}

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

function resolveBindingUserType(raw?: string | null): AuthUserType | undefined {
  if (!raw?.trim()) return undefined
  const parsed = AuthUserTypeSchema.safeParse(raw.trim())
  return parsed.success ? parsed.data : undefined
}

function resolveBindingCommunityRole(raw?: string | null) {
  if (!raw?.trim()) return undefined
  const parsed = CommunityUserRoleSchema.safeParse(raw.trim())
  return parsed.success ? parsed.data : undefined
}

export function mapBindingRow(row: AuthBindingRow): AuthBindingSummary {
  const metadata = parseBindingMetadata(row.metadataJson)
  return {
    provider: row.provider,
    subjectId: row.subjectId,
    label: metadata.label,
    verifiedAt: row.verifiedAt.getTime(),
    authingRoles: metadata.authingRoles,
    userType: resolveBindingUserType(metadata.userType),
    communityRole: resolveBindingCommunityRole(metadata.communityRole),
  }
}

function resolveSessionUserType(input: {
  registrationStatus: RegistrationStatus
  isLoggedIn: boolean
  bindingUserType?: AuthUserType
}): AuthUserType {
  if (input.registrationStatus === 'guest' || !input.isLoggedIn) {
    return 'guest'
  }
  return input.bindingUserType ?? 'normal'
}

function resolvePrimaryBindingProfile(bindings: AuthBindingSummary[]) {
  const primary = bindings[0]
  return {
    userType: primary?.userType,
    communityRole: primary?.communityRole ?? null,
    authingRoles: primary?.authingRoles ?? [],
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
  const profile = resolvePrimaryBindingProfile(input.bindings)
  return AuthSessionSchema.parse({
    registrationStatus: input.registrationStatus,
    identityId: input.identityId,
    authRegion: input.authRegion ?? null,
    subscriptionSku: input.subscriptionSku ?? null,
    entitlements: input.entitlements ?? [],
    userType: resolveSessionUserType({
      registrationStatus: input.registrationStatus,
      isLoggedIn,
      bindingUserType: profile.userType,
    }),
    communityRole: profile.communityRole,
    authingRoles: profile.authingRoles,
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
  const bindingRepo = new AuthBindingRepository(db)
  const identityId = getLocalIdentityId()
  sessionRepo.ensureCurrent(identityId)
  dedupeExclusiveAuthBindings(bindingRepo, identityId)
}

export function getAuthSession(): AuthSession {
  const db = getDatabase()
  const sessionRepo = new AuthSessionRepository(db)
  const bindingRepo = new AuthBindingRepository(db)

  const identityProfile = getIdentityProfile()
  const identityRow = loadIdentityAuthFields(identityProfile.id)
  const sessionRow = sessionRepo.ensureCurrent(identityProfile.id)
  const bindings = dedupeExclusiveAuthBindings(bindingRepo, identityProfile.id)

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

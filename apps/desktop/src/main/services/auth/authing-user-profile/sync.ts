import type { ResolvedAuthingRoleProfile } from '@toolman/shared'
import { AuthBindingRepository, AuthSessionRepository, identities } from '@toolman/db'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../../bootstrap/database.js'
import { invalidateHubTokenCache } from '../../community/community-hub-auth.service'
import { getAuthSession } from '../../auth-session.service'
import { decryptSecret } from '../../secret-store.js'
import { getLocalIdentityId } from '../../local-identity.js'
import { getAuthingManagementClient, canFetchAuthingUserRoles } from '../authing-management-client.service.js'
import { fetchAuthingUserRolesViaAccessToken } from '../authing-session-roles.service.js'
import { resolveAuthingUserIdFromAccessToken, extractAuthingRolesFromAccessToken } from '../authing-token-utils.js'
import { extractAuthingRoleCodes, resolveAuthingRoleProfile } from './roles.js'

export async function fetchAuthingUserRoles(
  authingUserId: string,
  options?: { accessToken?: string | null },
): Promise<string[]> {
  const trimmed = authingUserId.trim()
  if (!trimmed || !canFetchAuthingUserRoles()) {
    return []
  }

  const accessToken = options?.accessToken?.trim() ?? null
  const resolvedUserId = resolveAuthingUserIdFromAccessToken(accessToken, trimmed)
  const roleLookupIds = [...new Set([resolvedUserId, trimmed].filter(Boolean))]

  const client = getAuthingManagementClient()
  if (client) {
    for (const lookupId of roleLookupIds) {
      try {
        const roles = await client.users.listRoles(lookupId)
        const extracted = extractAuthingRoleCodes(roles)
        if (extracted.length > 0) {
          return extracted
        }
      } catch (error) {
        const detail =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: unknown }).message)
            : error instanceof Error
              ? error.message
              : String(error)
        console.warn(
          `[authing-roles] Management API listRoles failed (${lookupId}), trying next id or fallbacks: ${detail}`,
        )
      }
    }
  }

  if (accessToken) {
    const tokenRoles = extractAuthingRolesFromAccessToken(accessToken)
    if (tokenRoles.length > 0) {
      return tokenRoles
    }
  }

  if (!accessToken) {
    return []
  }

  try {
    const roles = await fetchAuthingUserRolesViaAccessToken(accessToken, resolvedUserId)
    return extractAuthingRoleCodes(roles)
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message)
        : error instanceof Error
          ? error.message
          : String(error)
    console.warn(`[authing-roles] Session token listRoles failed: ${detail}`)
    return []
  }
}

function resolveAuthingAccessTokenForIdentity(identityId: string): string | null {
  const sessionRepo = new AuthSessionRepository(getDatabase())
  const session = sessionRepo.getCurrent()
  if (!session?.isLoggedIn || session.identityId !== identityId) {
    return null
  }
  return decryptSecret(session.accessTokenRef ?? session.idTokenRef)
}

export async function syncAuthingUserProfileForIdentity(options?: {
  identityId?: string
  authingUserId?: string
  accessToken?: string | null
}): Promise<ResolvedAuthingRoleProfile | null> {
  const identityId = options?.identityId ?? getLocalIdentityId()
  const authingUserId = options?.authingUserId?.trim()

  if (!authingUserId || !canFetchAuthingUserRoles()) {
    return null
  }

  const authingRoles = await fetchAuthingUserRoles(authingUserId, {
    accessToken:
      options?.accessToken ?? resolveAuthingAccessTokenForIdentity(identityId),
  })
  const profile = resolveAuthingRoleProfile(authingRoles)
  const db = getDatabase()
  const now = new Date()

  const bindingRepo = new AuthBindingRepository(db)
  const bindings = bindingRepo.listByIdentityId(identityId)
  const binding = bindings.find((row) => row.subjectId === authingUserId) ?? bindings[0]
  if (binding) {
    let metadata: Record<string, unknown> = {}
    try {
      metadata = JSON.parse(binding.metadataJson) as Record<string, unknown>
    } catch {
      metadata = {}
    }
    bindingRepo.upsert({
      identityId,
      provider: binding.provider,
      subjectId: binding.subjectId,
      metadata: {
        ...metadata,
        authingRoles,
        userType: profile.userType,
        communityRole: profile.communityRole,
        authingRolesSyncedAt: Date.now(),
      },
      verifiedAt: binding.verifiedAt,
    })
  }

  db.update(identities)
    .set({
      subscriptionSku: profile.subscriptionSku ?? 'community',
      entitlementsJson: JSON.stringify(profile.entitlements),
      updatedAt: now,
    })
    .where(eq(identities.id, identityId))
    .run()

  invalidateHubTokenCache()
  return profile
}

export async function syncAuthingUserProfileAfterLogin(): Promise<void> {
  const session = getAuthSession()
  if (session.authRegion !== 'cn' || !session.isLoggedIn) {
    return
  }

  const binding = session.bindings[0]
  if (!binding?.subjectId) {
    return
  }

  const currentSession = new AuthSessionRepository(getDatabase()).getCurrent()
  await syncAuthingUserProfileForIdentity({
    identityId: session.identityId,
    authingUserId: binding.subjectId,
    accessToken: decryptSecret(currentSession?.accessTokenRef ?? currentSession?.idTokenRef),
  })
}

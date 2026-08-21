import type { ResolvedAuthingRoleProfile } from '@toolman/shared'
import { AuthBindingRepository, AuthSessionRepository, identities } from '@toolman/db'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../../bootstrap/database.js'
import { invalidateHubTokenCache } from '../../community/community-hub-auth.service'
import { getAuthSession } from '../../auth-session.service'
import { decryptSecret } from '../../secret-store.js'
import { getLocalIdentityId } from '../../local-identity.js'
import { getAuthingManagementClient, canFetchAuthingUserRoles } from '../authing-management-client.service.js'
import { fetchAuthingUserRolesViaAccessTokenAllNamespaces } from '../authing-session-roles.service.js'
import { resolveAuthingUserIdFromAccessToken, extractAuthingRolesFromAccessToken } from '../authing-token-utils.js'
import { listAuthingRoleNamespaces } from '../authing-auth.config.js'
import { extractAuthingRoleCodes, resolveAuthingRoleProfile } from './roles.js'
import { logStructured } from '../../structured-log.service'

const USER_POOL_NOT_FOUND = /用户池不存在|找不到用户池|user\s*pool.*(not\s+found|does\s+not\s+exist)/i

function isBenignRoleLookupError(detail: string): boolean {
  return (
    USER_POOL_NOT_FOUND.test(detail) ||
    /无权限执行此项操作|permission\s*denied|unauthorized|forbidden/i.test(detail)
  )
}

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
  const namespaces = [undefined, ...listAuthingRoleNamespaces()]
  const collected: string[] = []

  const client = getAuthingManagementClient()
  if (client) {
    for (const lookupId of roleLookupIds) {
      for (const namespace of namespaces) {
        try {
          const roles = namespace
            ? await client.users.listRoles(lookupId, namespace)
            : await client.users.listRoles(lookupId)
          collected.push(...extractAuthingRoleCodes(roles))
        } catch (error) {
          const detail =
            error && typeof error === 'object' && 'message' in error
              ? String((error as { message?: unknown }).message)
              : error instanceof Error
                ? error.message
                : String(error)
          if (!isBenignRoleLookupError(detail)) {
            logStructured(
              'authing-roles',
              'warn',
              `Management API listRoles failed (${lookupId}${namespace ? `/${namespace}` : ''}), trying next: ${detail}`,
            )
          }
        }
      }
    }
  }

  if (collected.length === 0 && accessToken) {
    collected.push(...extractAuthingRolesFromAccessToken(accessToken))
  }

  if (collected.length === 0 && accessToken) {
    try {
      const payloads = await fetchAuthingUserRolesViaAccessTokenAllNamespaces(accessToken, resolvedUserId)
      for (const payload of payloads) {
        collected.push(...extractAuthingRoleCodes(payload))
      }
    } catch (error) {
      const detail =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : error instanceof Error
            ? error.message
            : String(error)
      if (!isBenignRoleLookupError(detail)) {
        logStructured('authing-roles', 'warn', `Session token listRoles failed: ${detail}`)
      }
    }
  }

  return [...new Set(collected)]
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
  if (authingRoles.length === 0) {
    logStructured(
      'authing-roles',
      'warn',
      'Authing 未返回应用角色，桌面端仍显示普通用户。请在 Authing「权限管理 → 角色」把用户加入代码为 admin（或名称「管理员」）的角色，而不是只设为控制台协作者；改完后需退出再登录。',
    )
  } else {
    logStructured(
      'authing-roles',
      'info',
      `synced roles [${authingRoles.join(', ')}] → ${profile.userType}/${profile.communityRole}`,
    )
  }
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

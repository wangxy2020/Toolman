import { getUserRoles } from 'authing-js-sdk/build/main/lib/graphqlapi.js'

import { getAuthingClient } from './authing-client.service.js'
import { resolveAuthingUserIdFromAccessToken } from './authing-token-utils.js'
import { listAuthingRoleNamespaces } from './authing-auth.config.js'

/** Fetch Authing roles using the logged-in user's access token (no user-pool secret required). */
export async function fetchAuthingUserRolesViaAccessToken(
  accessToken: string,
  authingUserId: string,
  namespace?: string,
): Promise<unknown> {
  const trimmedToken = accessToken.trim()
  if (!trimmedToken) {
    return null
  }

  const resolvedUserId = resolveAuthingUserIdFromAccessToken(trimmedToken, authingUserId)
  if (!resolvedUserId) {
    return null
  }

  const client = getAuthingClient()
  client.setToken(trimmedToken)

  const { user } = await getUserRoles(client.graphqlClient, client.tokenProvider, {
    id: resolvedUserId,
    namespace,
  })
  return user?.roles ?? null
}

export async function fetchAuthingUserRolesViaAccessTokenAllNamespaces(
  accessToken: string,
  authingUserId: string,
): Promise<unknown[]> {
  const payloads: unknown[] = []
  for (const namespace of [undefined, ...listAuthingRoleNamespaces()]) {
    try {
      payloads.push(await fetchAuthingUserRolesViaAccessToken(accessToken, authingUserId, namespace))
    } catch {
      // try next namespace
    }
  }
  return payloads
}

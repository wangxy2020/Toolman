import { getUserRoles } from 'authing-js-sdk/build/main/lib/graphqlapi.js'

import { getAuthingClient } from './authing-client.service.js'
import { resolveAuthingUserIdFromAccessToken } from './authing-token-utils.js'

/** Fetch Authing roles using the logged-in user's access token (no user-pool secret required). */
export async function fetchAuthingUserRolesViaAccessToken(
  accessToken: string,
  authingUserId: string,
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
  })
  return user?.roles ?? null
}

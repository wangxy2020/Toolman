import { getUserRoles } from 'authing-js-sdk/build/main/lib/graphqlapi.js'

import { getAuthingClient } from './authing-client.service.js'

/** Fetch Authing roles using the logged-in user's access token (no user-pool secret required). */
export async function fetchAuthingUserRolesViaAccessToken(
  accessToken: string,
  authingUserId: string,
): Promise<unknown> {
  const trimmedToken = accessToken.trim()
  const trimmedUserId = authingUserId.trim()
  if (!trimmedToken || !trimmedUserId) {
    return null
  }

  const client = getAuthingClient()
  client.setToken(trimmedToken)

  const { user } = await getUserRoles(client.graphqlClient, client.tokenProvider, {
    id: trimmedUserId,
  })
  return user?.roles ?? null
}

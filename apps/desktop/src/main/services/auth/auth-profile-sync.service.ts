import type { CommunityUserMeUpdateInput, CommunityUserProfile } from '@toolman/shared'
import { isRegisteredAuthSession } from '@toolman/shared'

import { getAuthSession } from '../auth-session.service'
import { syncAuthingUserProfileAfterLogin } from './authing-user-profile.service.js'
import { getIdentityProfile } from '../identity.service'
import { exchangeAuthHubToken } from './auth-hub-token.service'
import { getCommunityHubStatus } from '../community/community-bridge.service'
import { getUserMe, updateUserMe } from '../community/community-ipc.facade'

export async function syncAuthProfileToCommunityHub(): Promise<CommunityUserProfile | null> {
  const session = getAuthSession()
  if (!isRegisteredAuthSession(session) || !session.isLoggedIn) {
    return null
  }

  const hubStatus = getCommunityHubStatus()
  if (!hubStatus.running) {
    return null
  }

  await exchangeAuthHubToken().catch(() => undefined)

  const identity = getIdentityProfile()
  const displayName = identity.displayName.trim()
  if (!displayName) {
    return null
  }

  const remote = await getUserMe()
  const patch: CommunityUserMeUpdateInput = {}

  if (remote.displayName !== displayName) {
    patch.displayName = displayName
  }

  if (Object.keys(patch).length === 0) {
    return remote
  }

  return updateUserMe(patch)
}

export async function finalizeRegisteredLogin(
  _session: Awaited<ReturnType<typeof getAuthSession>>,
): Promise<Awaited<ReturnType<typeof getAuthSession>>> {
  await syncAuthingUserProfileAfterLogin().catch(() => undefined)
  await syncAuthProfileToCommunityHub().catch(() => undefined)
  return getAuthSession()
}

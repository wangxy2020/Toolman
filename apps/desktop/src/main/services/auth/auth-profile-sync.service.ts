import type { CommunityUserMeUpdateInput, CommunityUserProfile } from '@toolman/shared'
import { isRegisteredAuthSession } from '@toolman/shared'

import { getAuthSession } from '../auth-session.service'
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

export async function finalizeRegisteredLogin<T extends Awaited<ReturnType<typeof getAuthSession>>>(
  session: T,
): Promise<T> {
  await syncAuthProfileToCommunityHub().catch(() => undefined)
  return session
}

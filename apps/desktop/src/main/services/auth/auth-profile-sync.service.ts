import type { CommunityUserMeUpdateInput, CommunityUserProfile } from '@toolman/shared'
import { isRegisteredAuthSession } from '@toolman/shared'

import { getAuthSession } from '../auth-session.service'
import { syncAuthingUserProfileAfterLogin } from './authing-user-profile.service.js'
import { getIdentityProfile } from '../identity.service'
import { exchangeAuthHubToken } from './auth-hub-token.service'
import { invalidateHubTokenCache } from '../community/community-hub-auth.service'
import { invalidateCommunityHubCache } from '../community/community-hub-cache.service'
import { getCommunityHubStatus } from '../community/community-bridge.service'
import { getUserMe, updateUserMe } from '../community/community-ipc.facade'
import { resolveRegisteredAccountDisplayName } from './resolve-registered-email'

let syncInFlight: Promise<CommunityUserProfile | null> | null = null
let lastSyncedDisplayName: string | null = null

export async function syncAuthProfileToCommunityHub(): Promise<CommunityUserProfile | null> {
  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = (async () => {
    const session = getAuthSession()
    if (!isRegisteredAuthSession(session) || !session.isLoggedIn) {
      return null
    }

    const hubStatus = getCommunityHubStatus()
    if (!hubStatus.running) {
      return null
    }

    // Force a fresh hub JWT so email claims reach load_auth_user.
    invalidateHubTokenCache()
    await exchangeAuthHubToken().catch(() => undefined)

    // Community boards should show the registered account name (email), not the local nickname.
    const displayName =
      resolveRegisteredAccountDisplayName(session.identityId) ??
      getIdentityProfile().displayName.trim()
    if (!displayName) {
      return null
    }

    if (lastSyncedDisplayName === displayName) {
      return null
    }

    const remote = await getUserMe()
    const patch: CommunityUserMeUpdateInput = {}

    if (remote.displayName !== displayName) {
      patch.displayName = displayName
    }

    const updated =
      Object.keys(patch).length === 0 ? remote : await updateUserMe(patch)

    lastSyncedDisplayName = displayName
    // Author names are joined from users; drop stale board list cache after profile reconcile.
    invalidateCommunityHubCache('board-messages')
    return updated
  })().finally(() => {
    syncInFlight = null
  })

  return syncInFlight
}

export async function finalizeRegisteredLogin(
  _session: Awaited<ReturnType<typeof getAuthSession>>,
): Promise<Awaited<ReturnType<typeof getAuthSession>>> {
  lastSyncedDisplayName = null
  await syncAuthingUserProfileAfterLogin().catch(() => undefined)
  invalidateHubTokenCache()
  await exchangeAuthHubToken().catch(() => undefined)
  await syncAuthProfileToCommunityHub().catch(() => undefined)
  return getAuthSession()
}

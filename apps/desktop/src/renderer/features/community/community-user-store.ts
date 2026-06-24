import type { CommunityUserProfile } from '@toolman/shared'

import { getCommunityUserMe } from './community-api.client'
import { COMMUNITY_SESSION_CHANGED_EVENT, isCommunitySessionActive } from '../user/community-session'

const PROFILE_CACHE_TTL_MS = 5_000

let cachedProfile: CommunityUserProfile | null = null
let cachedAt = 0
let inflight: Promise<CommunityUserProfile | null> | null = null

export function invalidateCommunityUserProfile(): void {
  cachedProfile = null
  cachedAt = 0
}

export async function loadCommunityUserProfile(): Promise<CommunityUserProfile | null> {
  if (!isCommunitySessionActive()) {
    invalidateCommunityUserProfile()
    return null
  }

  const now = Date.now()
  if (cachedProfile && now - cachedAt < PROFILE_CACHE_TTL_MS) {
    return cachedProfile
  }

  if (inflight) {
    return inflight
  }

  inflight = getCommunityUserMe()
    .then((profile) => {
      cachedProfile = profile
      cachedAt = Date.now()
      return profile
    })
    .catch((error) => {
      cachedProfile = null
      cachedAt = 0
      throw error
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function subscribeCommunityUserProfile(onChange: () => void): () => void {
  const onSessionChanged = () => {
    invalidateCommunityUserProfile()
    onChange()
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === 'toolman.community.session.active') {
      onSessionChanged()
    }
  }

  window.addEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onSessionChanged)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onSessionChanged)
    window.removeEventListener('storage', onStorage)
  }
}

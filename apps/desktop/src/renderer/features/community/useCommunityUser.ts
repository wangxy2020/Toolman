import { useCallback, useEffect, useState } from 'react'

import { type CommunityUserProfile } from '@toolman/shared'

import {
  invalidateCommunityUserProfile,
  loadCommunityUserProfile,
  peekCommunityUserProfile,
  subscribeCommunityUserProfile,
} from './community-user-store'
import { formatCommunityHubError } from './community-hub-error-utils'

export function useCommunityUser(autoLoad = true) {
  const [profile, setProfile] = useState<CommunityUserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const cached = peekCommunityUserProfile()
    if (cached) {
      setProfile(cached)
      return cached
    }

    setLoading(true)
    setError(null)
    try {
      const user = await loadCommunityUserProfile()
      setProfile(user)
      return user
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载用户信息失败'
      setError(formatCommunityHubError(message))
      setProfile(null)
      throw loadError
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) return
    void load().catch(() => undefined)
  }, [autoLoad, load])

  useEffect(() => subscribeCommunityUserProfile(() => void load().catch(() => undefined)), [load])

  return {
    profile,
    loading,
    error,
    load,
    invalidate: invalidateCommunityUserProfile,
  }
}

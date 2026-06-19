import { useCallback, useEffect, useState } from 'react'

import { type CommunityUserProfile } from '@toolman/shared'

import { getCommunityUserMe } from './community-api.client'
import { isCommunitySessionActive, COMMUNITY_SESSION_CHANGED_EVENT } from '../user/community-session'

export function useCommunityUser(autoLoad = true) {
  const [profile, setProfile] = useState<CommunityUserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isCommunitySessionActive()) {
      setProfile(null)
      setError(null)
      return null
    }

    setLoading(true)
    setError(null)
    try {
      const user = await getCommunityUserMe()
      setProfile(user)
      return user
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载用户信息失败'
      setError(message)
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

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'toolman.community.session.active') {
        void load().catch(() => undefined)
      }
    }
    const onSessionChanged = () => {
      void load().catch(() => undefined)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onSessionChanged)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onSessionChanged)
    }
  }, [load])

  return {
    profile,
    loading,
    error,
    load,
  }
}

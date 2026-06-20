import { useEffect, useState } from 'react'

import type { AuthBuildProfile } from '@toolman/shared'

import { getAuthBuildProfile } from './auth-api.client'

export function useAuthBuildProfile() {
  const [profile, setProfile] = useState<AuthBuildProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void getAuthBuildProfile()
      .then((next) => {
        if (!cancelled) setProfile(next)
      })
      .catch(() => {
        if (!cancelled) setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { profile, loading }
}

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { AuthSession } from '@toolman/shared'

import { getAuthSession } from './auth-api.client'
import {
  AUTH_SESSION_HMR_FALLBACK,
  AuthSessionContext,
  type AuthSessionContextValue,
} from './auth-session-context'

export type { AuthSessionContextValue }

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await getAuthSession()
      setSession(next)
      return next
    } catch {
      setSession(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      session,
      loading,
      refresh,
    }),
    [loading, refresh, session],
  )

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext)
  if (!context) {
    // Fast Refresh can briefly disconnect Provider/consumer context identity.
    if (import.meta.hot) {
      return AUTH_SESSION_HMR_FALLBACK
    }
    throw new Error('useAuthSession must be used within AuthSessionProvider')
  }
  return context
}

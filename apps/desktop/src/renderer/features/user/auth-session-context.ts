import { createContext } from 'react'

import type { AuthSession } from '@toolman/shared'

export interface AuthSessionContextValue {
  session: AuthSession | null
  loading: boolean
  refresh: () => Promise<AuthSession | null>
}

/**
 * Kept in a dedicated module so Vite Fast Refresh does not recreate the context
 * identity when AuthSessionProvider.tsx hot-reloads (which blanks the UI).
 */
export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null)

export const AUTH_SESSION_HMR_FALLBACK: AuthSessionContextValue = {
  session: null,
  loading: true,
  refresh: async () => null,
}

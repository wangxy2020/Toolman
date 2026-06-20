import type { AuthBindingSummary, AuthProvider } from './ipc/auth.js'

export const DELETE_REAUTH_RECENT_LOGIN_MS = 15 * 60 * 1000

export type DeleteReauthMethod = Extract<AuthProvider, 'firebase_email' | 'tencent_phone'>

export function isRecentAuthLogin(
  lastLoginAt: number | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastLoginAt) return false
  return now - lastLoginAt <= DELETE_REAUTH_RECENT_LOGIN_MS
}

export function resolveDeleteReauthMethods(
  bindings: AuthBindingSummary[],
): DeleteReauthMethod[] {
  const methods: DeleteReauthMethod[] = []
  if (bindings.some((binding) => binding.provider === 'tencent_phone')) {
    methods.push('tencent_phone')
  }
  if (bindings.some((binding) => binding.provider === 'firebase_email')) {
    methods.push('firebase_email')
  }
  return methods
}

export function pickPrimaryDeleteReauthMethod(
  bindings: AuthBindingSummary[],
): DeleteReauthMethod | null {
  return resolveDeleteReauthMethods(bindings)[0] ?? null
}

export function requiresDeleteReauth(
  lastLoginAt: number | null | undefined,
  bindings: AuthBindingSummary[],
  now = Date.now(),
): boolean {
  if (isRecentAuthLogin(lastLoginAt, now)) {
    return false
  }
  return pickPrimaryDeleteReauthMethod(bindings) !== null
}

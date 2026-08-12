/** Public Firebase web config for mobile (same project as desktop intl auth). */

export type MobileFirebaseConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  appId?: string
}

const FALLBACK: MobileFirebaseConfig = {
  apiKey: 'AIzaSyD1AoflKnEM0pSuGIRuf3x3SljhtiZBGyE',
  authDomain: 'toolman-8f5b3.firebaseapp.com',
  projectId: 'toolman-8f5b3',
}

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim()
  return value || undefined
}

export function getMobileFirebaseConfig(): MobileFirebaseConfig | null {
  const apiKey =
    readEnv('EXPO_PUBLIC_FIREBASE_API_KEY') ??
    readEnv('TOOLMAN_FIREBASE_API_KEY') ??
    FALLBACK.apiKey
  const authDomain =
    readEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ??
    readEnv('TOOLMAN_FIREBASE_AUTH_DOMAIN') ??
    FALLBACK.authDomain
  const projectId =
    readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ??
    readEnv('TOOLMAN_FIREBASE_PROJECT_ID') ??
    FALLBACK.projectId
  const appId =
    readEnv('EXPO_PUBLIC_FIREBASE_APP_ID') ?? readEnv('TOOLMAN_FIREBASE_APP_ID')

  if (!apiKey || !authDomain || !projectId) return null
  return { apiKey, authDomain, projectId, ...(appId ? { appId } : {}) }
}

export function isMobileFirebaseConfigured(): boolean {
  return Boolean(getMobileFirebaseConfig())
}

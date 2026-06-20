export interface FirebaseAuthConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId?: string
}

const ENV_KEYS = {
  apiKey: ['TOOLMAN_FIREBASE_API_KEY', 'FIREBASE_API_KEY'],
  authDomain: ['TOOLMAN_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'],
  projectId: ['TOOLMAN_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'],
  appId: ['TOOLMAN_FIREBASE_APP_ID', 'FIREBASE_APP_ID'],
} as const

function readEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function getFirebaseAuthConfig(): FirebaseAuthConfig | null {
  const apiKey = readEnv(ENV_KEYS.apiKey)
  const authDomain = readEnv(ENV_KEYS.authDomain)
  const projectId = readEnv(ENV_KEYS.projectId)
  if (!apiKey || !authDomain || !projectId) return null
  const appId = readEnv(ENV_KEYS.appId)
  return appId ? { apiKey, authDomain, projectId, appId } : { apiKey, authDomain, projectId }
}

export function getFirebaseWebConfig():
  | ({ configured: true } & FirebaseAuthConfig)
  | { configured: false } {
  const config = getFirebaseAuthConfig()
  if (!config) return { configured: false }
  return { configured: true, ...config }
}

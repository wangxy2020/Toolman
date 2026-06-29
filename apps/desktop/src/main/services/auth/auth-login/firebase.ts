import type { AuthLoginInput, AuthProvider, AuthSession } from '@toolman/shared'
import { AuthLoginError } from '../auth-login.error.js'
import { formatAuthProviderNotConfiguredMessage } from '../auth-config-message.js'
import { persistAuthLogin } from '../auth-persist.service.js'
import { getFirebaseAuthConfig } from '../firebase-auth.config'
import {
  firebaseLookupIdToken,
  firebaseSignInWithEmail,
  mapFirebaseProviderIds,
  type FirebaseAuthResult,
} from '../firebase-auth.service'
import { EmailLoginPayloadSchema, IdTokenLoginPayloadSchema } from './schemas.js'

function buildBindingLabel(result: FirebaseAuthResult): string | undefined {
  return result.email ?? result.displayName ?? undefined
}

async function authenticateWithFirebase(
  input: AuthLoginInput,
  config: NonNullable<ReturnType<typeof getFirebaseAuthConfig>>,
): Promise<{ result: FirebaseAuthResult; provider: AuthProvider }> {
  if (input.method === 'firebase_email') {
    const payload = EmailLoginPayloadSchema.parse(input.payload ?? {})
    const intent = payload.intent ?? 'login'
    const result = await firebaseSignInWithEmail(config, payload.email, payload.password, intent)
    return { result, provider: 'firebase_email' }
  }

  const payload = IdTokenLoginPayloadSchema.parse(input.payload ?? {})
  const result = await firebaseLookupIdToken(config, payload.idToken)
  const provider = mapFirebaseProviderIds(result.providerIds, input.method)
  if (provider !== input.method) {
    throw new AuthLoginError('登录方式与 Firebase 账户绑定不一致')
  }
  return { result, provider }
}

function persistFirebaseLogin(input: {
  provider: AuthProvider
  result: FirebaseAuthResult
  region: 'intl'
}): AuthSession {
  const expiresInSeconds = Number.parseInt(input.result.expiresIn, 10)
  return persistAuthLogin({
    region: input.region,
    provider: input.provider,
    subjectId: input.result.localId,
    bindingLabel: buildBindingLabel(input.result),
    accessToken: input.result.idToken,
    refreshToken: input.result.refreshToken,
    expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : undefined,
  })
}

export async function loginWithIntl(parsed: AuthLoginInput): Promise<AuthSession> {
  const config = getFirebaseAuthConfig()
  if (!config) {
    throw new AuthLoginError(formatAuthProviderNotConfiguredMessage('firebase'))
  }

  const { result, provider } = await authenticateWithFirebase(parsed, config)
  return persistFirebaseLogin({ provider, result, region: 'intl' })
}

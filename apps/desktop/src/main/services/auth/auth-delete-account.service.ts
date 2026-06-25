import { AuthBindingRepository, AuthSessionRepository } from '@toolman/db'
import { toErrorMessage } from '@toolman/shared'
import {AuthDeleteAccountInputSchema,
  AuthVerifyDeleteReauthInputSchema,
  type AuthDeleteAccountInput,
  type AuthSession,
  type AuthVerifyDeleteReauthInput,
  type AuthVerifyDeleteReauthOutput } from '@toolman/shared'

import { getDatabase } from '../../bootstrap/database'
import { decryptSecret } from '../secret-store'
import { invalidateHubTokenCache } from '../community/community-hub-auth.service'
import { getAuthSession } from '../auth-session.service'
import { refreshP2pDeviceIdentityBinding } from '../p2p/p2p-device-identity.service'
import { AuthLoginError } from './auth-login.error.js'
import { resetIdentityToGuest } from './auth-persist.service.js'
import { getFirebaseAuthConfig } from './firebase-auth.config.js'
import {
  firebaseDeleteUser,
  firebaseSignInWithEmail,
} from './firebase-auth.service.js'
import {
  assertDeleteAccountReauth,
  createReauthToken,
} from './auth-reauth.service.js'
import { verifyPhoneSmsLogin } from './tencent-phone-auth.service.js'

export async function verifyDeleteAccountReauth(
  input: AuthVerifyDeleteReauthInput,
): Promise<AuthVerifyDeleteReauthOutput> {
  const parsed = AuthVerifyDeleteReauthInputSchema.parse(input)
  const session = getAuthSession()
  if (!session.isLoggedIn || session.registrationStatus !== 'registered') {
    throw new AuthLoginError('请先登录后再验证身份')
  }

  const bindingRepo = new AuthBindingRepository(getDatabase())
  const bindings = bindingRepo.listByIdentityId(session.identityId)

  if (parsed.method === 'firebase_email') {
    const config = getFirebaseAuthConfig()
    if (!config) {
      throw new AuthLoginError('国际登录未配置，请设置 TOOLMAN_FIREBASE_* 环境变量')
    }

    const emailBinding = bindings.find((binding) => binding.provider === 'firebase_email')
    if (!emailBinding) {
      throw new AuthLoginError('当前账户未绑定邮箱登录方式')
    }

    const result = await firebaseSignInWithEmail(
      config,
      parsed.email.trim(),
      parsed.password,
      'login',
    )
    if (result.localId !== emailBinding.subjectId) {
      throw new AuthLoginError('邮箱或密码错误')
    }

    return { reauthToken: createReauthToken(session.identityId) }
  }

  const phoneBinding = bindings.find((binding) => binding.provider === 'tencent_phone')
  if (!phoneBinding) {
    throw new AuthLoginError('当前账户未绑定手机号')
  }

  const phoneResult = verifyPhoneSmsLogin(parsed.phone, parsed.code)
  if (phoneResult.subjectId !== phoneBinding.subjectId) {
    throw new AuthLoginError('请输入已绑定账户的手机号')
  }

  return { reauthToken: createReauthToken(session.identityId) }
}

export async function deleteAuthAccountRemote(input: AuthDeleteAccountInput): Promise<AuthSession> {
  const parsed = AuthDeleteAccountInputSchema.parse(input)
  const session = getAuthSession()
  assertDeleteAccountReauth(parsed, session)

  const config = getFirebaseAuthConfig()
  const db = getDatabase()
  const sessionRepo = new AuthSessionRepository(db)
  const bindingRepo = new AuthBindingRepository(db)
  const currentSession = sessionRepo.getCurrent()
  const identityId = currentSession?.identityId ?? session.identityId
  const bindings = bindingRepo.listByIdentityId(identityId)
  const hasFirebaseBinding = bindings.some((binding) => binding.provider.startsWith('firebase_'))

  const idToken = decryptSecret(currentSession?.idTokenRef)
  if (config && idToken && hasFirebaseBinding) {
    try {
      await firebaseDeleteUser(config, idToken)
    } catch (error) {
      const message = toErrorMessage(error, 'Firebase 删号失败')
      throw new AuthLoginError(message)
    }
  }

  bindingRepo.deleteByIdentityId(identityId)
  sessionRepo.clearLocalSession()
  resetIdentityToGuest(identityId)
  invalidateHubTokenCache()
  refreshP2pDeviceIdentityBinding()

  return getAuthSession()
}

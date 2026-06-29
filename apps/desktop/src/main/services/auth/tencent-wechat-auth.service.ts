import { randomUUID } from 'node:crypto'

import { AuthBindingRepository, type AuthBindingMetadata } from '@toolman/db'
import type { AuthBindProviderInput, AuthSession } from '@toolman/shared'

import { getDatabase } from '../../bootstrap/database'
import { getAuthSession } from '../auth-session.service'
import { getLocalIdentityId } from '../local-identity'
import { assertAuthBindAllowed } from './auth-build-profile.service.js'
import { AuthLoginError } from './auth-login.error.js'
import { verifySmsChallenge } from './auth-sms-challenge.service.js'
import { persistAuthLogin, upsertAuthBinding } from './auth-persist.service.js'
import { maskPhone, normalizeCnPhone } from './phone-utils.js'
import { verifyPhoneSmsLogin } from './tencent-phone-auth.service.js'
import { isWechatAuthAvailable } from './wechat-auth.config.js'
import {
  consumeWechatMergeToken,
  createWechatMergeToken,
} from './wechat-merge-pending.service.js'
import { runWechatOAuthFlow } from './wechat-oauth-flow.service.js'
import type { WechatAuthIdentity } from './wechat-oauth.service.js'

export class AuthMergeRequiredError extends AuthLoginError {
  constructor(
    readonly mergeToken: string,
    readonly maskedPhone: string,
    readonly wechatLabel: string,
  ) {
    super('检测到本机已有手机号账户，请验证手机号以合并微信登录', 'AUTH_MERGE_REQUIRED')
    this.name = 'AuthMergeRequiredError'
  }
}

function wechatBindingMetadata(wechat: WechatAuthIdentity): AuthBindingMetadata {
  return {
    label: wechat.nickname,
    wechatNickname: wechat.nickname,
    openId: wechat.openId,
    unionId: wechat.unionId ?? undefined,
  }
}

function wechatSessionToken(wechat: WechatAuthIdentity): string {
  return wechat.accessToken || randomUUID()
}

function getIdentityBindings(identityId: string = getLocalIdentityId()) {
  const bindingRepo = new AuthBindingRepository(getDatabase())
  return bindingRepo.listByIdentityId(identityId)
}

function findPhoneBinding(identityId: string = getLocalIdentityId()) {
  return getIdentityBindings(identityId).find((binding) => binding.provider === 'tencent_phone') ?? null
}

function findWechatBinding(identityId: string = getLocalIdentityId()) {
  return getIdentityBindings(identityId).find((binding) => binding.provider === 'tencent_wechat') ?? null
}

export function loginWithWechatIdentity(wechat: WechatAuthIdentity): AuthSession {
  return persistAuthLogin({
    region: 'cn',
    provider: 'tencent_wechat',
    subjectId: wechat.subjectId,
    bindingLabel: wechat.nickname,
    bindingMetadata: wechatBindingMetadata(wechat),
    accessToken: wechatSessionToken(wechat),
    refreshToken: wechat.refreshToken,
    expiresInSeconds: wechat.expiresIn,
  })
}

export async function loginWithWechatOAuth(): Promise<AuthSession> {
  if (!isWechatAuthAvailable()) {
    throw new AuthLoginError('微信登录未配置，请设置 TOOLMAN_WECHAT_* 环境变量')
  }

  const wechat = await runWechatOAuthFlow()
  const bindingRepo = new AuthBindingRepository(getDatabase())
  const existingWechat = bindingRepo.findByProviderSubject('tencent_wechat', wechat.subjectId)
  if (existingWechat && existingWechat.identityId !== getLocalIdentityId()) {
    throw new AuthLoginError('该微信已绑定到其他 Toolman 账户')
  }

  const phoneBinding = findPhoneBinding()
  const wechatBinding = findWechatBinding()

  if (phoneBinding && !wechatBinding) {
    const mergeToken = createWechatMergeToken(wechat, phoneBinding.subjectId)
    throw new AuthMergeRequiredError(mergeToken, maskPhone(phoneBinding.subjectId), wechat.nickname)
  }

  return loginWithWechatIdentity(wechat)
}

export function completeWechatPhoneMerge(input: {
  mergeToken: string
  phone: string
  code: string
}): AuthSession {
  const normalizedPhone = normalizeCnPhone(input.phone)
  verifySmsChallenge(normalizedPhone, input.code)

  const phoneBinding = findPhoneBinding()
  if (!phoneBinding || phoneBinding.subjectId !== normalizedPhone) {
    throw new AuthLoginError('请输入已绑定账户的手机号以完成合并')
  }

  const wechat = consumeWechatMergeToken(input.mergeToken, normalizedPhone)
  return loginWithWechatIdentity(wechat)
}

export async function bindAuthProvider(input: AuthBindProviderInput): Promise<AuthSession> {
  const session = getAuthSession()
  if (!session.isLoggedIn) {
    throw new AuthLoginError('请先登录后再绑定登录方式')
  }

  assertAuthBindAllowed(input.provider)

  if (input.provider === 'tencent_wechat') {
    if (!isWechatAuthAvailable()) {
      throw new AuthLoginError('微信登录未配置，请设置 TOOLMAN_WECHAT_* 环境变量')
    }
    const wechat = await runWechatOAuthFlow()
    upsertAuthBinding({
      identityId: getLocalIdentityId(),
      provider: 'tencent_wechat',
      subjectId: wechat.subjectId,
      bindingLabel: wechat.nickname,
      bindingMetadata: wechatBindingMetadata(wechat),
    })
    return getAuthSession()
  }

  if (input.provider === 'tencent_phone') {
    const phone = typeof input.payload?.phone === 'string' ? input.payload.phone : ''
    const code = typeof input.payload?.code === 'string' ? input.payload.code : ''
    const phoneResult = verifyPhoneSmsLogin(phone, code)
    upsertAuthBinding({
      identityId: getLocalIdentityId(),
      provider: 'tencent_phone',
      subjectId: phoneResult.subjectId,
      bindingLabel: phoneResult.label,
      bindingMetadata: { phone: phoneResult.phone, label: phoneResult.label },
    })
    return getAuthSession()
  }

  throw new AuthLoginError('暂不支持绑定该登录方式')
}

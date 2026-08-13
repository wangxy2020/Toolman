import { AuthenticationClient } from 'authing-js-sdk'

import { AuthLoginError, readAuthServiceErrorMessage } from './auth-login.error.js'
import { isAuthingConfigured, isAuthingDevMode } from './authing-auth.config.js'
import { formatAuthingServiceError } from './authing-error-utils.js'
import { isAuthingAccountExistsError } from './authing-otp-error-utils.js'
import { getAuthingClient } from './authing-client.service.js'
import { assertValidPasswordLength } from './authing-password-utils.js'
import { maskCnAuthAccount, type ParsedCnAuthAccount } from './cn-account-utils.js'
import type { TencentPhoneAuthResult } from './tencent-phone-auth.service.js'

type AuthingPasswordClient = AuthenticationClient & {
  loginByPhonePassword: (
    phone: string,
    password: string,
    options?: { phoneCountryCode?: string },
  ) => Promise<{ id: string; token?: string | null; email?: string | null; phone?: string | null }>
}

function phoneDigits(phone: string): string {
  return phone.replace(/^\+86/, '')
}

function formatPasswordAuthError(error: unknown): string {
  const message = readAuthServiceErrorMessage(error)
  if (message && isAuthingAccountExistsError(message)) {
    return '该账号已注册，请切换到「登录」'
  }
  if (message && /密码|password|credential|凭证|账号或密码/i.test(message)) {
    return '账号或密码错误'
  }
  return formatAuthingServiceError(message, '登录失败，请重试')
}

export async function verifyCnPasswordLogin(
  account: ParsedCnAuthAccount,
  passwordInput: string,
): Promise<TencentPhoneAuthResult & { channel: ParsedCnAuthAccount['channel'] }> {
  const password = passwordInput.trim()
  assertValidPasswordLength(password)

  if (isAuthingDevMode()) {
    return {
      channel: account.channel,
      phone: account.phone ?? account.email ?? account.normalized,
      subjectId: account.normalized,
      sessionToken: account.normalized,
      label: maskCnAuthAccount(account),
    }
  }

  if (!isAuthingConfigured()) {
    throw new AuthLoginError('密码登录需配置 Authing（TOOLMAN_AUTHING_*）')
  }

  const client = getAuthingClient() as AuthingPasswordClient
  try {
    const user =
      account.channel === 'email' && account.email
        ? await client.loginByEmail(account.email, password)
        : account.phone
          ? await client.loginByPhonePassword(phoneDigits(account.phone), password, {
              phoneCountryCode: '+86',
            })
          : null

    if (!user) {
      throw new AuthLoginError('请输入手机号或邮箱')
    }

    const token = user.token
    if (!token) {
      throw new AuthLoginError('Authing 登录未返回 token')
    }

    return {
      channel: account.channel,
      phone: account.phone ?? user.phone ?? account.email ?? account.normalized,
      subjectId: user.id,
      sessionToken: token,
      label: user.phone ?? user.email ?? maskCnAuthAccount(account),
    }
  } catch (error) {
    if (error instanceof AuthLoginError) {
      throw error
    }
    throw new AuthLoginError(formatPasswordAuthError(error))
  }
}

export const verifyCnEmailPasswordLogin = verifyCnPasswordLogin

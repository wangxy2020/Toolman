import { AuthLoginError, readAuthServiceErrorMessage } from './auth-login.error.js'
import { isAuthingConfigured, isAuthingDevMode } from './authing-auth.config.js'
import { formatAuthingServiceError } from './authing-error-utils.js'
import { isAuthingAccountExistsError } from './authing-otp-error-utils.js'
import { getAuthingClient } from './authing-client.service.js'
import { assertValidPasswordLength } from './authing-password-utils.js'
import { maskCnAuthAccount, type ParsedCnAuthAccount } from './cn-account-utils.js'
import type { TencentPhoneAuthResult } from './tencent-phone-auth.service.js'

function formatPasswordAuthError(error: unknown): string {
  const message = readAuthServiceErrorMessage(error)
  if (message && isAuthingAccountExistsError(message)) {
    return '该邮箱已注册，请切换到「登录」'
  }
  if (message && /密码|password|credential|凭证|账号或密码/i.test(message)) {
    return '邮箱或密码错误'
  }
  return formatAuthingServiceError(message, '登录失败，请重试')
}

export async function verifyCnEmailPasswordLogin(
  account: ParsedCnAuthAccount,
  passwordInput: string,
): Promise<TencentPhoneAuthResult & { channel: 'email' }> {
  if (account.channel !== 'email' || !account.email) {
    throw new AuthLoginError('请输入有效邮箱')
  }

  const password = passwordInput.trim()
  assertValidPasswordLength(password)

  if (isAuthingDevMode()) {
    return {
      channel: 'email',
      phone: account.email,
      subjectId: account.email,
      sessionToken: account.email,
      label: maskCnAuthAccount(account),
    }
  }

  if (!isAuthingConfigured()) {
    throw new AuthLoginError('邮箱密码登录需配置 Authing（TOOLMAN_AUTHING_*）')
  }

  const client = getAuthingClient()
  try {
    const user = await client.loginByEmail(account.email, password)

    const token = user.token
    if (!token) {
      throw new AuthLoginError('Authing 登录未返回 token')
    }

    return {
      channel: 'email',
      phone: account.email,
      subjectId: user.id,
      sessionToken: token,
      label: user.email ?? maskCnAuthAccount(account),
    }
  } catch (error) {
    if (error instanceof AuthLoginError) {
      throw error
    }
    throw new AuthLoginError(formatPasswordAuthError(error))
  }
}

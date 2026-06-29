import { AuthLoginError, readAuthServiceErrorMessage } from './auth-login.error.js'
import { isAuthingConfigured, isAuthingDevMode } from './authing-auth.config.js'
import { formatAuthingServiceError } from './authing-error-utils.js'
import { getAuthingClient } from './authing-client.service.js'
import { assertMatchingPasswords, assertValidPasswordLength } from './authing-password-utils.js'
import { parseCnAuthAccount } from './cn-account-utils.js'

function phoneCountryCode(phone: string): string {
  return phone.startsWith('+86') ? '+86' : '+86'
}

function phoneDigits(phone: string): string {
  return phone.replace(/^\+86/, '')
}

function formatResetPasswordError(error: unknown): string {
  const message = readAuthServiceErrorMessage(error)
  return formatAuthingServiceError(message, '重置密码失败，请重试')
}

export async function resetCnAccountPassword(
  accountInput: string,
  codeInput: string,
  passwordInput: string,
  confirmPasswordInput: string,
): Promise<void> {
  const account = parseCnAuthAccount(accountInput)
  const code = codeInput.trim()
  if (!/^\d{4,8}$/.test(code)) {
    throw new AuthLoginError('请输入有效验证码')
  }

  const password = passwordInput.trim()
  const confirmPassword = confirmPasswordInput.trim()
  assertValidPasswordLength(password)
  assertMatchingPasswords(password, confirmPassword)

  if (isAuthingDevMode()) {
    return
  }

  if (!isAuthingConfigured()) {
    throw new AuthLoginError('重置密码需配置 Authing（TOOLMAN_AUTHING_*）')
  }

  const client = getAuthingClient()
  try {
    if (account.channel === 'email' && account.email) {
      await client.resetPasswordByEmailCode(account.email, code, password)
      return
    }

    if (account.channel === 'phone' && account.phone) {
      await client.resetPasswordByPhoneCode(
        phoneDigits(account.phone),
        code,
        password,
        phoneCountryCode(account.phone),
      )
      return
    }

    throw new AuthLoginError('请输入有效手机或邮箱')
  } catch (error) {
    if (error instanceof AuthLoginError) {
      throw error
    }
    throw new AuthLoginError(formatResetPasswordError(error))
  }
}

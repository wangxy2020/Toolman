import { AuthLoginError, readAuthServiceErrorMessage } from './auth-login.error.js'
import { isAuthingConfigured, isAuthingDevMode } from './authing-auth.config.js'
import { formatAuthingServiceError } from './authing-error-utils.js'
import { getAuthingClient } from './authing-client.service.js'
import { assertMatchingPasswords, assertValidPasswordLength } from './authing-password-utils.js'
import { assertAuthingRegisterAccountAvailable } from './authing-user-exists.service.js'
import { maskCnAuthAccount, type ParsedCnAuthAccount } from './cn-account-utils.js'
import type { TencentPhoneAuthResult } from './tencent-phone-auth.service.js'

function phoneCountryCode(phone: string): string {
  return phone.startsWith('+86') ? '+86' : '+86'
}

function phoneDigits(phone: string): string {
  return phone.replace(/^\+86/, '')
}

function formatRegisterError(error: unknown): string {
  const message = readAuthServiceErrorMessage(error)
  return formatAuthingServiceError(message, '注册失败，请重试')
}

export async function registerCnAccountWithOtp(
  account: ParsedCnAuthAccount,
  codeInput: string,
  passwordInput: string,
  confirmPasswordInput: string,
): Promise<TencentPhoneAuthResult & { channel: ParsedCnAuthAccount['channel'] }> {
  const code = codeInput.trim()
  if (!/^\d{4,8}$/.test(code)) {
    throw new AuthLoginError('请输入有效验证码')
  }

  const password = passwordInput.trim()
  const confirmPassword = confirmPasswordInput.trim()
  assertValidPasswordLength(password)
  assertMatchingPasswords(password, confirmPassword)

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
    throw new AuthLoginError('注册需配置 Authing（TOOLMAN_AUTHING_*）')
  }

  await assertAuthingRegisterAccountAvailable(account, 'register')

  const client = getAuthingClient()
  try {
    let user
    if (account.channel === 'email' && account.email) {
      user = await client.registerByEmailCode(account.email, code, undefined, { generateToken: true })
    } else if (account.channel === 'phone' && account.phone) {
      user = await client.registerByPhoneCode(phoneDigits(account.phone), code, undefined, undefined, {
        phoneCountryCode: phoneCountryCode(account.phone),
        generateToken: true,
      })
    } else {
      throw new AuthLoginError('请输入有效手机或邮箱')
    }

    if (!user.token) {
      throw new AuthLoginError('Authing 注册未返回 token')
    }

    client.setCurrentUser(user)
    await client.updatePassword(password)

    const label =
      account.channel === 'email'
        ? user.email ?? maskCnAuthAccount(account)
        : maskCnAuthAccount(account)

    return {
      channel: account.channel,
      phone: account.phone ?? account.email ?? account.normalized,
      subjectId: user.id,
      sessionToken: user.token,
      label,
    }
  } catch (error) {
    if (error instanceof AuthLoginError) {
      throw error
    }
    throw new AuthLoginError(formatRegisterError(error))
  }
}

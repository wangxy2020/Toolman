import {
  establishExternalSession,
  registerWithAccount,
  resetPasswordWithAccount,
  type AuthResult,
} from './localAuth'
import {
  formatAuthingError,
  getAuthingClient,
  isAuthingLocalMode,
  phoneDigits,
  verifyLocalChallenge,
  type AuthingPasswordClient,
  type AuthingUser,
  type ParsedAccountOk,
} from './authingOtp-helpers'
import { parseAccountInput } from './account-utils'

export async function sessionFromAuthingUser(
  user: AuthingUser,
  parsed: ParsedAccountOk,
  displayName?: string,
): Promise<AuthResult> {
  if (!user.token) {
    return { ok: false, message: 'Authing 未返回 token' }
  }
  return establishExternalSession({
    externalId: user.id,
    email: parsed.accountKind === 'email' ? parsed.email : user.email ?? null,
    phone: parsed.phone || user.phone || null,
    displayName: displayName?.trim() || user.nickname || user.username || null,
    accessToken: user.token,
    provider: 'authing',
    region: 'cn',
  })
}

export async function loginWithAuthingPassword(input: {
  account: string
  password: string
}): Promise<AuthResult> {
  const parsed = parseAccountInput(input.account, 'cn')
  if (!parsed.ok) return parsed
  if (!input.password) return { ok: false, message: '请输入密码' }

  if (isAuthingLocalMode()) {
    return { ok: false, message: 'Authing 未配置' }
  }

  try {
    const auth = getAuthingClient()
    let user: AuthingUser
    if (parsed.accountKind === 'email' && parsed.email) {
      user = await auth.loginByEmail(parsed.email, input.password)
    } else if (parsed.phone) {
      user = await (auth as AuthingPasswordClient).loginByPhonePassword(
        phoneDigits(parsed.phone),
        input.password,
        { phoneCountryCode: '+86' },
      )
    } else {
      return { ok: false, message: '请输入手机号或邮箱' }
    }
    return sessionFromAuthingUser(user, parsed)
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '登录失败，请重试') }
  }
}

export async function registerWithVerificationCode(input: {
  account: string
  code: string
  password: string
  confirmPassword: string
  displayName?: string
}): Promise<AuthResult> {
  const parsed = parseAccountInput(input.account, 'cn')
  if (!parsed.ok) return parsed
  if (!/^\d{4,8}$/.test(input.code.trim())) {
    return { ok: false, message: '请输入有效验证码' }
  }
  if (input.password.length < 6) {
    return { ok: false, message: '密码至少 6 位' }
  }
  if (input.confirmPassword !== input.password) {
    return { ok: false, message: '两次输入的密码不一致' }
  }

  if (isAuthingLocalMode()) {
    const verified = verifyLocalChallenge(parsed.accountKey, input.code)
    if (!verified.ok) return verified
    return registerWithAccount({
      account: input.account,
      password: input.password,
      confirmPassword: input.confirmPassword,
      displayName: input.displayName ?? '',
      region: 'cn',
    })
  }

  try {
    const auth = getAuthingClient()
    let user: AuthingUser
    if (parsed.accountKind === 'email' && parsed.email) {
      user = await auth.registerByEmailCode(parsed.email, input.code.trim(), undefined, {
        generateToken: true,
      })
    } else if (parsed.phone) {
      user = await auth.registerByPhoneCode(
        phoneDigits(parsed.phone),
        input.code.trim(),
        undefined,
        undefined,
        {
          phoneCountryCode: '+86',
          generateToken: true,
        },
      )
    } else {
      return { ok: false, message: '请输入手机号或邮箱' }
    }

    if (!user.token) {
      return { ok: false, message: 'Authing 注册未返回 token' }
    }

    auth.setCurrentUser(user as never)
    await auth.updatePassword(input.password)

    return sessionFromAuthingUser(user, parsed, input.displayName)
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '注册失败，请重试') }
  }
}

export async function resetPasswordWithVerificationCode(input: {
  account: string
  code: string
  password: string
  confirmPassword: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = parseAccountInput(input.account, 'cn')
  if (!parsed.ok) return parsed
  if (!/^\d{4,8}$/.test(input.code.trim())) {
    return { ok: false, message: '请输入有效验证码' }
  }
  if (input.password.length < 6) {
    return { ok: false, message: '密码至少 6 位' }
  }
  if (input.confirmPassword !== input.password) {
    return { ok: false, message: '两次输入的密码不一致' }
  }

  if (isAuthingLocalMode()) {
    const verified = verifyLocalChallenge(parsed.accountKey, input.code)
    if (!verified.ok) return verified
    return resetPasswordWithAccount({
      account: input.account,
      newPassword: input.password,
      confirmPassword: input.confirmPassword,
      region: 'cn',
    })
  }

  try {
    const auth = getAuthingClient()
    if (parsed.accountKind === 'email' && parsed.email) {
      await auth.resetPasswordByEmailCode(parsed.email, input.code.trim(), input.password)
    } else if (parsed.phone) {
      await auth.resetPasswordByPhoneCode(
        phoneDigits(parsed.phone),
        input.code.trim(),
        input.password,
        '+86',
      )
    } else {
      return { ok: false, message: '请输入手机号或邮箱' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '重置密码失败，请重试') }
  }
}

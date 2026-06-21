export function isAuthingAccountExistsError(message: string): boolean {
  return /已存在|already exists|重复注册|已被注册|用户已存在/i.test(message)
}

export function shouldFallbackRegisterToLogin(message: string): boolean {
  return isAuthingAccountExistsError(message)
}

export function formatAuthingRegisterExistsMessage(channel: 'email' | 'phone'): string {
  return channel === 'email' ? '该邮箱已注册，请切换到「登录」' : '该手机号已注册，请切换到「登录」'
}

export function formatAuthingOtpVerifyError(
  message: string | null | undefined,
  ttlMinutes: number,
  fallback = '验证码校验失败，请重试',
): string {
  const trimmed = message?.trim()
  if (!trimmed) {
    return fallback
  }

  if (/过期|expired/i.test(trimmed)) {
    return `验证码已过期（有效期 ${ttlMinutes} 分钟），请重新获取`
  }

  if (isAuthingAccountExistsError(trimmed)) {
    return '该账号已注册，请切换到「登录」'
  }

  if (/错误|不正确|有误|invalid/i.test(trimmed)) {
    return '验证码错误，请检查后重试'
  }

  if (/已失效/i.test(trimmed)) {
    return '验证码错误或已失效，请重新获取后重试'
  }

  return trimmed
}

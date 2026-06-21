import { describe, expect, it } from 'vitest'

import {
  formatAuthingOtpVerifyError,
  formatAuthingRegisterExistsMessage,
  shouldFallbackRegisterToLogin,
} from './authing-otp-error-utils.js'

describe('shouldFallbackRegisterToLogin', () => {
  it('falls back only when account already exists', () => {
    expect(shouldFallbackRegisterToLogin('该邮箱已被注册')).toBe(true)
    expect(shouldFallbackRegisterToLogin('验证码已失效，请重新获取验证码')).toBe(false)
    expect(shouldFallbackRegisterToLogin('验证码错误')).toBe(false)
  })
})

describe('formatAuthingRegisterExistsMessage', () => {
  it('uses channel-specific copy', () => {
    expect(formatAuthingRegisterExistsMessage('email')).toBe('该邮箱已注册，请切换到「登录」')
    expect(formatAuthingRegisterExistsMessage('phone')).toBe('该手机号已注册，请切换到「登录」')
  })
})

describe('formatAuthingOtpVerifyError', () => {
  it('maps invalid codes to a clear message', () => {
    expect(formatAuthingOtpVerifyError('验证码已失效，请重新获取验证码', 2)).toBe(
      '验证码错误或已失效，请重新获取后重试',
    )
  })

  it('maps expired codes separately', () => {
    expect(formatAuthingOtpVerifyError('验证码已过期', 2)).toBe('验证码已过期（有效期 2 分钟），请重新获取')
  })

  it('maps existing account errors separately', () => {
    expect(formatAuthingOtpVerifyError('该邮箱已被注册', 2)).toBe('该账号已注册，请切换到「登录」')
  })
})

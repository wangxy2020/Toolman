import { describe, expect, it } from 'vitest'

import { AuthLoginError, readAuthServiceErrorMessage } from './auth-login.error.js'

describe('readAuthServiceErrorMessage', () => {
  it('reads AuthLoginError and Error messages', () => {
    expect(readAuthServiceErrorMessage(new AuthLoginError('邮箱验证码发送失败'))).toBe(
      '邮箱验证码发送失败',
    )
    expect(readAuthServiceErrorMessage(new Error('network timeout'))).toBe('network timeout')
  })

  it('reads nested graphql-style errors', () => {
    expect(
      readAuthServiceErrorMessage({
        errors: [{ message: 'invalid email scene' }],
      }),
    ).toBe('invalid email scene')
  })

  it('returns null for unknown errors', () => {
    expect(readAuthServiceErrorMessage(null)).toBeNull()
  })
})

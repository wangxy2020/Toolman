import { describe, expect, it } from 'vitest'

import { formatAuthingConfigurationError, formatAuthingServiceError } from './authing-error-utils.js'

describe('formatAuthingConfigurationError', () => {
  it('maps user pool not found errors to configuration guidance', () => {
    expect(formatAuthingConfigurationError('用户池不存在')).toContain('TOOLMAN_AUTHING_APP_HOST')
    expect(formatAuthingConfigurationError('User pool does not exist')).toContain('TOOLMAN_AUTHING_USER_POOL_ID')
  })

  it('returns null for unrelated errors', () => {
    expect(formatAuthingConfigurationError('验证码错误')).toBeNull()
  })
})

describe('formatAuthingServiceError', () => {
  it('uses fallback when message is empty', () => {
    expect(formatAuthingServiceError(undefined, '发送失败')).toBe('发送失败')
  })

  it('maps known configuration errors', () => {
    expect(formatAuthingServiceError('用户池不存在', '发送失败')).toContain('TOOLMAN_AUTHING_APP_ID')
  })
})

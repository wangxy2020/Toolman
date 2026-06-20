import { describe, expect, it } from 'vitest'

import {
  formatAuthDevSmsLog,
  redactEmail,
  redactPhone,
  redactSecret,
} from './auth-log-redaction.js'

describe('auth-log-redaction', () => {
  it('redacts phone numbers for logs', () => {
    expect(redactPhone('+8613800138000')).toBe('861****8000')
  })

  it('redacts email addresses for logs', () => {
    expect(redactEmail('user@example.com')).toBe('us***@example.com')
  })

  it('formats dev sms logs without exposing full secrets', () => {
    expect(formatAuthDevSmsLog('+8613800138000', '123456')).toBe(
      '[auth:sms-dev] 861****8000 -> ***56',
    )
    expect(formatAuthDevSmsLog('+8613800138000', '123456')).not.toContain('123456')
  })

  it('redacts generic secrets', () => {
    expect(redactSecret('abcdefgh', 2, 2)).toBe('ab***gh')
  })
})

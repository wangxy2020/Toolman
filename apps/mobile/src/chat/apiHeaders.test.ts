import { describe, expect, it } from 'vitest'
import { buildApiAuthHeaders, isIso8859_1, sanitizeApiKey } from './apiHeaders'

describe('apiHeaders', () => {
  it('strips Bearer prefix and invisible chars', () => {
    expect(sanitizeApiKey('Bearer sk-test')).toBe('sk-test')
    expect(sanitizeApiKey('\uFEFFsk-test\u200B')).toBe('sk-test')
    expect(sanitizeApiKey(' sk-ab\ncd ')).toBe('sk-abcd')
    expect(sanitizeApiKey('"sk-test"')).toBe('sk-test')
  })

  it('rejects non ISO-8859-1 keys before fetch', () => {
    expect(isIso8859_1('sk-abc')).toBe(true)
    expect(isIso8859_1('密钥sk-abc')).toBe(false)
    const result = buildApiAuthHeaders('请填写密钥')
    expect(result.ok).toBe(false)
  })

  it('builds Authorization header for ascii keys', () => {
    const result = buildApiAuthHeaders('sk-test')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.headers.Authorization).toBe('Bearer sk-test')
    }
  })
})

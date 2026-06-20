import { describe, expect, it } from 'vitest'

import { maskPhone, normalizeCnPhone } from './phone-utils'

describe('phone-utils', () => {
  it('normalizes mainland mobile numbers', () => {
    expect(normalizeCnPhone('13800138000')).toBe('+8613800138000')
    expect(normalizeCnPhone('+8613800138000')).toBe('+8613800138000')
    expect(normalizeCnPhone('8613800138000')).toBe('+8613800138000')
  })

  it('masks phone numbers', () => {
    expect(maskPhone('13800138000')).toBe('+86138****8000')
  })

  it('rejects invalid numbers', () => {
    expect(() => normalizeCnPhone('12345')).toThrow('请输入有效的中国大陆手机号')
  })
})

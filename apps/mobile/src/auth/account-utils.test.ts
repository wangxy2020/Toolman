import { describe, expect, it } from 'vitest'
import { cnPrimaryActionLabel, parseAccountInput, maskPhone } from './account-utils'
import { sha256Hex, sha256HexSync } from './sha256'

describe('parseAccountInput', () => {
  it('accepts email in cn and intl', () => {
    expect(parseAccountInput('User@Example.com', 'cn')).toEqual({
      ok: true,
      accountKey: 'user@example.com',
      accountKind: 'email',
      email: 'user@example.com',
      phone: null,
    })
    expect(parseAccountInput('a@b.co', 'intl').ok).toBe(true)
  })

  it('accepts cn mobile and rejects in intl', () => {
    expect(parseAccountInput('13800138000', 'cn')).toMatchObject({
      ok: true,
      accountKind: 'phone',
      accountKey: '13800138000',
    })
    expect(parseAccountInput('13800138000', 'intl').ok).toBe(false)
  })
})

describe('cnPrimaryActionLabel', () => {
  it('switches by account shape', () => {
    expect(cnPrimaryActionLabel('login', 'a@b.com')).toBe('邮箱登录')
    expect(cnPrimaryActionLabel('login', '13800138000')).toBe('手机号登录')
  })
})

describe('maskPhone', () => {
  it('masks mainland mobile numbers', () => {
    expect(maskPhone('13800138000')).toBe('138****8000')
  })
})

describe('sha256', () => {
  it('matches known digest', async () => {
    const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    expect(sha256HexSync('')).toBe(expected)
    expect(await sha256Hex('')).toBe(expected)
  })
})

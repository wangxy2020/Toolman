import { describe, expect, it } from 'vitest'

import { parseCnAuthAccount, maskCnAuthAccount } from './cn-account-utils.js'

describe('cn-account-utils', () => {
  it('parses mainland phone numbers', () => {
    const account = parseCnAuthAccount('13800138000')
    expect(account.channel).toBe('phone')
    expect(account.phone).toBe('+8613800138000')
  })

  it('parses email addresses', () => {
    const account = parseCnAuthAccount('User@Example.com')
    expect(account.channel).toBe('email')
    expect(account.email).toBe('user@example.com')
  })

  it('masks phone and email differently', () => {
    const phone = parseCnAuthAccount('13800138000')
    const email = parseCnAuthAccount('hello@example.com')
    expect(maskCnAuthAccount(phone)).toContain('****')
    expect(maskCnAuthAccount(email)).toBe('he***@example.com')
  })
})

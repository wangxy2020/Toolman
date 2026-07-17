import { describe, expect, it } from 'vitest'

import { normalizeRegisteredEmail, normalizeRegisteredPhone } from './resolve-registered-email'

describe('normalizeRegisteredEmail', () => {
  it('accepts a full email address', () => {
    expect(normalizeRegisteredEmail('User@Example.com')).toBe('user@example.com')
  })

  it('rejects masked emails and non-emails', () => {
    expect(normalizeRegisteredEmail('he***@example.com')).toBeUndefined()
    expect(normalizeRegisteredEmail('本地用户')).toBeUndefined()
    expect(normalizeRegisteredEmail('')).toBeUndefined()
    expect(normalizeRegisteredEmail(null)).toBeUndefined()
  })
})

describe('normalizeRegisteredPhone', () => {
  it('accepts an unmasked phone number', () => {
    expect(normalizeRegisteredPhone('+8613800138000')).toBe('+8613800138000')
  })

  it('rejects masked phones', () => {
    expect(normalizeRegisteredPhone('138****8000')).toBeUndefined()
    expect(normalizeRegisteredPhone('本地用户')).toBeUndefined()
  })
})

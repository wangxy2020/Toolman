import { describe, expect, it } from 'vitest'

import { isAuthOAuthPopupUrl } from './auth-oauth-popup'

describe('auth-oauth-popup', () => {
  it('allows google and apple oauth popup urls', () => {
    expect(isAuthOAuthPopupUrl('https://accounts.google.com/o/oauth2/auth')).toBe(true)
    expect(isAuthOAuthPopupUrl('https://appleid.apple.com/auth/authorize')).toBe(true)
    expect(isAuthOAuthPopupUrl('https://toolman-test.firebaseapp.com/__/auth/handler')).toBe(true)
    expect(isAuthOAuthPopupUrl('https://open.weixin.qq.com/connect/qrconnect')).toBe(true)
  })

  it('blocks unrelated external urls', () => {
    expect(isAuthOAuthPopupUrl('https://example.com/login')).toBe(false)
    expect(isAuthOAuthPopupUrl('file:///tmp/test')).toBe(false)
  })
})

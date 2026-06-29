import { describe, expect, it } from 'vitest'

import {
  decodeJwtPayload,
  looksLikeEmailSubject,
  resolveAuthingUserIdFromAccessToken,
} from './authing-token-utils.js'

function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

describe('authing-token-utils', () => {
  it('decodes jwt payload sub claim', () => {
    const token = `header.${encodePayload({ sub: 'authing-user-123' })}.sig`
    expect(resolveAuthingUserIdFromAccessToken(token, 'user@example.com')).toBe('authing-user-123')
  })

  it('falls back to binding subject when token is missing', () => {
    expect(resolveAuthingUserIdFromAccessToken(null, 'binding-subject')).toBe('binding-subject')
  })

  it('detects email-shaped subjects', () => {
    expect(looksLikeEmailSubject('wxymale@126.com')).toBe(true)
    expect(looksLikeEmailSubject('authing-user-123')).toBe(false)
  })

  it('returns null for malformed jwt', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
  })
})

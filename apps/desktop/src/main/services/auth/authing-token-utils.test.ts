import { describe, expect, it } from 'vitest'

import { extractAuthingRolesFromAccessToken } from './authing-token-utils.js'

function encodePayload(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.`
}

describe('extractAuthingRolesFromAccessToken', () => {
  it('reads string role arrays from token claims', () => {
    const token = encodePayload({ sub: 'user-1', roles: ['admin', 'user'] })
    expect(extractAuthingRolesFromAccessToken(token)).toEqual(['admin', 'user'])
  })

  it('reads role objects with code/name', () => {
    const token = encodePayload({
      roles: [{ code: 'admin', name: '管理员' }],
    })
    expect(extractAuthingRolesFromAccessToken(token)).toEqual(['admin', '管理员'])
  })
})

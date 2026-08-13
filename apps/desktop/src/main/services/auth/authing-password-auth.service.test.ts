import { describe, expect, it, vi } from 'vitest'

vi.mock('./authing-client.service.js', () => ({
  getAuthingClient: vi.fn(),
}))

vi.mock('./authing-auth.config.js', () => ({
  isAuthingConfigured: () => true,
  isAuthingDevMode: () => true,
}))

vi.mock('./authing-user-exists.service.js', () => ({
  assertAuthingRegisterAccountAvailable: vi.fn(),
  checkAuthingUserExists: vi.fn(),
}))

import { verifyCnPasswordLogin } from './authing-password-auth.service.js'
import { parseCnAuthAccount } from './cn-account-utils.js'

describe('verifyCnPasswordLogin', () => {
  it('supports dev mode email password login', async () => {
    const account = parseCnAuthAccount('user@example.com')
    const result = await verifyCnPasswordLogin(account, 'secret123')
    expect(result.channel).toBe('email')
    expect(result.subjectId).toBe('user@example.com')
  })

  it('supports dev mode phone password login', async () => {
    const account = parseCnAuthAccount('13800138000')
    const result = await verifyCnPasswordLogin(account, 'secret123')
    expect(result.channel).toBe('phone')
    expect(result.subjectId).toBe('+8613800138000')
  })
})

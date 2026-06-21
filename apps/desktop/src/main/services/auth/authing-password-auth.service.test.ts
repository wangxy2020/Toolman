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

import { verifyCnEmailPasswordLogin } from './authing-password-auth.service.js'
import { parseCnAuthAccount } from './cn-account-utils.js'

describe('verifyCnEmailPasswordLogin', () => {
  it('supports dev mode email password login', async () => {
    const account = parseCnAuthAccount('user@example.com')
    const result = await verifyCnEmailPasswordLogin(account, 'secret123')
    expect(result.channel).toBe('email')
    expect(result.subjectId).toBe('user@example.com')
  })
})

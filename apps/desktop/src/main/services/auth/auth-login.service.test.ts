import { describe, expect, it, vi } from 'vitest'

vi.mock('./auth-build-profile.service.js', () => ({
  assertAuthLoginAllowed: vi.fn(),
}))

vi.mock('./auth-profile-sync.service.js', () => ({
  finalizeRegisteredLogin: vi.fn(async (session) => session),
}))

vi.mock('../auth-session.service.js', () => ({
  getAuthSession: vi.fn(),
}))

import { assertAuthLoginAllowed } from './auth-build-profile.service.js'
import { loginAuth, sendAuthSmsCode } from './auth-login.service.js'
import { AuthLoginError } from './auth-login.error.js'

describe('auth-login.service', () => {
  it('rejects CN providers on intl region', async () => {
    await expect(
      loginAuth({
        region: 'intl',
        method: 'tencent_phone',
        payload: { phone: '13800138000', code: '123456' },
      }),
    ).rejects.toThrow('请切换到国内区域')
  })

  it('rejects firebase providers on cn region', async () => {
    await expect(
      loginAuth({
        region: 'cn',
        method: 'firebase_email',
        payload: { email: 'user@example.com', password: 'secret123' },
      }),
    ).rejects.toThrow('请切换到国际区域')
  })

  it('delegates sms code sending to CN flow', async () => {
    vi.mocked(assertAuthLoginAllowed).mockImplementation(() => undefined)
    await expect(
      sendAuthSmsCode({
        region: 'cn',
        phone: '13800138000',
        intent: 'login',
      }),
    ).rejects.toBeInstanceOf(AuthLoginError)
  })
})

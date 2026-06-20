import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  issueSmsChallenge,
  resetSmsChallengesForTests,
  verifySmsChallenge,
} from './auth-sms-challenge.service'

vi.mock('./tencent-auth.config.js', () => ({
  isTencentSmsDevMode: () => true,
}))

describe('auth-sms-challenge.service', () => {
  beforeEach(() => {
    resetSmsChallengesForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetSmsChallengesForTests()
  })

  it('issues and verifies a dev-mode code', () => {
    const issued = issueSmsChallenge('+8613800138000')
    expect(issued.code).toBe('123456')
    expect(() => verifySmsChallenge('+8613800138000', '123456')).not.toThrow()
  })

  it('enforces resend cooldown', () => {
    issueSmsChallenge('+8613800138000')
    expect(() => issueSmsChallenge('+8613800138000')).toThrow('请')
    vi.advanceTimersByTime(60_000)
    expect(() => issueSmsChallenge('+8613800138000')).not.toThrow()
  })
})

import { describe, expect, it } from 'vitest'

import { checkReplayGuard, resetReplayGuardForTests } from './p2p-replay-guard.service'

describe('p2p-replay-guard', () => {
  it('rejects duplicate payload in replay window', () => {
    resetReplayGuardForTests()
    const now = Date.now()
    expect(
      checkReplayGuard({
        scope: 'test',
        signerId: 'device-a',
        at: now,
        payloadHash: 'hash-1',
        now,
      }).ok,
    ).toBe(true)
    expect(
      checkReplayGuard({
        scope: 'test',
        signerId: 'device-a',
        at: now,
        payloadHash: 'hash-1',
        now,
      }).ok,
    ).toBe(false)
  })
})

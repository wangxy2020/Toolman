import { beforeEach, describe, expect, it } from 'vitest'

import { checkReplayGuard, resetReplayGuardForTests } from './p2p-replay-guard.service'

describe('p2p-replay-guard', () => {
  beforeEach(() => {
    resetReplayGuardForTests()
  })

  it('rejects duplicate payload in replay window', () => {
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

  it('rejects missing and stale timestamps', () => {
    const now = 1_700_000_000_000
    expect(
      checkReplayGuard({
        scope: 'test',
        signerId: 'device-a',
        at: 0,
        payloadHash: 'hash-1',
        now,
      }),
    ).toEqual({ ok: false, reason: 'missing timestamp' })

    expect(
      checkReplayGuard({
        scope: 'test',
        signerId: 'device-a',
        at: now - 10 * 60_000,
        payloadHash: 'hash-2',
        now,
        windowMs: 60_000,
      }),
    ).toEqual({ ok: false, reason: 'timestamp outside replay window' })
  })

  it('allows newer timestamps for same payload hash', () => {
    const now = Date.now()
    expect(
      checkReplayGuard({
        scope: 'chat',
        signerId: 'device-a',
        at: now - 1_000,
        payloadHash: 'hash-3',
        now,
      }).ok,
    ).toBe(true)
    expect(
      checkReplayGuard({
        scope: 'chat',
        signerId: 'device-a',
        at: now,
        payloadHash: 'hash-3',
        now,
      }).ok,
    ).toBe(true)
  })

  it('prunes overflow entries when guard map grows too large', () => {
    const now = 1_700_000_000_000
    for (let index = 0; index < 2_001; index += 1) {
      expect(
        checkReplayGuard({
          scope: 'overflow',
          signerId: 'device-a',
          at: now + index,
          payloadHash: `hash-${index}`,
          now: now + index,
          windowMs: 60_000,
        }).ok,
      ).toBe(true)
    }
    expect(
      checkReplayGuard({
        scope: 'overflow',
        signerId: 'device-a',
        at: now + 2_001,
        payloadHash: 'hash-new',
        now: now + 2_001,
        windowMs: 60_000,
      }).ok,
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { resolveThinkingDurationSeconds } from './useThinkingMetrics'

describe('resolveThinkingDurationSeconds', () => {
  it('uses live wall-clock while active', () => {
    expect(
      resolveThinkingDurationSeconds({
        active: true,
        startedAtMs: 1_000_000,
        storedDurationSeconds: null,
        frozenDurationSeconds: null,
        nowMs: 1_012_400,
      }),
    ).toBe(12)
  })

  it('does not grow from startedAtMs after thinking finished', () => {
    expect(
      resolveThinkingDurationSeconds({
        active: false,
        startedAtMs: 1_000_000,
        storedDurationSeconds: 8,
        frozenDurationSeconds: null,
        nowMs: 1_000_000 + 3_600_000,
      }),
    ).toBe(8)
  })

  it('keeps the longer frozen live reading over a shorter stored value', () => {
    expect(
      resolveThinkingDurationSeconds({
        active: false,
        startedAtMs: 1_000_000,
        storedDurationSeconds: 5,
        frozenDurationSeconds: 63,
        nowMs: 1_000_000 + 3_600_000,
      }),
    ).toBe(63)
  })

  it('returns 0 for historical messages without a stored duration', () => {
    expect(
      resolveThinkingDurationSeconds({
        active: false,
        startedAtMs: 1_000_000,
        storedDurationSeconds: null,
        frozenDurationSeconds: null,
        nowMs: 1_000_000 + 9_999_000,
      }),
    ).toBe(0)
  })
})

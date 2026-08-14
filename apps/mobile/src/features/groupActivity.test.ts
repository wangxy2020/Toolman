import { describe, expect, it } from 'vitest'
import { formatActivityRelativeTime } from './groupActivity'

describe('formatActivityRelativeTime', () => {
  it('uses relative labels for recent events', () => {
    const now = Date.parse('2026-08-14T10:00:00.000Z')
    expect(formatActivityRelativeTime(now - 10_000, now)).toBe('刚刚')
    expect(formatActivityRelativeTime(now - 5 * 60_000, now)).toBe('5 分钟前')
    expect(formatActivityRelativeTime(now - 3 * 3_600_000, now)).toBe('3 小时前')
  })
})

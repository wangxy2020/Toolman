import { describe, expect, it } from 'vitest'
import { isHorizontalSwipe, shouldRevealSwipeActions } from './swipeable-row-gesture'

describe('shouldRevealSwipeActions', () => {
  it('opens after a short left drag instead of requiring half the action width', () => {
    expect(
      shouldRevealSwipeActions({ translateX: -20, velocityX: 0, actionsWidth: 144 }),
    ).toBe(true)
    expect(
      shouldRevealSwipeActions({ translateX: -10, velocityX: 0, actionsWidth: 144 }),
    ).toBe(false)
  })

  it('opens on a left flick even with little distance', () => {
    expect(
      shouldRevealSwipeActions({ translateX: -8, velocityX: -0.2, actionsWidth: 144 }),
    ).toBe(true)
  })
})

describe('isHorizontalSwipe', () => {
  it('ignores tiny or mostly vertical movement', () => {
    expect(isHorizontalSwipe(-2, 0, 4)).toBe(false)
    expect(isHorizontalSwipe(-6, 10, 4)).toBe(false)
    expect(isHorizontalSwipe(-8, 2, 4)).toBe(true)
  })
})

import { describe, expect, it, vi } from 'vitest'

import { yieldToNextPaint } from './document-page-parse-helpers'

describe('yieldToNextPaint', () => {
  it('resolves on the next timer after animation frame', async () => {
    vi.useFakeTimers()
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', raf)

    const pending = yieldToNextPaint()
    await vi.runAllTimersAsync()
    await pending

    expect(raf).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})

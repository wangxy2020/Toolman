import { describe, expect, it } from 'vitest'
import { createConcurrencyLimiter } from './document-ocr-slot'

describe('createConcurrencyLimiter', () => {
  it('runs at most N tasks at once', async () => {
    const limiter = createConcurrencyLimiter(2)
    let current = 0
    let peak = 0
    const job = async () => {
      current += 1
      peak = Math.max(peak, current)
      await new Promise((resolve) => setTimeout(resolve, 20))
      current -= 1
    }
    await Promise.all([limiter.run(job), limiter.run(job), limiter.run(job), limiter.run(job)])
    expect(peak).toBe(2)
  })
})

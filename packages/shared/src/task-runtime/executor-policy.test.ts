import { describe, expect, it } from 'vitest'

import { computeRetryBackoffMs, resolveTaskToolExecutionPolicy } from './executor-policy.js'

describe('executor-policy', () => {
  it('classifies fs write tools', () => {
    const policy = resolveTaskToolExecutionPolicy('fs_write')
    expect(policy.category).toBe('fs_write')
    expect(policy.maxRetries).toBe(2)
    expect(policy.rollbackEligible).toBe(true)
  })

  it('classifies bash with longer timeout', () => {
    const policy = resolveTaskToolExecutionPolicy('bash')
    expect(policy.timeoutMs).toBe(300_000)
    expect(policy.rollbackEligible).toBe(false)
  })

  it('computes exponential backoff', () => {
    expect(computeRetryBackoffMs(1)).toBe(1000)
    expect(computeRetryBackoffMs(2)).toBe(2000)
    expect(computeRetryBackoffMs(10)).toBe(30_000)
  })
})

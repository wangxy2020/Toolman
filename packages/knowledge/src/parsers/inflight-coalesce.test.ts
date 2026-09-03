import { describe, expect, it, vi } from 'vitest'

import { coalesceInflight } from './inflight-coalesce.js'

describe('coalesceInflight', () => {
  it('reuses the same promise for concurrent callers', async () => {
    const inflight = new Map<string, Promise<number>>()
    const factory = vi.fn(async () => {
      await Promise.resolve()
      return 7
    })

    const first = coalesceInflight(inflight, 'doc', factory)
    const second = coalesceInflight(inflight, 'doc', factory)
    expect(second).toBe(first)
    expect(await Promise.all([first, second])).toEqual([7, 7])
    expect(factory).toHaveBeenCalledTimes(1)
    expect(inflight.size).toBe(0)
  })

  it('starts a new load after the previous one settles', async () => {
    const inflight = new Map<string, Promise<number>>()
    let value = 1
    const factory = vi.fn(async () => value)

    expect(await coalesceInflight(inflight, 'doc', factory)).toBe(1)
    value = 2
    expect(await coalesceInflight(inflight, 'doc', factory)).toBe(2)
    expect(factory).toHaveBeenCalledTimes(2)
  })
})

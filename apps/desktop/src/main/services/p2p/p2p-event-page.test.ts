import { describe, expect, it } from 'vitest'
import { collectPagesBySeq } from './p2p-event-page'

describe('collectPagesBySeq', () => {
  it('walks every page instead of stopping at the first limit', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ seq: index + 1 }))
    const events = collectPagesBySeq((sinceSeq, limit) => {
      return rows.filter((row) => row.seq > sinceSeq).slice(0, limit)
    }, 2)
    expect(events.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5])
  })

  it('stops when a page does not advance seq', () => {
    const events = collectPagesBySeq(() => [{ seq: 1 }, { seq: 1 }], 2)
    expect(events).toEqual([{ seq: 1 }, { seq: 1 }])
  })
})

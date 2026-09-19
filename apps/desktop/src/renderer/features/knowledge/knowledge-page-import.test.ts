import { describe, expect, it } from 'vitest'
import { formatReindexResultError } from './knowledge-page-import'

describe('formatReindexResultError', () => {
  it('reports when every document was skipped because the file did not change', () => {
    expect(
      formatReindexResultError({
        ingested: 0,
        skipped: 1,
        failed: [],
      }),
    ).toContain('跳过')
  })

  it('is silent when a rebuild was queued with no failures', () => {
    expect(
      formatReindexResultError({
        ingested: 0,
        skipped: 0,
        failed: [],
      }),
    ).toBeNull()
  })
})

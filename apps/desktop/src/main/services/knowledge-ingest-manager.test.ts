import { describe, expect, it } from 'vitest'

import {
  isIngestInFlight,
  markIngestActive,
  markIngestInactive,
  requestCancelIngest,
  getIngestOcrAbortSignal,
} from './knowledge-ingest-manager.service'

describe('knowledge-ingest-manager', () => {
  it('tracks nested ingest activity with a refcount', () => {
    markIngestActive('doc-nested')
    markIngestActive('doc-nested')
    expect(isIngestInFlight('doc-nested')).toBe(true)

    markIngestInactive('doc-nested')
    expect(isIngestInFlight('doc-nested')).toBe(true)

    markIngestInactive('doc-nested')
    expect(isIngestInFlight('doc-nested')).toBe(false)
  })

  it('aborts in-flight OCR when ingest is cancelled', () => {
    markIngestActive('doc-ocr-cancel')
    const signal = getIngestOcrAbortSignal('doc-ocr-cancel')
    expect(signal?.aborted).toBe(false)
    requestCancelIngest('doc-ocr-cancel')
    expect(signal?.aborted).toBe(true)
    markIngestInactive('doc-ocr-cancel')
  })
})

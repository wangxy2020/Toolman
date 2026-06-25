import { describe, expect, it } from 'vitest'
import {
  clampDocumentToolBatchStats,
  countExcelToolApplyResult,
  extractJsonObjectFromToolResult,
  isDocumentToolHardFailure,
  parseDocumentReviewSeverity,
} from './document-review.util'

describe('document-review.util', () => {
  it('parses severity with fallback', () => {
    expect(parseDocumentReviewSeverity('high')).toBe('high')
    expect(parseDocumentReviewSeverity('invalid')).toBe('medium')
  })

  it('detects hard tool failures', () => {
    expect(isDocumentToolHardFailure('Error: boom')).toBe(true)
    expect(isDocumentToolHardFailure('{"updatedCount":1}')).toBe(false)
  })

  it('clamps batch stats', () => {
    expect(clampDocumentToolBatchStats(5, 9, 1)).toEqual({ applied: 5, failed: 1 })
  })

  it('counts excel modify results from json', () => {
    const result = JSON.stringify({
      updatedCount: 2,
      applied: [{ status: 'skipped' }],
    })
    expect(countExcelToolApplyResult(result, 'modify')).toEqual({ applied: 2, failed: 1 })
  })

  it('extracts json objects from tool results', () => {
    expect(extractJsonObjectFromToolResult('prefix {"ok":true} suffix')).toEqual({ ok: true })
    expect(extractJsonObjectFromToolResult('no json here')).toBeNull()
  })
})

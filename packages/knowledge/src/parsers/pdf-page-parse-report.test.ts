import { describe, expect, it } from 'vitest'
import {
  createPdfPageParseTracker,
  formatPdfParseWarning,
  toPdfParseReportMetadata,
} from './pdf-page-parse-report.js'

const PROSE = '小说写作首先要建立场景。读者必须看见人物正在做什么，而不是听作者转述已经发生的事。'

describe('pdf page parse report', () => {
  it('keeps native-only pages out of OCR and flags leftover failures', () => {
    const tracker = createPdfPageParseTracker(3)
    tracker.recordNative(1, PROSE, 10)
    tracker.recordNative(2, 'ISBN 978-7-300-13030-9', 10)
    tracker.recordNative(3, '', 10)
    tracker.recordHybrid(2, PROSE, 40)
    tracker.recordHybrid(3, 'Immediate Fiction', 40)
    tracker.recordGlmOcr(3, '', 80)

    const kept = new Map([
      [1, { text: PROSE }],
      [2, { text: PROSE }],
    ])
    const report = tracker.finalize(kept)

    expect(report.nativePages).toBe(1)
    expect(report.hybridPages).toBe(1)
    expect(report.glmOcrPages).toBe(0)
    expect(report.failedPages).toEqual([3])
    expect(report.partial).toBe(true)
    expect(report.duplicateOcrPages).toBe(0)
    expect(report.pages[0]).toMatchObject({
      pageNumber: 1,
      ocrUsed: false,
      ocrEngine: null,
      nativeTextQuality: 'ok',
      parseStatus: 'ok',
    })
    expect(report.pages[1]).toMatchObject({
      pageNumber: 2,
      ocrUsed: true,
      ocrEngine: 'hybrid',
      nativeTextQuality: 'digit-noise',
      parseStatus: 'ok',
    })
    expect(report.warning).toContain('2/3')
    expect(toPdfParseReportMetadata(report).failed_pages).toEqual([3])
  })

  it('counts glm-ocr after unusable Hybrid and deferred leftover pages', () => {
    const tracker = createPdfPageParseTracker(2)
    tracker.recordNative(1, '', 5)
    tracker.recordNative(2, '', 5)
    tracker.recordHybrid(1, 'ISBN 978-7-300-13030-9', 20)
    tracker.recordGlmOcr(1, PROSE, 90)
    tracker.markSkipped([2])
    const report = tracker.finalize(new Map([[1, { text: PROSE }]]))
    expect(report.glmOcrPages).toBe(1)
    expect(report.skippedPages).toEqual([2])
    expect(report.deferredPages).toEqual([2])
    expect(formatPdfParseWarning(report)).toContain('deferred')
  })

  it('flags duplicate OCR when a usable native page is still sent to OCR', () => {
    const tracker = createPdfPageParseTracker(1)
    tracker.recordNative(1, PROSE, 5)
    tracker.recordHybrid(1, PROSE, 20)
    const report = tracker.finalize(new Map([[1, { text: PROSE }]]))
    expect(report.duplicateOcrPages).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildMockOcrCollapsePageText,
  computeUniqueCharRatio,
  detectOdlPageAnomaly,
  findMaxConsecutiveDuplicateRun,
  interceptOdlPageAnomaly,
  interceptOdlDocumentPages,
  salvageOdlPageText,
  stripConsecutiveDuplicateNoise,
} from './odl-anomaly-interceptor.js'

describe('odl-anomaly-interceptor', () => {
  describe('image_1dc076.jpg mock — OCR collapse with repeated "27"', () => {
    const mockPage = buildMockOcrCollapsePageText()

    it('detects consecutive duplicate short-line collapse', () => {
      const detection = detectOdlPageAnomaly(mockPage)
      expect(detection.isAnomaly).toBe(true)
      expect(detection.reasons).toContain('consecutive_duplicate_short_lines')
      expect(detection.maxConsecutiveDuplicateRun).toBeGreaterThanOrEqual(15)
    })

    it('detects low unique-char ratio on pure collapsed pages', () => {
      const pureNoise = Array.from({ length: 100 }, () => '27').join('\n')
      expect(computeUniqueCharRatio(pureNoise)).toBeLessThan(0.05)
      const detection = detectOdlPageAnomaly(pureNoise)
      expect(detection.reasons).toContain('low_unique_char_ratio')
    })

    it('salvages valid header lines and strips noise block', () => {
      const salvaged = salvageOdlPageText(mockPage)
      expect(salvaged).toBe('Click Download to see negotiation minutes.\nSAR')
      expect(salvaged).not.toMatch(/^27$/m)
    })

    it('intercepts without marking as blank when valid text remains', () => {
      const result = interceptOdlPageAnomaly(mockPage)
      expect(result.detection.isAnomaly).toBe(true)
      expect(result.shouldRetryParse).toBe(true)
      expect(result.isBlankOrNoise).toBe(false)
    expect(result.cleanedText).toBe('Click Download to see negotiation minutes.\nSAR')
    })
  })

  it('findMaxConsecutiveDuplicateRun counts identical adjacent lines', () => {
    const lines = ['a', 'a', 'a', 'b', 'b']
    expect(findMaxConsecutiveDuplicateRun(lines)).toBe(3)
  })

  it('stripConsecutiveDuplicateNoise keeps short runs below threshold', () => {
    const text = Array.from({ length: 10 }, () => '27').join('\n')
    expect(stripConsecutiveDuplicateNoise(text)).toBe(text)
  })

  it('stripConsecutiveDuplicateNoise ignores blank lines between duplicates', () => {
    const text = Array.from({ length: 40 }, () => '27').join('\n\n')
    expect(stripConsecutiveDuplicateNoise(text)).toBe('')
  })

  it('flags pure noise pages as is_blank_or_noise', () => {
    const pureNoise = Array.from({ length: 20 }, () => '27').join('\n\n')
    const result = interceptOdlPageAnomaly(pureNoise)
    expect(result.isBlankOrNoise).toBe(true)
    expect(result.cleanedText).toBe('')
  })

  it('passes through healthy pages unchanged', () => {
    const healthy = '# CONTRACT FOR Hamlet Electrification Project\n\nSection 1. Scope of work.'
    const result = interceptOdlPageAnomaly(healthy)
    expect(result.detection.isAnomaly).toBe(false)
    expect(result.isBlankOrNoise).toBe(false)
    expect(result.shouldRetryParse).toBe(false)
    expect(result.cleanedText).toContain('CONTRACT FOR Hamlet')
  })

  it('interceptOdlDocumentPages annotates anomalous page metadata', () => {
    const { pages, anomalousPageNumbers, shouldRetryPageNumbers } = interceptOdlDocumentPages([
      { pageNumber: 7, text: 'Normal page content with enough unique characters to pass.' },
      { pageNumber: 8, text: buildMockOcrCollapsePageText() },
    ])

    expect(anomalousPageNumbers).toEqual([8])
    expect(shouldRetryPageNumbers).toEqual([8])
    expect(pages[1]?.isBlankOrNoise).toBe(false)
    expect(pages[1]?.anomalyReasons).toContain('consecutive_duplicate_short_lines')
    expect(pages[1]?.text).not.toMatch(/^27$/m)
  })
})

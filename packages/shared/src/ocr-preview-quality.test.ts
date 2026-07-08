import { describe, expect, it } from 'vitest'
import {
  detectOcrCollapsedContent,
  isUsableOdlPreviewContent,
  stripOcrCollapsedContent,
} from './ocr-preview-quality.js'

describe('ocr-preview-quality', () => {
  it('detects blank-line separated duplicate runs', () => {
    const text = Array.from({ length: 40 }, () => '27').join('\n\n')
    expect(detectOcrCollapsedContent(text).isCollapsed).toBe(true)
    expect(stripOcrCollapsedContent(text)).toBe('')
  })

  it('salvages meaningful lines mixed with collapsed numeric noise', () => {
    const text = [
      'Click Download to see negotiation minutes.',
      'SAR',
      ...Array.from({ length: 40 }, () => '27'),
    ].join('\n\n')
    expect(stripOcrCollapsedContent(text)).toBe(
      'Click Download to see negotiation minutes.\nSAR',
    )
  })

  it('marks collapsed preview as unusable', () => {
    const spam = Array.from({ length: 40 }, () => '27').join('\n')
    expect(isUsableOdlPreviewContent(spam)).toBe(false)
  })

  it('accepts healthy preview content', () => {
    expect(isUsableOdlPreviewContent('# CONTRACT FOR Hamlet Electrification Project')).toBe(true)
  })
})

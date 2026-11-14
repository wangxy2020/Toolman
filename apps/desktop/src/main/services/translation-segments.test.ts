import { describe, expect, it } from 'vitest'
import {
  MAX_SEGMENT_CHARS,
  splitOversizedTableUnit,
  splitTranslationSegments,
} from './translation-segments'

describe('splitTranslationSegments', () => {
  it('returns empty for blank input', () => {
    expect(splitTranslationSegments('   \n\n  ')).toEqual([])
  })

  it('keeps a short single paragraph intact', () => {
    expect(splitTranslationSegments('Hello world.')).toEqual(['Hello world.'])
  })

  it('keeps short word lists in one request', () => {
    const source = [
      'mutual',
      'commitment',
      'regulatory',
      'statutory',
      'alter',
      'contractual',
      'institutions',
      'sovereign',
      'directive',
      'mandate',
    ].join('\n')
    expect(splitTranslationSegments(source)).toEqual([source])
  })

  it('keeps short multi-paragraph text in one request', () => {
    const source = ['First paragraph.', '', 'Second paragraph.', '', 'Third paragraph.'].join('\n')
    expect(splitTranslationSegments(source)).toEqual([
      'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
    ])
  })

  it('batches long blank-line paragraphs into size-limited segments', () => {
    const block = 'A'.repeat(800)
    const source = [block, '', block, '', block].join('\n')
    const segments = splitTranslationSegments(source)
    expect(segments.length).toBeGreaterThan(1)
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(MAX_SEGMENT_CHARS)
    }
    expect(segments.join('\n\n').replace(/\n\n/g, '\n\n')).toContain(block)
  })

  it('splits an oversized paragraph by sentences', () => {
    const sentence = 'This is a sentence that helps fill the segment budget.'
    const paragraph = Array.from({ length: 40 }, () => sentence).join(' ')
    const segments = splitTranslationSegments(paragraph)
    expect(segments.length).toBeGreaterThan(1)
    expect(segments.join(' ')).toBe(paragraph)
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(MAX_SEGMENT_CHARS)
    }
  })

  it('bisects a huge HTML table by row groups', () => {
    const rows = Array.from({ length: 80 }, (_, index) => {
      const cell = `Cell-${index}-${'x'.repeat(40)}`
      return `<tr><td>${cell}</td><td>${cell}</td></tr>`
    }).join('')
    const table = `<table><tr><th>A</th><th>B</th></tr>${rows}</table>`
    const parts = splitOversizedTableUnit(table)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part).toContain('<table')
      expect(part).toContain('</table>')
      expect(part).toContain('<th>A</th>')
    }
  })

  it('keeps an HTML table as one segment even when the page is long', () => {
    const prose = `${'A'.repeat(1200)}\n\n${'B'.repeat(1200)}`
    const table =
      '<table><tr><th>Item</th><th>Value</th></tr><tr><td>Fee</td><td>100</td></tr></table>'
    const source = `${prose}\n\n${table}`
    const segments = splitTranslationSegments(source)
    expect(segments.some((segment) => segment.includes('<table') && segment.includes('</table>'))).toBe(
      true,
    )
    const tableSegment = segments.find((segment) => segment.includes('<table'))
    expect(tableSegment).toContain('<th>Item</th>')
    expect(tableSegment).not.toContain('A'.repeat(100))
  })

  it('preserves leading prose and does not repeat the table', () => {
    const prose = `${'A'.repeat(1200)}\n\n${'B'.repeat(1200)}`
    const table =
      '<table><tr><th>Item</th><th>Value</th></tr><tr><td>Fee</td><td>100</td></tr></table>'
    const source = `${prose}\n\n${table}`
    const segments = splitTranslationSegments(source)
    const joined = segments.join('\n\n')
    expect(joined).toContain('A'.repeat(100))
    expect(joined).toContain('B'.repeat(100))
    expect(segments.filter((segment) => segment.includes('<table')).length).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { splitTranslationSegments } from './translation-segments'

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
      expect(segment.length).toBeLessThanOrEqual(2000)
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
      expect(segment.length).toBeLessThanOrEqual(2000)
    }
  })
})

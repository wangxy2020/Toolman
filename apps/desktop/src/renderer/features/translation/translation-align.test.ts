import { describe, expect, it } from 'vitest'
import { shouldAlignTargetParagraphHeights } from './translation-align'

describe('shouldAlignTargetParagraphHeights', () => {
  it('aligns only when both sides have the same number of content paragraphs', () => {
    expect(shouldAlignTargetParagraphHeights(8, 8)).toBe(true)
    expect(shouldAlignTargetParagraphHeights(1, 8)).toBe(false)
    expect(shouldAlignTargetParagraphHeights(8, 1)).toBe(false)
    expect(shouldAlignTargetParagraphHeights(0, 0)).toBe(false)
  })
})

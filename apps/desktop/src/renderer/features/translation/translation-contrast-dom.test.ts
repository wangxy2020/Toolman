import { describe, expect, it } from 'vitest'
import {
  TRANSLATION_LINE_LABEL_STEP,
  countContrastHardLines,
  formatContrastLineLabel,
} from './translation-contrast-dom'

describe('countContrastHardLines', () => {
  it('counts an empty block as one line', () => {
    expect(countContrastHardLines('')).toBe(1)
    expect(countContrastHardLines('   ')).toBe(1)
    expect(countContrastHardLines('\u00a0')).toBe(1)
  })

  it('counts hard newlines inside a paragraph', () => {
    expect(countContrastHardLines('a')).toBe(1)
    expect(countContrastHardLines('a\nb')).toBe(2)
    expect(countContrastHardLines('a\nb\nc')).toBe(3)
  })

  it('ignores a single trailing newline', () => {
    expect(countContrastHardLines('a\n')).toBe(1)
    expect(countContrastHardLines('a\nb\n')).toBe(2)
  })
})

describe('formatContrastLineLabel', () => {
  it('labels every Nth line, not arbitrary paragraph indexes', () => {
    expect(formatContrastLineLabel(1)).toBeNull()
    expect(formatContrastLineLabel(TRANSLATION_LINE_LABEL_STEP)).toBe('5')
    expect(formatContrastLineLabel(10)).toBe('10')
    expect(formatContrastLineLabel(7)).toBeNull()
  })
})

describe('line label progression across blocks', () => {
  it('advances by hard lines so labels mark rows not paragraphs', () => {
    const blocks = ['line1', 'line2\nline3\nline4', 'line5', 'line6']
    let lineNumber = 1
    const labeled: Array<{ start: number; label: string | null }> = []
    for (const text of blocks) {
      labeled.push({ start: lineNumber, label: formatContrastLineLabel(lineNumber) })
      lineNumber += countContrastHardLines(text)
    }

    expect(labeled.map((item) => item.start)).toEqual([1, 2, 5, 6])
    expect(labeled.map((item) => item.label)).toEqual([null, null, '5', null])
    expect(lineNumber).toBe(7)
  })
})

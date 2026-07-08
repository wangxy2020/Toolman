import { describe, expect, it } from 'vitest'
import { splitTranslationDisplayParagraphs } from './translation-paragraphs'

describe('splitTranslationDisplayParagraphs', () => {
  it('collapses triple newlines and drops empty blocks', () => {
    expect(splitTranslationDisplayParagraphs('A\n\n\n\nB')).toEqual(['A', 'B'])
  })

  it('keeps single-newline lists in one paragraph', () => {
    expect(splitTranslationDisplayParagraphs('标题\na) 第一条\nb) 第二条')).toEqual([
      '标题\na) 第一条\nb) 第二条',
    ])
  })

  it('splits on blank lines for section breaks', () => {
    expect(splitTranslationDisplayParagraphs('合同形式\n\n正文段落')).toEqual([
      '合同形式',
      '正文段落',
    ])
  })
})

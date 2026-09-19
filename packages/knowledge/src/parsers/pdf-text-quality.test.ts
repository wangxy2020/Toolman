import { describe, expect, it } from 'vitest'
import { isGappyCjkExtractedText, isPdfExtractedTextInsufficient } from './pdf-text-quality.js'

const GAPPY_SCAN_PAGE = [
  '【第 31 页】',
  '## 第2    析中的 本因素 的因素   的因素',
  '在   中  们 据   析家 希望达到的目的   了  概念和  料',
  '四个 本因素    析的目的就是回答 或  回答  非常  的',
  '人的因素 或多或少 人的因素总要参 到 中  中  要  的方',
  '统 言  的因素的 析要  的因素容  多  的因素数  限',
  '内在稳定 是 要的 的因素  析家  的因素就是内在 稳定',
  '投 资  的  本  因 素  和  的  因 素  大 类',
].join('\n')

const NORMAL_CHINESE = [
  '证券分析的范围和局限并不在于预测市场的短期波动，而在于衡量证券的内在价值，',
  '并据此判断当前价格是否提供了足够的安全边际。第二章讨论分析中必须考虑的基本因素，',
  '包括行业前景、企业管理以及资本结构。这些因素既有定量的财务报表，也有定性的判断。',
  '分析家应当把未来趋势看作一种自然的结论来源，而不是用训练数据里的目录代替原文。',
].join('')

describe('pdf-text-quality', () => {
  it('treats spaced-out CJK scan layers as gappy and insufficient', () => {
    expect(isGappyCjkExtractedText(GAPPY_SCAN_PAGE)).toBe(true)
    expect(isPdfExtractedTextInsufficient(GAPPY_SCAN_PAGE, 1)).toBe(true)
  })

  it('does not flag normal Chinese prose as gappy', () => {
    expect(isGappyCjkExtractedText(NORMAL_CHINESE)).toBe(false)
    expect(isPdfExtractedTextInsufficient(NORMAL_CHINESE, 1)).toBe(false)
  })

  it('ignores English-majority pages that only have leftover CJK glyphs', () => {
    const englishCourse = [
      'Immediate Fiction A Complete Writing Course (Jerry Cleaver)',
      'Chapter Five: Immediate Scene',
      'The reader must see the action as it happens.',
      '析 的 围',
    ].join('\n')
    expect(isGappyCjkExtractedText(englishCourse)).toBe(false)
  })
})

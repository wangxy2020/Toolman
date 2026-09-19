import { describe, expect, it } from 'vitest'
import {
  isOdlIngestResultInsufficient,
  hybridIngestHasPageText,
  hybridResultHasUsablePage,
  hybridShouldAbortRemainingBatches,
  resolveIngestGlmOcrMaxPages,
} from './document-parser-ingest'

const GAPPY_BODY = [
  '【第 31 页】',
  '## 第2    析中的 本因素 的因素   的因素',
  '在   中  们 据   析家 希望达到的目的   了  概念和  料',
  '四个 本因素    析的目的就是回答 或  回答  非常  的',
  '人的因素 或多或少 人的因素总要参 到 中  中  要  的方',
  '统 言  的因素的 析要  的因素容  多  的因素数  限',
  '内在稳定 是 要的 的因素  析家  的因素就是内在 稳定',
  '投 资  的  本  因 素  和  的  因 素  大 类',
].join('\n')

const ISBN_DEBRIS = {
  backend: 'opendataloader' as const,
  totalPages: 16,
  plainText: 'ISBN 978-7-300-13030-9 Immediate Fiction',
  markdown: '',
  pages: [{ pageNumber: 1, text: 'ISBN 978-7-300-13030-9 Immediate Fiction', markdown: '' }],
}

describe('isOdlIngestResultInsufficient', () => {
  it('rejects a gappy CJK scan even when some pages have extractable text', () => {
    expect(
      isOdlIngestResultInsufficient({
        backend: 'opendataloader',
        totalPages: 1,
        plainText: GAPPY_BODY,
        markdown: GAPPY_BODY,
        pages: [
          { pageNumber: 1, text: 'ISBN 978-7-300-13030-9 Immediate Fiction', markdown: '' },
          { pageNumber: 31, text: GAPPY_BODY, markdown: GAPPY_BODY },
        ],
      }),
    ).toBe(true)
  })

  it('does not treat sparse Hybrid debris as a finished book', () => {
    const hybrid = {
      backend: 'opendataloader' as const,
      totalPages: 289,
      plainText: '【第 1 页】\nImmediate Fiction',
      markdown: '',
      pages: [{ pageNumber: 1, text: 'Immediate Fiction', markdown: '' }],
    }
    expect(isOdlIngestResultInsufficient(hybrid)).toBe(true)
    expect(hybridIngestHasPageText(hybrid)).toBe(true)
    expect(hybridResultHasUsablePage(hybrid)).toBe(false)
    expect(hybridResultHasUsablePage(ISBN_DEBRIS)).toBe(false)
    expect(
      hybridIngestHasPageText({
        backend: 'opendataloader',
        totalPages: 1,
        plainText: '',
        markdown: '',
        pages: [],
      }),
    ).toBe(false)
  })

  it('accepts Hybrid batches only when a page passes the quality gate', () => {
    const prose =
      '小说写作首先要建立场景。读者必须看见人物正在做什么，而不是听作者转述已经发生的事。'
    expect(
      hybridResultHasUsablePage({
        backend: 'opendataloader',
        totalPages: 1,
        plainText: prose,
        markdown: prose,
        pages: [{ pageNumber: 1, text: prose, markdown: prose }],
      }),
    ).toBe(true)
    const rapid =
      '证 券 分 析 的 范 围 和 局 限 并 不 在 于 预 测 市 场 的 短 期 波 动 ， 而 在 于 衡 量 证 券 的 内 在 价 值 。'
    expect(
      hybridResultHasUsablePage({
        backend: 'opendataloader',
        totalPages: 1,
        plainText: rapid,
        markdown: rapid,
        pages: [{ pageNumber: 1, text: rapid, markdown: rapid }],
      }),
    ).toBe(true)
    const gbk =
      '䆕券ߚ析的范围ߛ局限并不在于预测市场的短期波动Внтр价值 թե չէ կապիտալߜߝߞߟⲀⲁ。'
    expect(
      hybridResultHasUsablePage({
        backend: 'opendataloader',
        totalPages: 1,
        plainText: gbk,
        markdown: prose,
        pages: [{ pageNumber: 31, text: gbk, markdown: prose }],
      }),
    ).toBe(true)
    expect(
      hybridResultHasUsablePage({
        backend: 'opendataloader',
        totalPages: 1,
        plainText: gbk,
        markdown: gbk,
        pages: [{ pageNumber: 31, text: gbk, markdown: gbk }],
      }),
    ).toBe(false)
  })

  it('accepts normal Chinese prose', () => {
    const body = [
      '证券分析的范围和局限并不在于预测市场的短期波动，而在于衡量证券的内在价值，',
      '并据此判断当前价格是否提供了足够的安全边际。第二章讨论分析中必须考虑的基本因素，',
      '包括行业前景、企业管理以及资本结构。这些因素既有定量的财务报表，也有定性的判断。',
      '分析家应当把未来趋势看作一种自然的结论来源，而不是用训练数据里的目录代替原文。',
    ].join('')
    expect(
      isOdlIngestResultInsufficient({
        backend: 'opendataloader',
        totalPages: 1,
        plainText: body,
        markdown: body,
        pages: [{ pageNumber: 1, text: body, markdown: body }],
      }),
    ).toBe(false)
  })
})

describe('hybridShouldAbortRemainingBatches', () => {
  it('stops Hybrid after two empty batches so glm-ocr can start', () => {
    expect(hybridShouldAbortRemainingBatches(1)).toBe(false)
    expect(hybridShouldAbortRemainingBatches(2)).toBe(true)
    expect(hybridShouldAbortRemainingBatches(3)).toBe(true)
  })
})

describe('resolveIngestGlmOcrMaxPages', () => {
  it('OCRs every leftover page instead of stopping at 200', () => {
    expect(resolveIngestGlmOcrMaxPages(89)).toBe(89)
    expect(resolveIngestGlmOcrMaxPages(391)).toBe(391)
    expect(resolveIngestGlmOcrMaxPages(591)).toBe(591)
    expect(resolveIngestGlmOcrMaxPages(0)).toBe(0)
  })
})

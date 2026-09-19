import { describe, expect, it } from 'vitest'
import {
  assessPdfPageTextQuality,
  collectPagesFromChannels,
  extractMarkdownHeading,
  finalizeGlmOcrText,
  formatIngestPdfPage,
  groupPageNumbersIntoRanges,
  isMojibakeCjkText,
  isMostlyBlankOcrInk,
  isPdfPageTextUsable,
  pageHasTable,
  pickIngestPageBody,
  listPagesNeedingOcr,
  collapseRepeatedOcrText,
  collapseSpacedCjkOcrText,
  shouldRetryGlmOcrPage,
  shouldSendPageToGlmOcr,
  shouldSkipGlmOcrForBlankPage,
} from './pdf-page-quality.js'

const PROSE =
  '证券分析的范围和局限并不在于预测市场的短期波动，而在于衡量证券的内在价值，并据此判断当前价格是否提供了足够的安全边际。'
const GBK_SOUP = [
  '䆕券ߚ析的范围ߛ局限并不在于预测市场的短期波动',
  'Внтр价值与安全边际 թե չէ կապիտալ կառուցվածք',
  '分析家应当衡量内在价值而非短期波动ߜߝߞߟⲀⲁ。',
].join('')

describe('assessPdfPageTextQuality', () => {
  it('rejects empty, ISBN debris, and gappy CJK', () => {
    expect(assessPdfPageTextQuality('').reason).toBe('empty')
    expect(isPdfPageTextUsable('ISBN 978-7-300-13030-9')).toBe(false)
    expect(isPdfPageTextUsable('Immediate Fiction')).toBe(false)
    expect(isPdfPageTextUsable('CHAPTER TWO')).toBe(false)
    expect(isPdfPageTextUsable('— 23 —')).toBe(false)
    expect(isPdfPageTextUsable('ISBN 978-7-300-13030-9 Immediate Fiction')).toBe(false)
    expect(
      isPdfPageTextUsable(
        [
          '## 第2    析中的 本因素 的因素   的因素',
          '在   中  们 据   析家 希望达到的目的   了  概念和  料',
          '四个 本因素    析的目的就是回答 或  回答  非常  的',
          '人的因素 或多或少 人的因素总要参 到 中  中  要  的方',
          '统 言  的因素的 析要  的因素容  多  的因素数  限',
        ].join('\n'),
      ),
    ).toBe(false)
  })

  it('accepts normal Chinese prose and keeps markdown tables', () => {
    const prose =
      '小说写作首先要建立场景。读者必须看见人物正在做什么，而不是听作者转述已经发生的事。'
    expect(isPdfPageTextUsable(prose)).toBe(true)
    expect(pageHasTable('<table><tr><td>人物</td><td>动机</td></tr></table>')).toBe(true)
    expect(
      pickIngestPageBody({
        text: 'plain',
        markdown: '<table><tr><td>人物</td></tr></table>',
      }),
    ).toContain('<table')
  })

  it('groups only pages that still need OCR', () => {
    expect(groupPageNumbersIntoRanges([1, 2, 3, 5, 6, 20], 16)).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 6 },
      { start: 20, end: 20 },
    ])
    expect(groupPageNumbersIntoRanges([1, 2, 3, 4, 5], 2)).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
      { start: 5, end: 5 },
    ])
  })

  it('formats page markers and headings for ingest', () => {
    expect(extractMarkdownHeading('# 第五章 场景\n正文')).toBe('第五章 场景')
    expect(formatIngestPdfPage({ pageNumber: 5, totalPages: 10, body: '正文', heading: '第五章' })).toBe(
      '【第 5 页/10】\n## 第五章\n正文',
    )
  })

  it('collects pages from markers without inventing empty slots', () => {
    const pages = collectPagesFromChannels({
      pages: [{ pageNumber: 2, text: '第二页' }],
      plainText: '【第 1 页/2】\n第一页',
      totalPages: 2,
    })
    expect([...pages.keys()].sort()).toEqual([1, 2])
    expect(pages.get(1)?.text).toBe('第一页')
  })

  it('lists only pages that still need OCR', () => {
    const pages = collectPagesFromChannels({
      pages: [
        { pageNumber: 1, text: '小说写作首先要建立场景。读者必须看见人物正在做什么。' },
        { pageNumber: 2, text: 'ISBN 978-7-300-13030-9' },
      ],
      totalPages: 3,
    })
    expect(listPagesNeedingOcr(pages, 3)).toEqual([2, 3])
  })

  it('joins RapidOCR single-space CJK without repairing native multi-space holes', () => {
    const rapid =
      '证 券 分 析 的 范 围 和 局 限 并 不 在 于 预 测 市 场 的 短 期 波 动 ， 而 在 于 衡 量 证 券 的 内 在 价 值 。'
    expect(isPdfPageTextUsable(rapid)).toBe(false)
    expect(isPdfPageTextUsable(collapseSpacedCjkOcrText(rapid))).toBe(true)
    expect(collapseSpacedCjkOcrText(rapid)).toContain('证券分析的范围和局限')
    expect(
      isPdfPageTextUsable(
        collapseSpacedCjkOcrText(
          [
            '## 第2    析中的 本因素 的因素   的因素',
            '在   中  们 据   析家 希望达到的目的   了  概念和  料',
            '四个 本因素    析的目的就是回答 或  回答  非常  的',
          ].join('\n'),
        ),
      ),
    ).toBe(false)
  })

  it('collapses glm-ocr cover-page loops to the first copy', () => {
    const block = [
      '创意写作书系',
      '小说写作教程',
      '杰里·克利弗（Jerry Cleaver）著',
      'IMMEDIATE FICTION: A COMPLETE WRITING COURSE',
    ].join('\n')
    const looped = Array.from({ length: 6 }, () => block).join('\n\n')
    expect(collapseRepeatedOcrText(looped)).toBe(block)
  })

  it('rejects Ghostscript GBK soup and prefers a shorter usable OCR channel', () => {
    expect(isMojibakeCjkText(GBK_SOUP)).toBe(true)
    expect(isMojibakeCjkText(`证券分析${'\u0301'.repeat(8)}内在价值`)).toBe(true)
    expect(isPdfPageTextUsable(GBK_SOUP)).toBe(false)
    expect(assessPdfPageTextQuality(GBK_SOUP).reason).toBe('mojibake')
    expect(
      pickIngestPageBody({
        text: `${GBK_SOUP}${GBK_SOUP}${GBK_SOUP}`,
        markdown: PROSE,
      }),
    ).toBe(PROSE)
    const pages = collectPagesFromChannels({
      pages: [{ pageNumber: 1, text: `${GBK_SOUP}${GBK_SOUP}`, markdown: PROSE }],
      totalPages: 1,
    })
    expect(pickIngestPageBody(pages.get(1)!)).toBe(PROSE)
    expect(listPagesNeedingOcr(pages, 1)).toEqual([])
  })

  it('treats glm page-marker loops as empty and retries only inky pages', () => {
    const looped = Array.from({ length: 40 }, () => '【第 66 页】').join('\n')
    expect(finalizeGlmOcrText(looped)).toBe('')
    expect(shouldSkipGlmOcrForBlankPage(0.002)).toBe(true)
    expect(isMostlyBlankOcrInk(0.007)).toBe(false)
    expect(shouldRetryGlmOcrPage(looped, 0.01)).toBe(true)
    expect(shouldRetryGlmOcrPage(looped, 0.002)).toBe(false)
    expect(shouldSendPageToGlmOcr({ hybridText: GBK_SOUP })).toBe(false)
    expect(shouldSendPageToGlmOcr({ hybridText: '' })).toBe(true)
    expect(shouldSendPageToGlmOcr({ hybridText: PROSE })).toBe(false)
  })
})

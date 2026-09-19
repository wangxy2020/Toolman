import { describe, expect, it } from 'vitest'
import {
  documentTitleMatchesQuery,
  enhanceQueryForKnowledgeSearch,
  extractChapterQueryHint,
  extractDocumentTitleQueryHint,
  chunkTextMatchesChapter,
  normalizeDocumentNameForMatch,
} from './query-hints.js'
import { extractPdfPageQueryHint } from '../parsers/pdf-page-markers.js'

describe('query-hints', () => {
  it('extracts file names from page-specific Chinese queries', () => {
    expect(
      extractDocumentTitleQueryHint(
        '搜索本地知识库中part1－W04Lot7Mwanza Contract文件第6页，总结这一页的内容',
      ),
    ).toBe('part1－W04Lot7Mwanza Contract')
  })

  it('extracts book title and chapter from 第五章 queries without treating them as page 5', () => {
    const query = '小说写作教程中，第五章的标题，并总结一下这一章的内容。'
    expect(extractDocumentTitleQueryHint(query)).toBe('小说写作教程')
    expect(extractChapterQueryHint(query)).toEqual({
      chapterNumber: 5,
      labels: expect.arrayContaining(['第五章', '第5章', 'Chapter 5', 'Chapter Five']),
    })
    expect(extractPdfPageQueryHint(query)).toBeNull()
    const enhanced = enhanceQueryForKnowledgeSearch(query)
    expect(enhanced).toContain('第五章')
    expect(enhanced).toContain('第5章')
    expect(enhanced).toContain('小说写作教程')
    expect(enhanced).not.toContain('【第 5 页】')
  })

  it('matches chapter headings without confusing 第15章 with 第五章', () => {
    const hint = extractChapterQueryHint('请总结第五章')
    expect(hint?.chapterNumber).toBe(5)
    expect(chunkTextMatchesChapter('【第 80 页】\n第五章 情节设计\n开篇要抓住读者', hint!)).toBe(
      true,
    )
    expect(chunkTextMatchesChapter('【第 5 页】\nimmediate fiction', hint!)).toBe(false)
    expect(chunkTextMatchesChapter('第十五章 结尾', hint!)).toBe(false)
    expect(chunkTextMatchesChapter('第15章 结尾', hint!)).toBe(false)
    expect(chunkTextMatchesChapter('第5章 开头', hint!)).toBe(true)
    expect(chunkTextMatchesChapter('Chapter Five: Immediate Scene', hint!)).toBe(true)
  })

  it('does not treat page queries as chapter queries', () => {
    expect(extractChapterQueryHint('小说写作教程.pdf 第5页')).toBeNull()
    expect(extractPdfPageQueryHint('小说写作教程.pdf 第5页')).toBe(5)
  })

  it('matches document titles with different dash and extension forms', () => {
    expect(
      documentTitleMatchesQuery(
        'part1-W04Lot7Mwanza Contract.pdf',
        'part1－W04Lot7Mwanza Contract',
      ),
    ).toBe(true)
    expect(documentTitleMatchesQuery('The-Little-Prince.pdf', 'part1－W04Lot7Mwanza Contract')).toBe(
      false,
    )
  })

  it('enhances search query with page marker and filename tokens', () => {
    const enhanced = enhanceQueryForKnowledgeSearch(
      'part1－W04Lot7Mwanza Contract 第6页',
    )
    expect(enhanced).toContain('【第 6 页】')
    expect(enhanced).toContain('part1')
    expect(normalizeDocumentNameForMatch(enhanced)).toContain('part1')
  })
})

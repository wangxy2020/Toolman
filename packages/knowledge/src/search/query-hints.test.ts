import { describe, expect, it } from 'vitest'
import {
  documentTitleMatchesQuery,
  enhanceQueryForKnowledgeSearch,
  extractDocumentTitleQueryHint,
  normalizeDocumentNameForMatch,
} from './query-hints.js'

describe('query-hints', () => {
  it('extracts file names from page-specific Chinese queries', () => {
    expect(
      extractDocumentTitleQueryHint(
        '搜索本地知识库中part1－W04Lot7Mwanza Contract文件第6页，总结这一页的内容',
      ),
    ).toBe('part1－W04Lot7Mwanza Contract')
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

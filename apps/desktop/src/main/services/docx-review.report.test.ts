import { describe, expect, it } from 'vitest'

import {
  buildDocxFileLinksMarkdown,
  buildDocxReviewSummaryBlock,
  buildLocalDocxMarkdownLink,
  formatDocxReviewReport,
} from './docx-review.service'

describe('buildDocxFileLinksMarkdown', () => {
  it('builds clickable markdown links for working copies', () => {
    const markdown = buildDocxFileLinksMarkdown(['/Users/wangxy/Documents/修订版_notes.docx'])
    expect(markdown).toContain('## 修订版文件（点击打开）')
    expect(markdown).toContain('toolman-local://')
    expect(buildLocalDocxMarkdownLink('/tmp/a.docx')).toContain('[a.docx](toolman-local://')
  })
})

describe('formatDocxReviewReport', () => {
  it('points to summary card instead of inline stats', () => {
    const text = formatDocxReviewReport({
      fileName: 'notes.docx',
      workingPath: '/tmp/修订版_notes.docx',
      issues: [
        {
          id: '1',
          severity: 'high',
          category: 'error',
          action: 'comment',
          anchorText: 'a',
          comment: 'b',
        },
      ],
      parseWarnings: [],
      commentsRequested: 1,
      commentsApplied: 1,
      commentsFailed: 0,
      replacementsRequested: 0,
      replacementsApplied: 0,
      replacementsFailed: 0,
      paragraphEditsRequested: 0,
      paragraphEditsApplied: 0,
      paragraphEditsFailed: 0,
      errors: [],
    })

    expect(text).toContain('notes.docx')
    expect(text).toContain('修订执行统计')
    expect(text).toContain('问题清单')
  })
})

describe('buildDocxReviewSummaryBlock', () => {
  it('builds a docx_review_summary content block', () => {
    const block = buildDocxReviewSummaryBlock({
      fileName: 'notes.docx',
      workingPath: '/tmp/修订版_notes.docx',
      issues: [{ id: '1', severity: 'high', category: 'error', action: 'replace', anchorText: 'a', replacement: 'b' }],
      parseWarnings: ['warn'],
      commentsRequested: 0,
      commentsApplied: 0,
      commentsFailed: 0,
      replacementsRequested: 1,
      replacementsApplied: 1,
      replacementsFailed: 0,
      paragraphEditsRequested: 0,
      paragraphEditsApplied: 0,
      paragraphEditsFailed: 0,
      errors: ['boom'],
    })

    expect(block.type).toBe('docx_review_summary')
    expect(block.issuesFound).toBe(1)
    expect(block.errors).toEqual(['boom'])
    expect(block.parseWarnings).toEqual(['warn'])
  })
})

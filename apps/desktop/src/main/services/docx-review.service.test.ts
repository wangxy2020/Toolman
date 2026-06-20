import { describe, expect, it } from 'vitest'

import {
  buildDocxAuditUserMessage,
  buildDocxFileLinksMarkdown,
  buildLocalDocxMarkdownLink,
  chunkReviewCommentIssues,
  formatDocxReviewReport,
  parseDocxReviewIssues,
  type DocxReviewIssue,
} from './docx-review.service'

describe('parseDocxReviewIssues', () => {
  it('parses a JSON array of issues', () => {
    const raw = JSON.stringify([
      {
        id: '1',
        severity: 'high',
        category: 'error',
        action: 'comment',
        anchor_text: '错别字',
        comment: '应改为正确写法',
      },
      {
        id: '2',
        severity: 'medium',
        category: 'wording',
        action: 'replace',
        anchor_text: '旧词',
        replacement: '新词',
      },
    ])

    const { issues, warnings } = parseDocxReviewIssues(raw)
    expect(warnings).toHaveLength(0)
    expect(issues).toHaveLength(2)
    expect(issues[0]?.action).toBe('comment')
    expect(issues[1]?.replacement).toBe('新词')
  })

  it('extracts JSON from markdown fences', () => {
    const raw = '```json\n[{"id":"1","severity":"low","category":"other","action":"comment","anchor_text":"abc","comment":"note"}]\n```'
    const { issues } = parseDocxReviewIssues(raw)
    expect(issues).toHaveLength(1)
  })

  it('skips invalid items with warnings', () => {
    const raw = JSON.stringify([{ action: 'comment', anchor_text: '' }])
    const { issues, warnings } = parseDocxReviewIssues(raw)
    expect(issues).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('chunkReviewCommentIssues', () => {
  it('splits comment issues into batches', () => {
    const issues: DocxReviewIssue[] = Array.from({ length: 25 }, (_, index) => ({
      id: String(index + 1),
      severity: 'medium',
      category: 'other',
      action: 'comment',
      anchorText: `anchor-${index}`,
      comment: `note-${index}`,
    }))

    const batches = chunkReviewCommentIssues(issues)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(20)
    expect(batches[1]).toHaveLength(5)
  })
})

describe('buildDocxFileLinksMarkdown', () => {
  it('builds clickable markdown links for working copies', () => {
    const markdown = buildDocxFileLinksMarkdown(['/Users/wangxy/Documents/修订版_notes.docx'])
    expect(markdown).toContain('## 修订版文件（点击打开）')
    expect(markdown).toContain('toolman-local://')
    expect(buildLocalDocxMarkdownLink('/tmp/a.docx')).toContain('[a.docx](toolman-local://')
  })
})

describe('formatDocxReviewReport', () => {
  it('includes issue counts and path', () => {
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
      errors: [],
    })

    expect(text).toContain('notes.docx')
    expect(text).toContain('见下方')
    expect(text).toContain('识别问题')
  })
})

describe('buildDocxAuditUserMessage', () => {
  it('includes user request and working path', () => {
    const message = buildDocxAuditUserMessage({
      userRequest: '审查并批注',
      workingPath: '/tmp/修订版_a.docx',
      fileName: 'a.docx',
    })
    expect(message).toContain('审查并批注')
    expect(message).toContain('/tmp/修订版_a.docx')
  })
})

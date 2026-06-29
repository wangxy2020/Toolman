import { describe, expect, it } from 'vitest'

import {
  parseDocxCommentsBatchResult,
  parseDocxEditParagraphsBatchResult,
  parseDocxReplaceTextsBatchResult,
  parseDocxReviewIssues,
  parseDocxSingleReplaceResult,
  chunkReviewCommentIssues,
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
      {
        id: '3',
        severity: 'medium',
        category: 'structure',
        action: 'edit_paragraph',
        anchor_text: '整段原文',
        paragraph_index: 4,
        replacement: '1. 条目一\n2. 条目二',
        comment: '重组为列表',
      },
    ])

    const { issues, warnings } = parseDocxReviewIssues(raw)
    expect(warnings).toHaveLength(0)
    expect(issues).toHaveLength(3)
    expect(issues[0]?.action).toBe('comment')
    expect(issues[1]?.replacement).toBe('新词')
    expect(issues[2]?.paragraphIndex).toBe(4)
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

  it('requires paragraph_index for edit_paragraph', () => {
    const raw = JSON.stringify([
      {
        action: 'edit_paragraph',
        anchor_text: 'abc',
        replacement: 'new text',
      },
    ])
    const { issues } = parseDocxReviewIssues(raw)
    expect(issues).toHaveLength(0)
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

describe('parseDocx tool result helpers', () => {
  it('parses add_comments batch summary text', () => {
    const stats = parseDocxCommentsBatchResult(
      'Batch comments on file.docx: 0 added, 7 failed.\n  [FAIL] "abc": Anchor text not found',
      7,
    )
    expect(stats).toEqual({ applied: 0, failed: 7 })
  })

  it('parses add_comments partial success JSON', () => {
    const stats = parseDocxCommentsBatchResult(
      JSON.stringify({ succeeded: 3, failed: 1 }),
      4,
    )
    expect(stats).toEqual({ applied: 3, failed: 1 })
  })

  it('detects replace_text failure', () => {
    expect(parseDocxSingleReplaceResult('0 replacements made')).toBe(false)
    expect(
      parseDocxSingleReplaceResult(
        'No occurrences of "abc" found in file.docx.',
      ),
    ).toBe(false)
    expect(parseDocxSingleReplaceResult('Made 1 replacement')).toBe(true)
  })

  it('parses replace_texts batch JSON', () => {
    const stats = parseDocxReplaceTextsBatchResult(
      JSON.stringify({ results: [{ success: true }, { success: false }] }),
      2,
    )
    expect(stats.applied).toBe(1)
    expect(stats.failed).toBe(1)
  })

  it('parses edit_paragraphs batch JSON', () => {
    const stats = parseDocxEditParagraphsBatchResult(JSON.stringify({ edited: 2 }), 2)
    expect(stats).toEqual({ applied: 2, failed: 0 })
  })
})

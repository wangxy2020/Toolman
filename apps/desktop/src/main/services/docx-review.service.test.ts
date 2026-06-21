import { describe, expect, it } from 'vitest'

import {
  buildDocxAuditSystemPrompt,
  buildDocxAuditUserMessage,
  buildDocxFileLinksMarkdown,
  buildDocxReviewSummaryBlock,
  buildLocalDocxMarkdownLink,
  buildCommentSearchSeeds,
  buildCommentAnchorCandidates,
  buildCommentAnchorAttemptOrder,
  chunkReviewCommentIssues,
  collectExplanationCommentIssues,
  isCommentAnchorNotFoundFailure,
  parseReadDocumentBlockLine,
  parseFailedBatchCommentAnchors,
  formatDocxReviewReport,
  parseDocxCommentsBatchResult,
  parseDocxEditParagraphsBatchResult,
  parseDocxReviewIssues,
  parseDocxReplaceTextsBatchResult,
  parseDocxSingleReplaceResult,
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

describe('buildCommentAnchorCandidates', () => {
  it('returns progressively shorter unique candidates', () => {
    const anchor = '这是一段很长的合同条款文字，用于测试锚点截断逻辑是否正常工作'
    const candidates = buildCommentAnchorCandidates(anchor)
    expect(candidates[0]).toBe(anchor)
    expect(candidates.length).toBeGreaterThan(1)
    expect(candidates.at(-1)?.length).toBeGreaterThanOrEqual(4)
  })

  it('includes individual lines from multiline anchors', () => {
    const candidates = buildCommentAnchorCandidates('第一段较长文字内容\n第二段也有内容')
    expect(candidates).toContain('第一段较长文字内容')
    expect(candidates).toContain('第二段也有内容')
  })
})

describe('parseFailedBatchCommentAnchors', () => {
  it('extracts failed anchor texts from batch output', () => {
    const result =
      'Batch comments on file.docx: 0 added, 2 failed.\n  [FAIL] "锚点一": Anchor text not found\n  [FAIL] "锚点二": Anchor text not found'
    expect(parseFailedBatchCommentAnchors(result)).toEqual(['锚点一', '锚点二'])
  })
})

describe('buildCommentSearchSeeds', () => {
  it('includes shorter substrings when model anchor is not in document verbatim', () => {
    const seeds = buildCommentSearchSeeds('双方应通过友好协商解决争议')
    expect(seeds).toContain('友好协商')
    expect(seeds).toContain('协商')
    expect(seeds).toContain('争议')
  })
})

describe('buildCommentAnchorAttemptOrder', () => {
  it('prioritizes verified anchors before unverified model truncations', () => {
    const strict = buildCommentAnchorCandidates('甲方应友好协商解决争议')
    const verified = new Set(['发包人应在施工过程中协商解决争议', '协商解决'])
    const order = buildCommentAnchorAttemptOrder({
      anchorText: '甲方应友好协商解决争议',
      strictCandidates: strict,
      verifiedAnchors: verified,
    })

    const verifiedOnlyIndex = order.indexOf('发包人应在施工过程中协商解决争议')
    const unverifiedShortIndex = order.indexOf('甲方')
    expect(verifiedOnlyIndex).toBeGreaterThanOrEqual(0)
    if (unverifiedShortIndex >= 0) {
      expect(verifiedOnlyIndex).toBeLessThan(unverifiedShortIndex)
    }
  })

  it('caps attempt count', () => {
    const strict = buildCommentAnchorCandidates('这是一段很长的合同条款文字，用于测试锚点截断逻辑是否正常工作')
    const order = buildCommentAnchorAttemptOrder({
      anchorText: '这是一段很长的合同条款文字，用于测试锚点截断逻辑是否正常工作',
      strictCandidates: strict,
      verifiedAnchors: new Set(strict),
    })
    expect(order.length).toBeLessThanOrEqual(10)
  })
})

describe('isCommentAnchorNotFoundFailure', () => {
  it('detects ANCHOR_NOT_FOUND errors from docx mcp', () => {
    expect(
      isCommentAnchorNotFoundFailure(
        'Error: [ANCHOR_NOT_FOUND] Could not find anchor text "abc"',
      ),
    ).toBe(true)
    expect(isCommentAnchorNotFoundFailure('Comment added successfully')).toBe(false)
  })
})

describe('parseReadDocumentBlockLine', () => {
  it('parses block index and text from read_document lines', () => {
    expect(parseReadDocumentBlockLine('[12] (H2) 合同解除')).toEqual({
      blockIndex: 12,
      text: '合同解除',
    })
    expect(parseReadDocumentBlockLine('[3] 甲方应向乙方提供材料')).toEqual({
      blockIndex: 3,
      text: '甲方应向乙方提供材料',
    })
  })
})

describe('collectExplanationCommentIssues', () => {
  it('keeps original anchor text for pre-replace explanation comments', () => {
    const issues = collectExplanationCommentIssues([
      {
        id: '1',
        severity: 'medium',
        category: 'wording',
        action: 'replace',
        anchorText: '不影响',
        replacement: '原则上不影响',
        comment: '措辞建议',
      },
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.action).toBe('comment')
    expect(issues[0]?.anchorText).toBe('不影响')
    expect(issues[0]?.comment).toBe('措辞建议')
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

  it('discourages edit_paragraph when user did not request paragraph rewrite', () => {
    const message = buildDocxAuditUserMessage({
      userRequest: '审查并修正错别字',
      workingPath: '/tmp/修订版_a.docx',
      fileName: 'a.docx',
    })
    expect(message).toContain('不要使用 edit_paragraph')
  })

  it('allows edit_paragraph hint when user requests paragraph rewrite', () => {
    const message = buildDocxAuditUserMessage({
      userRequest: '将引言段整段重写为列表',
      workingPath: '/tmp/修订版_a.docx',
      fileName: 'a.docx',
    })
    expect(message).toContain('才使用 edit_paragraph')
    expect(message).not.toContain('不要使用 edit_paragraph')
  })
})

describe('buildDocxAuditSystemPrompt', () => {
  it('disables edit_paragraph by default', () => {
    const prompt = buildDocxAuditSystemPrompt({ userRequest: '全面审查文档' })
    expect(prompt).toContain('edit_paragraph（默认禁用）')
  })

  it('allows cautious edit_paragraph when user requests rewrite', () => {
    const prompt = buildDocxAuditSystemPrompt({ userRequest: '第二段整段替换为条目' })
    expect(prompt).toContain('edit_paragraph（谨慎使用）')
    expect(prompt).not.toContain('默认禁用')
  })
})

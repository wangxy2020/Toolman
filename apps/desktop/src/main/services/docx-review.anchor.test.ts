import { describe, expect, it } from 'vitest'

import {
  buildCommentAnchorAttemptOrder,
  buildCommentAnchorCandidates,
  buildCommentSearchSeeds,
  collectExplanationCommentIssues,
  isCommentAnchorNotFoundFailure,
  parseFailedBatchCommentAnchors,
  parseReadDocumentBlockLine,
} from './docx-review.service'

describe('buildCommentAnchorCandidates', () => {
  it('returns progressively shorter unique candidates', () => {
    const anchor = '这是一段较长的示例段落文字，用于测试锚点截断逻辑是否正常工作'
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
    const strict = buildCommentAnchorCandidates('请通过友好协商解决相关问题')
    const verified = new Set(['双方应通过友好协商解决相关问题', '友好协商'])
    const order = buildCommentAnchorAttemptOrder({
      anchorText: '请通过友好协商解决相关问题',
      strictCandidates: strict,
      verifiedAnchors: verified,
    })

    const verifiedOnlyIndex = order.indexOf('双方应通过友好协商解决相关问题')
    expect(verifiedOnlyIndex).toBeGreaterThanOrEqual(0)
  })

  it('caps attempt count', () => {
    const strict = buildCommentAnchorCandidates('这是一段较长的示例段落文字，用于测试锚点截断逻辑是否正常工作')
    const order = buildCommentAnchorAttemptOrder({
      anchorText: '这是一段较长的示例段落文字，用于测试锚点截断逻辑是否正常工作',
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
    expect(parseReadDocumentBlockLine('[12] (H2) 第三章 概述')).toEqual({
      blockIndex: 12,
      text: '第三章 概述',
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

import { extractLlmJsonArray } from '@toolman/shared'

import {
  clampDocumentToolBatchStats,
  parseDocumentReviewSeverity,
} from './document-review.util'
import {
  ADD_COMMENTS_BATCH_SIZE,
  isDocxToolHardFailure,
  VALID_ACTIONS,
  VALID_CATEGORIES,
  type DocxReviewIssue,
  type DocxReviewIssueAction,
  type DocxReviewIssueCategory,
  type DocxToolBatchStats,
} from './docx-review-types'
import { normalizeAnchorText } from './docx-review-anchors'

function parseParagraphIndex(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
  const text = String(raw ?? '').trim()
  if (!text) return undefined
  const parsed = Number.parseInt(text, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function normalizeIssue(raw: unknown, index: number): DocxReviewIssue | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const action = String(item.action ?? 'comment').toLowerCase() as DocxReviewIssueAction
  if (!VALID_ACTIONS.has(action)) return null

  const anchorText = String(item.anchor_text ?? item.anchorText ?? '').trim()
  if (!anchorText) return null

  const severity = parseDocumentReviewSeverity(item.severity)
  const category = String(item.category ?? 'other').toLowerCase() as DocxReviewIssueCategory
  const comment = String(item.comment ?? '').trim()
  const replacement = String(item.replacement ?? item.replace ?? item.new_text ?? '').trim()
  const paragraphIndex = parseParagraphIndex(item.paragraph_index ?? item.paragraphIndex)

  if (action === 'comment' && !comment) return null
  if (action === 'replace' && !replacement) return null
  if (action === 'edit_paragraph' && (!replacement || paragraphIndex === undefined)) return null

  return {
    id: String(item.id ?? index + 1),
    severity,
    category: VALID_CATEGORIES.has(category) ? category : 'other',
    action,
    anchorText,
    paragraphIndex,
    comment: comment || undefined,
    replacement: replacement || undefined,
  }
}

export function parseDocxReviewIssues(raw: string): {
  issues: DocxReviewIssue[]
  warnings: string[]
} {
  const warnings: string[] = []
  const parsed = extractLlmJsonArray(raw)
  if (!parsed) {
    return { issues: [], warnings: ['模型未返回 JSON 数组格式的 issue 列表'] }
  }

  const issues: DocxReviewIssue[] = []
  for (let i = 0; i < parsed.length; i += 1) {
    const issue = normalizeIssue(parsed[i], i)
    if (issue) {
      issues.push(issue)
    } else {
      warnings.push(`第 ${i + 1} 项 issue 格式无效，已跳过`)
    }
  }

  return { issues, warnings }
}

export function chunkReviewCommentIssues(issues: DocxReviewIssue[]): DocxReviewIssue[][] {
  const commentIssues = issues.filter((issue) => issue.action === 'comment')
  const batches: DocxReviewIssue[][] = []
  for (let i = 0; i < commentIssues.length; i += ADD_COMMENTS_BATCH_SIZE) {
    batches.push(commentIssues.slice(i, i + ADD_COMMENTS_BATCH_SIZE))
  }
  return batches
}

export function parseDocxCommentsBatchResult(result: string, requested: number): DocxToolBatchStats {
  if (isDocxToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  const summaryMatch = result.match(/(\d+)\s+added,\s*(\d+)\s+failed/i)
  if (summaryMatch) {
    const applied = Number.parseInt(summaryMatch[1] ?? '0', 10)
    const failed = Number.parseInt(summaryMatch[2] ?? '0', 10)
    return clampDocumentToolBatchStats(requested, applied, failed)
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const succeeded = Number(
      parsed.succeeded ?? parsed.success_count ?? parsed.added ?? parsed.success ?? NaN,
    )
    const failed = Number(parsed.failed ?? parsed.failure_count ?? parsed.failures ?? NaN)
    if (Number.isFinite(succeeded) && Number.isFinite(failed)) {
      return clampDocumentToolBatchStats(requested, succeeded, failed)
    }
    if (Number.isFinite(succeeded)) {
      const applied = Math.max(0, Math.min(requested, succeeded))
      return { applied, failed: Math.max(0, requested - applied) }
    }
    if (Array.isArray(parsed.failures)) {
      const failedCount = parsed.failures.length
      return { applied: Math.max(0, requested - failedCount), failed: failedCount }
    }
  } catch {
    // fall through to heuristics
  }

  const addedMatch = result.match(/(?:added|succeeded|成功(?:添加|写入)?)\s*[:：]?\s*(\d+)/i)
  if (addedMatch?.[1]) {
    const applied = Math.max(0, Math.min(requested, Number.parseInt(addedMatch[1], 10)))
    return { applied, failed: Math.max(0, requested - applied) }
  }

  if (/未找到|not found|anchor.*fail|失败/i.test(result)) {
    const failedMatch = result.match(/(\d+)\s*(?:条|个)?\s*(?:失败|failed)/i)
    const failed = failedMatch?.[1]
      ? Math.max(0, Math.min(requested, Number.parseInt(failedMatch[1], 10)))
      : requested
    return { applied: Math.max(0, requested - failed), failed }
  }

  return { applied: requested, failed: 0 }
}

export function parseDocxSingleReplaceResult(result: string): boolean {
  if (isDocxToolHardFailure(result)) return false
  if (
    /0\s*replacement|未找到|not found|no match|no occurrences|0\s*occurrences/i.test(result)
  ) {
    return false
  }
  return true
}

export function parseDocxReplaceTextsBatchResult(
  result: string,
  requested: number,
): DocxToolBatchStats {
  if (isDocxToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const results = parsed.results
    if (Array.isArray(results)) {
      let applied = 0
      for (const entry of results) {
        if (entry && typeof entry === 'object') {
          const item = entry as Record<string, unknown>
          const replacements = Number(item.replacements ?? item.count ?? 0)
          const ok = item.success === true || replacements > 0
          if (ok) applied += 1
          continue
        }
        applied += 1
      }
      return { applied, failed: Math.max(0, requested - applied) }
    }
    const succeeded = Number(parsed.succeeded ?? parsed.success_count ?? NaN)
    if (Number.isFinite(succeeded)) {
      const applied = Math.max(0, Math.min(requested, succeeded))
      return { applied, failed: Math.max(0, requested - applied) }
    }
  } catch {
    // fall through
  }

  const replacedMatch = result.match(/(\d+)\s*(?:处|个)?\s*(?:替换|replacement)/i)
  if (replacedMatch?.[1]) {
    const count = Number.parseInt(replacedMatch[1], 10)
    return count > 0
      ? { applied: requested, failed: 0 }
      : { applied: 0, failed: requested }
  }

  return parseDocxSingleReplaceResult(result)
    ? { applied: requested, failed: 0 }
    : { applied: 0, failed: requested }
}

export function parseDocxEditParagraphsBatchResult(
  result: string,
  requested: number,
): DocxToolBatchStats {
  if (isDocxToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const edited = Number(parsed.edited ?? parsed.succeeded ?? parsed.success_count ?? NaN)
    if (Number.isFinite(edited)) {
      const applied = Math.max(0, Math.min(requested, edited))
      return clampDocumentToolBatchStats(requested, applied, requested - applied)
    }
    if (Array.isArray(parsed.results)) {
      const applied = parsed.results.filter((entry) => {
        if (!entry || typeof entry !== 'object') return true
        const item = entry as Record<string, unknown>
        return item.success !== false
      }).length
      return { applied, failed: Math.max(0, requested - applied) }
    }
  } catch {
    // fall through
  }

  if (/edited\s*[:：]?\s*(\d+)/i.test(result)) {
    const match = result.match(/edited\s*[:：]?\s*(\d+)/i)
    const applied = match?.[1]
      ? Math.max(0, Math.min(requested, Number.parseInt(match[1], 10)))
      : requested
    return { applied, failed: Math.max(0, requested - applied) }
  }

  if (/未找到|not found|invalid paragraph|失败/i.test(result)) {
    return { applied: 0, failed: requested }
  }

  return { applied: requested, failed: 0 }
}

export function parseFailedBatchCommentAnchors(result: string): string[] {
  const failed: string[] = []
  for (const match of result.matchAll(/\[FAIL\]\s+"([^"]+)"/g)) {
    if (match[1]) failed.push(match[1])
  }
  return failed
}

export function parseReadDocumentBlockLine(line: string): { blockIndex: number; text: string } | null {
  const trimmed = line.trim()
  const match = trimmed.match(/^\[(\d+)\]\s*(?:\([^)]*\)\s*)*(?:\[[^\]]*\]\s*)*(.*)$/)
  if (!match?.[1]) return null
  const text = normalizeAnchorText(match[2] ?? '')
  if (!text) return null
  return { blockIndex: Number.parseInt(match[1], 10), text }
}

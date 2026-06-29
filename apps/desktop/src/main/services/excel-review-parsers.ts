import { extractLlmJsonArray } from '@toolman/shared'

import { parseDocumentReviewSeverity } from './document-review.util'
import {
  type ExcelReviewIssue,
  type ExcelReviewIssueAction,
  VALID_EXCEL_ACTIONS,
  VALID_EXCEL_SEVERITIES,
} from './excel-review-types'

export function parseExcelReviewIssues(raw: string): {
  issues: ExcelReviewIssue[]
  warnings: string[]
} {
  const warnings: string[] = []
  const parsed = extractLlmJsonArray(raw)
  if (!parsed) {
    warnings.push('模型输出不是有效 JSON 数组')
    return { issues: [], warnings }
  }

  const issues: ExcelReviewIssue[] = []
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const action = String(row.action ?? '').toLowerCase() as ExcelReviewIssueAction
    const severity = parseDocumentReviewSeverity(row.severity)
    const sheet = String(row.sheet ?? row.sheetName ?? '').trim()
    const cell = String(row.cell ?? row.address ?? '')
      .trim()
      .toUpperCase()
    if (!VALID_EXCEL_ACTIONS.has(action) || !sheet || !cell) {
      warnings.push(`跳过无效 issue #${index + 1}`)
      continue
    }
    if (!VALID_EXCEL_SEVERITIES.has(severity)) {
      warnings.push(`issue #${index + 1} severity 无效，已用 medium`)
    }
    issues.push({
      id: String(row.id ?? index + 1),
      severity,
      category: String(row.category ?? 'other'),
      action,
      sheet,
      cell,
      value:
        row.value === null
          ? null
          : typeof row.value === 'string' ||
              typeof row.value === 'number' ||
              typeof row.value === 'boolean'
            ? row.value
            : row.value != null
              ? String(row.value)
              : undefined,
      comment: row.comment != null ? String(row.comment) : undefined,
      color: row.color != null ? String(row.color) : undefined,
    })
  }

  return { issues, warnings }
}

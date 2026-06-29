import {
  DOCUMENT_REVIEW_SEVERITIES,
  type DocumentReviewIssueSeverity,
} from './document-review.util'

export type ExcelReviewIssueAction = 'modify' | 'highlight'
export type ExcelReviewIssueSeverity = DocumentReviewIssueSeverity

export interface ExcelReviewIssue {
  id: string
  severity: ExcelReviewIssueSeverity
  category: string
  action: ExcelReviewIssueAction
  sheet: string
  cell: string
  value?: string | number | boolean | null
  comment?: string
  color?: string
}

export interface ExcelReviewApplyResult {
  fileName: string
  workingPath: string
  issues: ExcelReviewIssue[]
  parseWarnings: string[]
  modifiesRequested: number
  modifiesApplied: number
  modifiesFailed: number
  highlightsRequested: number
  highlightsApplied: number
  highlightsFailed: number
  errors: string[]
}

export const VALID_EXCEL_ACTIONS = new Set<ExcelReviewIssueAction>(['modify', 'highlight'])
export const VALID_EXCEL_SEVERITIES = DOCUMENT_REVIEW_SEVERITIES

export function requestsExcelDirectFix(userRequest: string): boolean {
  const text = (userRequest || '审查表格错误并生成修订版').trim()
  return /修正|修改|纠正|更正|改过来|改正|修订|fix|correct|revise|生成修订版|审查.*错误/i.test(text)
}

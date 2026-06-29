import type { OfficeToDocxMethod } from './office-to-docx.service'
import {
  isDocumentToolHardFailure,
  type DocumentReviewIssueSeverity,
  type DocumentToolBatchStats,
} from './document-review.util'

export const DOCX_FILE_LINK_SCHEME = 'toolman-local://'

export const ADD_COMMENTS_BATCH_SIZE = 20
/** 单条批注最多尝试的锚点候选数，避免模型锚点偏差时刷屏式重试 */
export const MAX_COMMENT_ANCHOR_ATTEMPTS = 10
/** search_text 反查锚点时使用的 seed 上限（按长度优先） */
export const MAX_COMMENT_SEARCH_SEEDS = 24

export type DocxReviewIssueAction = 'comment' | 'replace' | 'edit_paragraph'
export type DocxReviewIssueSeverity = DocumentReviewIssueSeverity
export type DocxReviewIssueCategory =
  | 'error'
  | 'wording'
  | 'structure'
  | 'terminology'
  | 'other'

export interface DocxReviewIssue {
  id: string
  severity: DocxReviewIssueSeverity
  category: DocxReviewIssueCategory
  action: DocxReviewIssueAction
  anchorText: string
  paragraphIndex?: number
  comment?: string
  replacement?: string
}

export interface DocxReviewApplyResult {
  fileName: string
  workingPath: string
  issues: DocxReviewIssue[]
  parseWarnings: string[]
  commentsRequested: number
  commentsApplied: number
  commentsFailed: number
  replacementsRequested: number
  replacementsApplied: number
  replacementsFailed: number
  paragraphEditsRequested: number
  paragraphEditsApplied: number
  paragraphEditsFailed: number
  conversionMethod?: Exclude<OfficeToDocxMethod, 'copy'>
  errors: string[]
}

export const VALID_ACTIONS = new Set<DocxReviewIssueAction>(['comment', 'replace', 'edit_paragraph'])
export const VALID_CATEGORIES = new Set<DocxReviewIssueCategory>([
  'error',
  'wording',
  'structure',
  'terminology',
  'other',
])

export type DocxToolBatchStats = DocumentToolBatchStats

export const isDocxToolHardFailure = isDocumentToolHardFailure

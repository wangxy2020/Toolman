export {
  DOCX_FILE_LINK_SCHEME,
  isDocxToolHardFailure,
  type DocxReviewIssueAction,
  type DocxReviewIssueSeverity,
  type DocxReviewIssueCategory,
  type DocxReviewIssue,
  type DocxReviewApplyResult,
  type DocxToolBatchStats,
} from './docx-review-types'

export {
  buildLocalDocxMarkdownLink,
  buildDocxFileLinksMarkdown,
  buildDocxAuditSystemPrompt,
  buildDocxAuditUserMessage,
  resolveDocxReadDocumentContent,
  buildIsolatedDocxAuditMessages,
  buildDocxFinalSummaryPrompt,
  formatDocxReviewReport,
  buildDocxReviewSummaryBlock,
} from './docx-review-markdown'

export {
  parseDocxReviewIssues,
  chunkReviewCommentIssues,
  parseDocxCommentsBatchResult,
  parseDocxSingleReplaceResult,
  parseDocxReplaceTextsBatchResult,
  parseDocxEditParagraphsBatchResult,
  parseFailedBatchCommentAnchors,
  parseReadDocumentBlockLine,
} from './docx-review-parsers'

export {
  isCommentAnchorNotFoundFailure,
  buildCommentAnchorCandidates,
  buildCommentSearchSeeds,
  buildCommentAnchorAttemptOrder,
} from './docx-review-anchors'

export {
  resolveCommentAnchorCandidates,
  resolveCommentAnchorText,
} from './docx-review-anchors-resolve'

export { collectExplanationCommentIssues, applyDocxReviewIssues } from './docx-review-apply'

export { runDocxStructuredReviewPipeline } from './docx-review-pipeline'

export { runDocxMcpApplySmokeTest } from './docx-review-smoke-test'

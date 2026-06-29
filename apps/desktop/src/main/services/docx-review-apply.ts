import { randomUUID } from 'node:crypto'

import { toErrorMessage } from '@toolman/shared'
import type { ToolDefinition } from '@toolman/model-gateway'

import { findDocxMcpToolName } from './docx-mcp-task.service'
import type { DocxWorkingCopy } from './docx-mcp-task.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import {
  applySingleCommentWithCandidates,
} from './docx-review-apply-comments'
import {
  applySingleReplaceWithCandidates,
} from './docx-review-apply-replace'
import type { DocxReviewToolUpdate } from './docx-review-apply-types'
import { parseDocxEditParagraphsBatchResult } from './docx-review-parsers'
import {
  type DocxReviewApplyResult,
  type DocxReviewIssue,
  type DocxToolBatchStats,
} from './docx-review-types'

function buildCommentAnchorForEditedIssue(issue: DocxReviewIssue): string {
  return issue.anchorText
}

export function collectExplanationCommentIssues(issues: DocxReviewIssue[]): DocxReviewIssue[] {
  return issues
    .filter(
      (issue) =>
        (issue.action === 'replace' || issue.action === 'edit_paragraph') &&
        Boolean(issue.comment?.trim()),
    )
    .map((issue) => ({
      ...issue,
      action: 'comment' as const,
      anchorText: buildCommentAnchorForEditedIssue(issue),
    }))
}

async function applyCommentIssueBatches(options: {
  issues: DocxReviewIssue[]
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: DocxReviewToolUpdate) => void
  idPrefix: string
}): Promise<DocxToolBatchStats> {
  const requested = options.issues.length
  if (requested === 0) return { applied: 0, failed: 0 }

  const commentTool =
    findDocxMcpToolName(options.tools, 'add_comment') ??
    findDocxMcpToolName(options.tools, 'add_comments')
  if (!commentTool) return { applied: 0, failed: requested }

  let applied = 0
  let failed = 0

  for (const issue of options.issues) {
    const ok = await applySingleCommentWithCandidates({
      issue,
      workingPath: options.workingPath,
      tools: options.tools,
      toolName: commentTool,
      toolContext: options.toolContext,
      emitToolUpdate: options.emitToolUpdate,
      idPrefix: options.idPrefix,
    })
    if (ok) applied += 1
    else failed += 1
  }

  return { applied, failed }
}

export async function applyDocxReviewIssues(options: {
  issues: DocxReviewIssue[]
  workingCopy: DocxWorkingCopy
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: DocxReviewToolUpdate) => void
}): Promise<Pick<
  DocxReviewApplyResult,
  | 'commentsRequested'
  | 'commentsApplied'
  | 'commentsFailed'
  | 'replacementsRequested'
  | 'replacementsApplied'
  | 'replacementsFailed'
  | 'paragraphEditsRequested'
  | 'paragraphEditsApplied'
  | 'paragraphEditsFailed'
  | 'errors'
>> {
  const replaceTextsTool =
    findDocxMcpToolName(options.tools, 'replace_texts') ??
    findDocxMcpToolName(options.tools, 'replace_text')
  const editParagraphsTool =
    findDocxMcpToolName(options.tools, 'edit_paragraphs') ??
    findDocxMcpToolName(options.tools, 'edit_paragraph')

  const errors: string[] = []
  const replaceIssues = options.issues.filter((issue) => issue.action === 'replace')
  const paragraphIssues = options.issues.filter((issue) => issue.action === 'edit_paragraph')
  const commentOnlyIssues = options.issues.filter((issue) => issue.action === 'comment')
  const explanationIssues = collectExplanationCommentIssues(options.issues)
  const preReplaceCommentIssues = [...commentOnlyIssues, ...explanationIssues]

  let commentsRequested = 0
  let commentsApplied = 0
  let commentsFailed = 0

  if (preReplaceCommentIssues.length > 0) {
    const stats = await applyCommentIssueBatches({
      issues: preReplaceCommentIssues,
      workingPath: options.workingCopy.workingPath,
      tools: options.tools,
      toolContext: options.toolContext,
      emitToolUpdate: options.emitToolUpdate,
      idPrefix: 'docx-review-comments',
    })
    commentsRequested += preReplaceCommentIssues.length
    commentsApplied += stats.applied
    commentsFailed += stats.failed
  }

  const replacementsRequested = replaceIssues.length
  let replacementsApplied = 0
  let replacementsFailed = 0
  const paragraphEditsRequested = paragraphIssues.length
  let paragraphEditsApplied = 0
  let paragraphEditsFailed = 0

  if (replaceIssues.length > 0) {
    if (!replaceTextsTool) {
      replacementsFailed = replacementsRequested
      errors.push('未找到 replace_texts / replace_text 工具')
    } else {
      for (const issue of replaceIssues) {
        const ok = await applySingleReplaceWithCandidates({
          issue,
          workingPath: options.workingCopy.workingPath,
          tools: options.tools,
          toolContext: options.toolContext,
          toolName: replaceTextsTool,
          emitToolUpdate: options.emitToolUpdate,
          idPrefix: 'docx-review-replace',
        })
        if (ok) {
          replacementsApplied += 1
        } else {
          replacementsFailed += 1
          errors.push(`替换失败(${issue.id})：${issue.anchorText.slice(0, 40)}`)
        }
      }
    }
  }

  if (paragraphIssues.length > 0) {
    if (!editParagraphsTool) {
      paragraphEditsFailed = paragraphEditsRequested
      errors.push('未找到 edit_paragraphs / edit_paragraph 工具')
    } else if (editParagraphsTool.includes('edit_paragraphs')) {
      const callId = `docx-review-paragraph-batch-${randomUUID()}`
      const args = JSON.stringify({
        file_path: options.workingCopy.workingPath,
        edits: paragraphIssues.map((issue) => ({
          paragraph_index: issue.paragraphIndex,
          new_text: issue.replacement ?? '',
        })),
        track_changes: true,
        author: 'Toolman',
      })

      options.emitToolUpdate({
        toolCallId: callId,
        name: editParagraphsTool,
        arguments: args,
        status: 'running',
      })

      try {
        const result = await executeToolCall(editParagraphsTool, args, options.toolContext)
        const stats = parseDocxEditParagraphsBatchResult(result, paragraphIssues.length)
        paragraphEditsApplied = stats.applied
        paragraphEditsFailed = stats.failed
        if (stats.failed > 0) errors.push(`edit_paragraphs 部分失败：${result.slice(0, 200)}`)
        options.emitToolUpdate({
          toolCallId: callId,
          name: editParagraphsTool,
          arguments: args,
          result: result.slice(0, 800),
          status: stats.failed === paragraphIssues.length ? 'failed' : 'done',
        })
      } catch (error) {
        paragraphEditsFailed = paragraphEditsRequested
        const message = toErrorMessage(error, 'edit_paragraphs 失败')
        errors.push(message)
        options.emitToolUpdate({
          toolCallId: callId,
          name: editParagraphsTool,
          arguments: args,
          result: `Error: ${message}`,
          status: 'failed',
        })
      }
    } else {
      for (const issue of paragraphIssues) {
        const callId = `docx-review-paragraph-${randomUUID()}`
        const args = JSON.stringify({
          file_path: options.workingCopy.workingPath,
          paragraph_index: issue.paragraphIndex,
          new_text: issue.replacement ?? '',
          track_changes: true,
          author: 'Toolman',
        })

        options.emitToolUpdate({
          toolCallId: callId,
          name: editParagraphsTool,
          arguments: args,
          status: 'running',
        })

        try {
          const result = await executeToolCall(editParagraphsTool, args, options.toolContext)
          const stats = parseDocxEditParagraphsBatchResult(result, 1)
          paragraphEditsApplied += stats.applied
          paragraphEditsFailed += stats.failed
          if (stats.failed > 0) errors.push(`段落修订失败(${issue.id})：${result.slice(0, 120)}`)
          options.emitToolUpdate({
            toolCallId: callId,
            name: editParagraphsTool,
            arguments: args,
            result: result.slice(0, 800),
            status: stats.failed > 0 ? 'failed' : 'done',
          })
        } catch (error) {
          paragraphEditsFailed += 1
          const message = toErrorMessage(error, 'edit_paragraph 失败')
          errors.push(message)
          options.emitToolUpdate({
            toolCallId: callId,
            name: editParagraphsTool,
            arguments: args,
            result: `Error: ${message}`,
            status: 'failed',
          })
        }
      }
    }
  }

  if (commentsFailed > 0 && commentsApplied === 0 && commentsRequested > 0) {
    errors.push('add_comments / add_comment 全部失败')
  } else if (commentsFailed > 0) {
    errors.push(`add_comments 部分失败（${commentsFailed}/${commentsRequested}）`)
  }

  return {
    commentsRequested,
    commentsApplied,
    commentsFailed,
    replacementsRequested,
    replacementsApplied,
    replacementsFailed,
    paragraphEditsRequested,
    paragraphEditsApplied,
    paragraphEditsFailed,
    errors,
  }
}

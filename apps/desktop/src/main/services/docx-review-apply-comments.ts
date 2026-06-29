import { randomUUID } from 'node:crypto'

import { toErrorMessage } from '@toolman/shared'
import type { ToolDefinition } from '@toolman/model-gateway'

import { findDocxMcpToolName } from './docx-mcp-task.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import { isCommentAnchorNotFoundFailure } from './docx-review-anchors'
import { resolveCommentAnchorCandidates } from './docx-review-anchors-resolve'
import { parseDocxCommentsBatchResult } from './docx-review-parsers'
import { isDocxToolHardFailure, type DocxReviewIssue } from './docx-review-types'
import type { DocxReviewToolUpdate } from './docx-review-apply-types'

function summarizeCommentAnchorRetries(retryNotes: readonly string[]): string {
  if (retryNotes.length === 0) return ''
  const preview = retryNotes.slice(0, 3).join('；')
  const suffix = retryNotes.length > 3 ? ` 等 ${retryNotes.length} 个` : ''
  return `前 ${retryNotes.length} 个锚点未命中（${preview}${suffix}），已自动换锚重试。`
}

function buildCommentToolArgs(options: {
  workingPath: string
  anchorText: string
  commentText: string
  toolName: string
}): string {
  if (options.toolName.includes('add_comments')) {
    return JSON.stringify({
      file_path: options.workingPath,
      comments: [
        {
          anchor_text: options.anchorText,
          comment_text: options.commentText,
          author: 'Toolman',
        },
      ],
      default_author: 'Toolman',
    })
  }

  return JSON.stringify({
    file_path: options.workingPath,
    anchor_text: options.anchorText,
    comment_text: options.commentText,
    author: 'Toolman',
  })
}

function commentToolCallFailed(result: string, toolName: string): boolean {
  if (isDocxToolHardFailure(result) && !isCommentAnchorNotFoundFailure(result)) return true
  if (isCommentAnchorNotFoundFailure(result)) return true
  if (toolName.includes('add_comments')) {
    return parseDocxCommentsBatchResult(result, 1).applied === 0
  }
  return false
}

export async function applySingleCommentWithCandidates(options: {
  issue: DocxReviewIssue
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  toolName: string
  emitToolUpdate: (update: DocxReviewToolUpdate) => void
  idPrefix: string
}): Promise<boolean> {
  const anchorCandidates = await resolveCommentAnchorCandidates({
    workingPath: options.workingPath,
    anchorText: options.issue.anchorText,
    paragraphIndex: options.issue.paragraphIndex,
    tools: options.tools,
    toolContext: options.toolContext,
  })
  if (anchorCandidates.length === 0) return false

  const toolName =
    findDocxMcpToolName(options.tools, 'add_comment') ??
    findDocxMcpToolName(options.tools, 'add_comments') ??
    options.toolName

  const callId = `${options.idPrefix}-${randomUUID()}`
  const retryNotes: string[] = []
  let lastResult = ''

  options.emitToolUpdate({
    toolCallId: callId,
    name: toolName,
    arguments: buildCommentToolArgs({
      workingPath: options.workingPath,
      anchorText: options.issue.anchorText,
      commentText: options.issue.comment ?? '',
      toolName,
    }),
    status: 'running',
  })

  for (const anchorText of anchorCandidates) {
    const args = buildCommentToolArgs({
      workingPath: options.workingPath,
      anchorText,
      commentText: options.issue.comment ?? '',
      toolName,
    })

    try {
      const result = await executeToolCall(toolName, args, options.toolContext)
      lastResult = result
      const itemFailed = commentToolCallFailed(result, toolName)
      if (!itemFailed) {
        const retrySummary = summarizeCommentAnchorRetries(retryNotes)
        options.emitToolUpdate({
          toolCallId: callId,
          name: toolName,
          arguments: args,
          result: retrySummary ? `${retrySummary}\n${result.slice(0, 600)}` : result.slice(0, 800),
          status: 'done',
        })
        return true
      }
      if (isCommentAnchorNotFoundFailure(result)) {
        retryNotes.push(anchorText.length > 48 ? `${anchorText.slice(0, 48)}…` : anchorText)
        continue
      }

      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        result: result.slice(0, 800),
        status: 'failed',
      })
      return false
    } catch (error) {
      const message = toErrorMessage(error, 'add_comment 失败')
      lastResult = `Error: ${message}`
      if (isCommentAnchorNotFoundFailure(lastResult)) {
        retryNotes.push(anchorText.length > 48 ? `${anchorText.slice(0, 48)}…` : anchorText)
        continue
      }

      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        result: lastResult,
        status: 'failed',
      })
      return false
    }
  }

  options.emitToolUpdate({
    toolCallId: callId,
    name: toolName,
    result:
      lastResult.slice(0, 800) ||
      `未找到可用锚点（已尝试 ${anchorCandidates.length} 个候选）`,
    status: 'failed',
  })
  return false
}

import { randomUUID } from 'node:crypto'

import { toErrorMessage } from '@toolman/shared'
import type { ToolDefinition } from '@toolman/model-gateway'

import { findDocxMcpToolName } from './docx-mcp-task.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import { isCommentAnchorNotFoundFailure } from './docx-review-anchors'
import { resolveCommentAnchorCandidates } from './docx-review-anchors-resolve'
import {
  parseDocxReplaceTextsBatchResult,
  parseDocxSingleReplaceResult,
} from './docx-review-parsers'
import type { DocxReviewIssue } from './docx-review-types'
import type { DocxReviewToolUpdate } from './docx-review-apply-types'

function summarizeReplaceSearchRetries(retryNotes: readonly string[]): string {
  if (retryNotes.length === 0) return ''
  const preview = retryNotes.slice(0, 3).join('；')
  const suffix = retryNotes.length > 3 ? ` 等 ${retryNotes.length} 个` : ''
  return `前 ${retryNotes.length} 个 search 未命中（${preview}${suffix}），已自动换定位重试。`
}

function buildReplaceToolArgs(options: {
  workingPath: string
  search: string
  replace: string
  toolName: string
}): string {
  if (options.toolName.includes('replace_texts')) {
    return JSON.stringify({
      file_path: options.workingPath,
      items: [{ search: options.search, replace: options.replace }],
      track_changes: true,
      author: 'Toolman',
    })
  }

  return JSON.stringify({
    file_path: options.workingPath,
    search: options.search,
    replace: options.replace,
    track_changes: true,
    author: 'Toolman',
  })
}

function replaceToolCallSucceeded(result: string, toolName: string): boolean {
  if (toolName.includes('replace_texts')) {
    return parseDocxReplaceTextsBatchResult(result, 1).applied > 0
  }
  return parseDocxSingleReplaceResult(result)
}

export async function applySingleReplaceWithCandidates(options: {
  issue: DocxReviewIssue
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  toolName: string
  emitToolUpdate: (update: DocxReviewToolUpdate) => void
  idPrefix: string
}): Promise<boolean> {
  const searchCandidates = await resolveCommentAnchorCandidates({
    workingPath: options.workingPath,
    anchorText: options.issue.anchorText,
    paragraphIndex: options.issue.paragraphIndex,
    tools: options.tools,
    toolContext: options.toolContext,
  })
  if (searchCandidates.length === 0) return false

  const toolName =
    findDocxMcpToolName(options.tools, 'replace_text') ??
    findDocxMcpToolName(options.tools, 'replace_texts') ??
    options.toolName

  const callId = `${options.idPrefix}-${randomUUID()}`
  const retryNotes: string[] = []
  let lastResult = ''

  options.emitToolUpdate({
    toolCallId: callId,
    name: toolName,
    arguments: buildReplaceToolArgs({
      workingPath: options.workingPath,
      search: options.issue.anchorText,
      replace: options.issue.replacement ?? '',
      toolName,
    }),
    status: 'running',
  })

  for (const search of searchCandidates) {
    const args = buildReplaceToolArgs({
      workingPath: options.workingPath,
      search,
      replace: options.issue.replacement ?? '',
      toolName,
    })

    try {
      const result = await executeToolCall(toolName, args, options.toolContext)
      lastResult = result
      if (replaceToolCallSucceeded(result, toolName)) {
        const retrySummary = summarizeReplaceSearchRetries(retryNotes)
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
        retryNotes.push(search.length > 48 ? `${search.slice(0, 48)}…` : search)
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
      const message = toErrorMessage(error, 'replace_text 失败')
      lastResult = `Error: ${message}`
      if (isCommentAnchorNotFoundFailure(lastResult)) {
        retryNotes.push(search.length > 48 ? `${search.slice(0, 48)}…` : search)
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
      `未找到可替换文本（已尝试 ${searchCandidates.length} 个 search 候选）`,
    status: 'failed',
  })
  return false
}

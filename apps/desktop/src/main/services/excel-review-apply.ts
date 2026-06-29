import { randomUUID } from 'node:crypto'
import { toErrorMessage } from '@toolman/shared'

import type { ToolDefinition } from '@toolman/model-gateway'
import { findExcelMcpToolName, type ExcelWorkingCopy } from './excel-mcp-task.service'
import { countExcelToolApplyResult } from './document-review.util'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import type { ExcelReviewIssue } from './excel-review-types'

export async function applyExcelReviewIssues(options: {
  issues: ExcelReviewIssue[]
  workingCopy: ExcelWorkingCopy
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
}): Promise<{
  modifiesRequested: number
  modifiesApplied: number
  modifiesFailed: number
  highlightsRequested: number
  highlightsApplied: number
  highlightsFailed: number
  errors: string[]
}> {
  const modifyTool = findExcelMcpToolName(options.tools, 'modify_excel_cells')
  const highlightTool = findExcelMcpToolName(options.tools, 'highlight_excel_cells')
  const modifyIssues = options.issues.filter((issue) => issue.action === 'modify')
  const highlightIssues = options.issues.filter((issue) => issue.action === 'highlight')
  const errors: string[] = []

  let modifiesApplied = 0
  let modifiesFailed = 0
  let highlightsApplied = 0
  let highlightsFailed = 0

  if (modifyIssues.length > 0) {
    if (!modifyTool) {
      modifiesFailed = modifyIssues.length
      errors.push('未找到 modify_excel_cells 工具')
    } else {
      const callId = `excel-review-modify-${randomUUID()}`
      const args = JSON.stringify({
        filePath: options.workingCopy.workingPath,
        changes: modifyIssues.map((issue) => ({
          sheet: issue.sheet,
          cell: issue.cell,
          value: issue.value,
          comment: issue.comment,
        })),
      })
      options.emitToolUpdate({ toolCallId: callId, name: modifyTool, arguments: args, status: 'running' })
      try {
        const result = await executeToolCall(modifyTool, args, options.toolContext)
        const counts = countExcelToolApplyResult(result, 'modify')
        modifiesApplied = counts.applied
        modifiesFailed = modifyIssues.length - counts.applied
        if (modifiesFailed > 0) errors.push(`部分单元格修改失败：${result.slice(0, 200)}`)
        options.emitToolUpdate({
          toolCallId: callId,
          name: modifyTool,
          arguments: args,
          result: result.slice(0, 800),
          status: modifiesFailed === modifyIssues.length ? 'failed' : 'done',
        })
      } catch (error) {
        modifiesFailed = modifyIssues.length
        errors.push(toErrorMessage(error, 'modify_excel_cells 失败'))
        options.emitToolUpdate({
          toolCallId: callId,
          name: modifyTool,
          arguments: args,
          result: errors[errors.length - 1],
          status: 'failed',
        })
      }
    }
  }

  if (highlightIssues.length > 0) {
    if (!highlightTool) {
      highlightsFailed = highlightIssues.length
      errors.push('未找到 highlight_excel_cells 工具')
    } else {
      const callId = `excel-review-highlight-${randomUUID()}`
      const args = JSON.stringify({
        filePath: options.workingCopy.workingPath,
        highlights: highlightIssues.map((issue) => ({
          sheet: issue.sheet,
          cell: issue.cell,
          color: issue.color ?? 'FFFF00',
          comment: issue.comment ?? issue.category,
        })),
      })
      options.emitToolUpdate({
        toolCallId: callId,
        name: highlightTool,
        arguments: args,
        status: 'running',
      })
      try {
        const result = await executeToolCall(highlightTool, args, options.toolContext)
        const counts = countExcelToolApplyResult(result, 'highlight')
        highlightsApplied = counts.applied
        highlightsFailed = highlightIssues.length - counts.applied
        if (highlightsFailed > 0) errors.push(`部分高亮失败：${result.slice(0, 200)}`)
        options.emitToolUpdate({
          toolCallId: callId,
          name: highlightTool,
          arguments: args,
          result: result.slice(0, 800),
          status: highlightsFailed === highlightIssues.length ? 'failed' : 'done',
        })
      } catch (error) {
        highlightsFailed = highlightIssues.length
        errors.push(toErrorMessage(error, 'highlight_excel_cells 失败'))
        options.emitToolUpdate({
          toolCallId: callId,
          name: highlightTool,
          arguments: args,
          result: errors[errors.length - 1],
          status: 'failed',
        })
      }
    }
  }

  return {
    modifiesRequested: modifyIssues.length,
    modifiesApplied,
    modifiesFailed,
    highlightsRequested: highlightIssues.length,
    highlightsApplied,
    highlightsFailed,
    errors,
  }
}

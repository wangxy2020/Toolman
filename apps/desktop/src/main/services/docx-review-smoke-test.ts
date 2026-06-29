import type { ToolDefinition } from '@toolman/model-gateway'

import { findDocxMcpToolName } from './docx-mcp-task.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import { applyDocxReviewIssues } from './docx-review-apply'
import type { DocxReviewApplyResult, DocxReviewIssue } from './docx-review-types'

export async function runDocxMcpApplySmokeTest(options: {
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<DocxReviewApplyResult> {
  const noopEmit = () => {}

  const createTool =
    findDocxMcpToolName(options.tools, 'create_document') ??
    findDocxMcpToolName(options.tools, 'read_document')
  if (!createTool) {
    throw new Error('DOCX MCP 缺少 create_document 工具')
  }

  await executeToolCall(
    createTool,
    JSON.stringify({
      file_path: options.workingPath,
      title: 'Smoke Test',
      content: '这是一段需要审查的测试文本，包含错别字。',
    }),
    options.toolContext,
  )

  const issues: DocxReviewIssue[] = [
    {
      id: 'smoke-replace',
      severity: 'high',
      category: 'error',
      action: 'replace',
      anchorText: '错别字',
      replacement: '测试修正',
      comment: '自动替换测试',
    },
    {
      id: 'smoke-comment',
      severity: 'medium',
      category: 'wording',
      action: 'comment',
      anchorText: '测试文本',
      comment: '建议进一步润色',
    },
  ]

  const applied = await applyDocxReviewIssues({
    issues,
    workingCopy: {
      sourcePath: options.workingPath,
      workingPath: options.workingPath,
      fileName: 'smoke.docx',
    },
    tools: options.tools,
    toolContext: options.toolContext,
    emitToolUpdate: noopEmit,
  })

  const readTool = findDocxMcpToolName(options.tools, 'read_document')
  if (!readTool) {
    throw new Error('DOCX MCP 缺少 read_document 工具')
  }

  const readResult = await executeToolCall(
    readTool,
    JSON.stringify({ file_path: options.workingPath }),
    options.toolContext,
  )

  if (!readResult.includes('测试修正')) {
    throw new Error(`read_document 未包含替换结果：${readResult.slice(0, 200)}`)
  }

  return {
    fileName: 'smoke.docx',
    workingPath: options.workingPath,
    issues,
    parseWarnings: [],
    ...applied,
  }
}

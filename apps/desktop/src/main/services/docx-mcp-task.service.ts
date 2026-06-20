import { copyFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'

import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { DOCX_MCP_SERVER_ID } from '@toolman/shared'

import { ensureMcpServersConnected, getMcpClientState } from './mcp-client-manager.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'

export const DOCX_MCP_BATCH_TOOL_NAME = '__docx_mcp_batch__'

const DOCX_MCP_READ_TOOL_NAMES = new Set([
  'read_document',
  'get_document_info',
  'search_text',
  'list_images',
  'read_comments',
  'read_header_footer',
  'read_footnotes',
])

export class DocxMcpNotReadyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocxMcpNotReadyError'
  }
}

export interface DocxWorkingCopy {
  sourcePath: string
  workingPath: string
  fileName: string
}

export async function assertDocxMcpReady(): Promise<number> {
  await ensureMcpServersConnected([DOCX_MCP_SERVER_ID])
  const state = getMcpClientState(DOCX_MCP_SERVER_ID)
  if (!state?.connected) {
    throw new DocxMcpNotReadyError(
      `DOCX MCP Server 连接失败：${state?.lastError ?? '请确认 Node.js 20+ 已安装且 npx docx-mcp-server 可运行'}`,
    )
  }

  const listed = await state.client.listTools()
  if (listed.tools.length === 0) {
    throw new DocxMcpNotReadyError('DOCX MCP Server 未返回任何工具')
  }

  return listed.tools.length
}

export function filterDocxMcpToolDefinitions(tools: ToolDefinition[]): ToolDefinition[] {
  const docxTools = tools.filter((tool) => tool.function.name.includes(DOCX_MCP_SERVER_ID))
  if (docxTools.length > 0) return docxTools

  return tools.filter((tool) => {
    const shortName = tool.function.name.split('__').pop()?.toLowerCase() ?? ''
    return [
      'read_document',
      'get_document_info',
      'search_text',
      'replace_text',
      'replace_texts',
      'edit_paragraph',
      'edit_paragraphs',
      'add_comment',
      'add_comments',
      'create_document',
    ].includes(shortName)
  })
}

export function resolveDocxMcpShortToolName(toolName: string): string {
  if (toolName === DOCX_MCP_BATCH_TOOL_NAME) return toolName
  if (toolName.includes(DOCX_MCP_SERVER_ID)) {
    return toolName.split('__').pop()?.toLowerCase() ?? toolName.toLowerCase()
  }
  return toolName.toLowerCase()
}

export function isDocxMcpToolName(toolName: string): boolean {
  if (toolName === DOCX_MCP_BATCH_TOOL_NAME) return true
  return (
    toolName.includes(DOCX_MCP_SERVER_ID) ||
    [
      'read_document',
      'get_document_info',
      'search_text',
      'replace_text',
      'replace_texts',
      'edit_paragraph',
      'edit_paragraphs',
      'add_comment',
      'add_comments',
      'create_document',
    ].includes(resolveDocxMcpShortToolName(toolName))
  )
}

export function isDocxMcpEditToolName(toolName: string): boolean {
  if (!isDocxMcpToolName(toolName) || toolName === DOCX_MCP_BATCH_TOOL_NAME) return false
  const shortName = resolveDocxMcpShortToolName(toolName)
  return !DOCX_MCP_READ_TOOL_NAMES.has(shortName)
}

export function buildDocxMcpBatchApprovalArgs(workingCopies: DocxWorkingCopy[]): string {
  return JSON.stringify(
    {
      summary: '本次将依次调用 add_comment、replace_text、edit_paragraph 等多个 DOCX 编辑工具',
      files: workingCopies.map((copy) => copy.workingPath),
    },
    null,
    2,
  )
}

export function buildDocxMcpApprovalScopeKey(assistantMessageId: string): string {
  return `docx-mcp:${assistantMessageId}`
}

const DOCX_THOROUGH_EDIT_KEYWORDS =
  /审查|审阅|批注|修订|修改|纠错|优化|润色|校对|review|comment|audit|annotate/i

export const DOCX_MIN_EDITS_BEFORE_FINISH = 3
export const DOCX_MAX_CONTINUE_NUDGES = 4
export const DOCX_MIN_IDLE_ROUNDS_TO_FINISH = 2

export function isDocxThoroughEditRequest(userText: string): boolean {
  return DOCX_THOROUGH_EDIT_KEYWORDS.test(userText.trim())
}

export function buildDocxContinueEditNudge(options: {
  successfulEdits: number
  nudgeIndex: number
  thorough: boolean
  workingPaths: string[]
}): string {
  const paths = options.workingPaths.map((path) => `- ${path}`).join('\n')
  const minEdits = options.thorough ? DOCX_MIN_EDITS_BEFORE_FINISH : 1

  if (options.successfulEdits < minEdits) {
    return [
      `当前仅完成 ${options.successfulEdits} 处 DOCX 编辑，未达到本次任务要求（至少 ${minEdits} 次编辑类工具调用）。`,
      '请继续编辑修订版文件，不要开始写最终总结：',
      '1. 优先用 add_comments 一次批量添加所有批注（不要只加一条）',
      '2. 用 replace_text / edit_paragraphs 修正其余错误',
      '3. 所有工具的 file_path 必须使用修订版绝对路径',
      '4. 勿重复 read_document',
      paths ? `修订版路径：\n${paths}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '请确认是否还有未处理的审查项、批注或文字错误。',
    '若仍有遗漏，请继续调用 add_comments / replace_text / edit_paragraphs；',
    '若已全部完成，可直接给出最终说明与修订版文件绝对路径。',
    '勿重复 read_document 或重做已完成步骤。',
    paths ? `修订版路径：\n${paths}` : '',
  ]
      .filter(Boolean)
      .join('\n')
}

export function shouldContinueDocxEditing(options: {
  thorough: boolean
  successfulEdits: number
  idleRoundsWithoutTools: number
  continueNudgesSent: number
}): boolean {
  if (options.continueNudgesSent >= DOCX_MAX_CONTINUE_NUDGES) return false

  const minEdits = options.thorough ? DOCX_MIN_EDITS_BEFORE_FINISH : 1
  if (options.successfulEdits < minEdits) return true

  if (options.thorough && options.idleRoundsWithoutTools < DOCX_MIN_IDLE_ROUNDS_TO_FINISH) {
    return true
  }

  return false
}

export function findDocxReadDocumentToolName(tools: ToolDefinition[]): string | null {
  return findDocxMcpToolName(tools, 'read_document')
}

export function findDocxMcpToolName(
  tools: ToolDefinition[],
  shortName: string,
): string | null {
  const normalized = shortName.toLowerCase()
  for (const tool of tools) {
    const name = tool.function.name
    if (name === normalized || name.endsWith(`__${normalized}`)) return name
  }
  return null
}

export async function prepareDocxWorkingCopies(options: {
  sourcePaths: Array<{ sourcePath: string; fileName: string }>
  workdir: string
}): Promise<DocxWorkingCopy[]> {
  const copies: DocxWorkingCopy[] = []

  for (const item of options.sourcePaths) {
    const stem = basename(item.fileName).replace(/\.docx$/i, '')
    const safeStem = stem.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 80) || 'document'
    const workingName = `修订版_${safeStem}.docx`
    const workingPath = join(options.workdir, workingName)
    await mkdir(dirname(workingPath), { recursive: true })
    await copyFile(item.sourcePath, workingPath)
    copies.push({
      sourcePath: item.sourcePath,
      workingPath,
      fileName: item.fileName,
    })
  }

  return copies
}

export async function bootstrapDocxMcpRead(options: {
  chatMessages: ChatMessage[]
  tools: ToolDefinition[]
  workingCopies: DocxWorkingCopy[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
}): Promise<void> {
  const readTool = findDocxReadDocumentToolName(options.tools)
  if (!readTool) {
    throw new DocxMcpNotReadyError('DOCX MCP 工具集中未找到 read_document')
  }

  for (const copy of options.workingCopies) {
    const callId = `docx-bootstrap-${randomUUID()}`
    const args = JSON.stringify({ file_path: copy.workingPath })

    options.emitToolUpdate({
      toolCallId: callId,
      name: readTool,
      arguments: args,
      status: 'running',
    })

    let result: string
    try {
      result = await executeToolCall(readTool, args, options.toolContext)
    } catch (error) {
      result = `Error: ${error instanceof Error ? error.message : 'read_document 失败'}`
    }

    const snippet = result.length > 12000 ? `${result.slice(0, 12000)}…` : result
    options.emitToolUpdate({
      toolCallId: callId,
      name: readTool,
      arguments: args,
      result: snippet,
      status: result.startsWith('Error:') ? 'failed' : 'done',
    })

    options.chatMessages.push({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: callId, name: readTool, arguments: args }],
    })
    options.chatMessages.push({
      role: 'tool',
      tool_call_id: callId,
      content: result,
    })
  }
}

import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import {DOCX_MCP_SERVER_ID, toErrorMessage } from '@toolman/shared'

import { ensureMcpServersConnected, getMcpClientState } from './mcp-client-manager.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import {
  buildMcpApprovalScopeKey,
  buildMcpBatchApprovalArgs,
  filterMcpToolDefinitions,
  findMcpToolName,
  resolveMcpShortToolName,
} from './document-mcp-task.util'
import {
  buildLegacyWordConversionStatusMessage,
  docxWorkingStem,
  materializeDocxForMcp,
  type OfficeToDocxMethod,
} from './office-to-docx.service'

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
  /** 源文件非 .docx 时，记录转换方式 */
  conversionMethod?: Exclude<OfficeToDocxMethod, 'copy'>
}

export async function assertDocxMcpReady(): Promise<number> {
  await ensureMcpServersConnected([DOCX_MCP_SERVER_ID])
  const state = getMcpClientState(DOCX_MCP_SERVER_ID)
  if (!state?.connected) {
    throw new DocxMcpNotReadyError(
      `DOCX MCP Server 连接失败：${state?.lastError ?? '请确认内置 DOCX MCP 已正确打包'}`,
    )
  }

  const listed = await state.client.listTools()
  if (listed.tools.length === 0) {
    throw new DocxMcpNotReadyError('DOCX MCP Server 未返回任何工具')
  }

  return listed.tools.length
}

export function filterDocxMcpToolDefinitions(tools: ToolDefinition[]): ToolDefinition[] {
  return filterMcpToolDefinitions(tools, DOCX_MCP_SERVER_ID, [
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
  ])
}

export function resolveDocxMcpShortToolName(toolName: string): string {
  return resolveMcpShortToolName(toolName, DOCX_MCP_SERVER_ID, DOCX_MCP_BATCH_TOOL_NAME)
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
  return buildMcpBatchApprovalArgs(
    '本次将依次调用 add_comment、replace_text、edit_paragraph 等多个 DOCX 编辑工具',
    workingCopies.map((copy) => copy.workingPath),
  )
}

export function buildDocxMcpApprovalScopeKey(assistantMessageId: string): string {
  return buildMcpApprovalScopeKey('docx-mcp', assistantMessageId)
}

const DOCX_THOROUGH_EDIT_KEYWORDS =
  /审查|审阅|批注|修订|修改|纠错|优化|润色|校对|review|comment|audit|annotate/i

export const DOCX_PARAGRAPH_REWRITE_KEYWORDS =
  /整段(?:重写|替换|改写|修改)|段落(?:重写|改写|替换)|重写(?:该|此|本|那一)?段|按列表(?:重写|改写)|列表化|重组(?:该|此|本)?段(?:落)?|重组结构|全文重写|rewrite\s+(?:the\s+)?paragraph|full\s+paragraph/i

export function requestsDocxParagraphRewrite(userText: string): boolean {
  return DOCX_PARAGRAPH_REWRITE_KEYWORDS.test(userText.trim())
}

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
      '2. 用 replace_text 修正其余错误；仅当用户明确要求整段重写/列表化/重组段落时才用 edit_paragraphs',
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
  return findMcpToolName(tools, 'read_document')
}

export function findDocxMcpToolName(
  tools: ToolDefinition[],
  shortName: string,
): string | null {
  return findMcpToolName(tools, shortName)
}

export async function prepareDocxWorkingCopies(options: {
  sourcePaths: Array<{ sourcePath: string; fileName: string }>
  workdir: string
  onStatus?: (message: string) => void
}): Promise<DocxWorkingCopy[]> {
  const copies: DocxWorkingCopy[] = []

  for (const item of options.sourcePaths) {
    const safeStem = docxWorkingStem(item.fileName)
    const workingName = `修订版_${safeStem}.docx`
    const workingPath = join(options.workdir, workingName)
    await mkdir(dirname(workingPath), { recursive: true })

    const { method, capabilities } = await materializeDocxForMcp({
      sourcePath: item.sourcePath,
      fileName: item.fileName,
      targetDocxPath: workingPath,
    })

    if (method === 'copy') {
      options.onStatus?.(`已复制修订版：${workingName}`)
    } else {
      options.onStatus?.(
        buildLegacyWordConversionStatusMessage({
          fileName: item.fileName,
          workingName,
          method,
          capabilities,
        }),
      )
    }

    copies.push({
      sourcePath: item.sourcePath,
      workingPath,
      fileName: item.fileName,
      conversionMethod: method === 'copy' ? undefined : method,
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
      result = `Error: ${toErrorMessage(error, 'read_document 失败')}`
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

import type { ToolDefinition } from '@toolman/model-gateway'
import { DOCX_MCP_SERVER_ID } from '@toolman/shared'
import { ensureMcpServersConnected, getMcpClientState } from '../mcp-client-manager.service'
import {
  buildMcpApprovalScopeKey,
  buildMcpBatchApprovalArgs,
  filterMcpToolDefinitions,
  findMcpToolName,
  resolveMcpShortToolName,
} from '../document-mcp-task.util'
import {
  DOCX_MCP_BATCH_TOOL_NAME,
  DOCX_MCP_READ_TOOL_NAMES,
  DocxMcpNotReadyError,
  type DocxWorkingCopy,
} from './constants'

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

export function findDocxReadDocumentToolName(tools: ToolDefinition[]): string | null {
  return findMcpToolName(tools, 'read_document')
}

export function findDocxMcpToolName(
  tools: ToolDefinition[],
  shortName: string,
): string | null {
  return findMcpToolName(tools, shortName)
}

export { DOCX_MCP_BATCH_TOOL_NAME }

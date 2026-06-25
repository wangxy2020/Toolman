import { copyFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import {EXCEL_MCP_SERVER_ID, toErrorMessage } from '@toolman/shared'

import { ensureMcpServersConnected, getMcpClientState } from './mcp-client-manager.service'
import {
  buildMcpApprovalScopeKey,
  buildMcpBatchApprovalArgs,
  filterMcpToolDefinitions,
  findMcpToolName,
  resolveMcpShortToolName,
} from './document-mcp-task.util'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'

export const EXCEL_MCP_BATCH_TOOL_NAME = '__excel_mcp_batch__'

const EXCEL_MCP_READ_TOOL_NAMES = new Set(['read_excel', 'review_excel'])

export class ExcelMcpNotReadyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExcelMcpNotReadyError'
  }
}

export interface ExcelReadSnapshot {
  sheetNames: string[]
  cellsBySheet: Record<string, Record<string, string>>
  mergesBySheet: Record<string, string[]>
}

export interface ExcelWorkingCopy {
  sourcePath: string
  workingPath: string
  fileName: string
  readSnapshot?: ExcelReadSnapshot
}

export function parseReadExcelToolResult(content: string): ExcelReadSnapshot | null {
  const trimmed = content.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
      sheets?: Array<{
        name?: string
        lines?: string[]
        merges?: string[]
      }>
    }
    if (!Array.isArray(parsed.sheets)) return null

    const sheetNames: string[] = []
    const cellsBySheet: Record<string, Record<string, string>> = {}
    const mergesBySheet: Record<string, string[]> = {}

    for (const sheet of parsed.sheets) {
      const name = String(sheet.name ?? '').trim()
      if (!name) continue
      sheetNames.push(name)
      const cells: Record<string, string> = {}
      for (const line of sheet.lines ?? []) {
        const tab = line.indexOf('\t')
        if (tab <= 0) continue
        const address = line.slice(0, tab).trim().toUpperCase()
        const value = line.slice(tab + 1)
        if (address) cells[address] = value
      }
      cellsBySheet[name] = cells
      mergesBySheet[name] = Array.isArray(sheet.merges) ? sheet.merges : []
    }

    if (sheetNames.length === 0) return null
    return { sheetNames, cellsBySheet, mergesBySheet }
  } catch {
    return null
  }
}

function excelWorkingStem(fileName: string): string {
  const base = fileName.replace(/[/\\]/g, '_')
  return base.replace(/\.(xlsx|xls)$/i, '') || 'workbook'
}

export async function assertExcelMcpReady(): Promise<number> {
  await ensureMcpServersConnected([EXCEL_MCP_SERVER_ID])
  const state = getMcpClientState(EXCEL_MCP_SERVER_ID)
  if (!state?.connected) {
    throw new ExcelMcpNotReadyError(
      `Excel MCP Server 连接失败：${state?.lastError ?? '请确认已构建 mcp-servers/excel 且 Node.js 20+ 可用'}`,
    )
  }

  const listed = await state.client.listTools()
  if (listed.tools.length === 0) {
    throw new ExcelMcpNotReadyError('Excel MCP Server 未返回任何工具')
  }

  const hasRead = listed.tools.some((tool) =>
    resolveExcelMcpShortToolName(tool.name).includes('read_excel'),
  )
  if (!hasRead) {
    throw new ExcelMcpNotReadyError('Excel MCP Server 缺少 read_excel 工具，请重新构建 excel-mcp-server')
  }

  return listed.tools.length
}

export function resolveExcelMcpShortToolName(toolName: string): string {
  return resolveMcpShortToolName(toolName, EXCEL_MCP_SERVER_ID, EXCEL_MCP_BATCH_TOOL_NAME)
}

export function isExcelMcpToolName(toolName: string): boolean {
  if (toolName === EXCEL_MCP_BATCH_TOOL_NAME) return true
  return (
    toolName.includes(EXCEL_MCP_SERVER_ID) ||
    ['read_excel', 'review_excel', 'modify_excel_cells', 'highlight_excel_cells'].includes(
      resolveExcelMcpShortToolName(toolName),
    )
  )
}

export function isExcelMcpEditToolName(toolName: string): boolean {
  if (!isExcelMcpToolName(toolName) || toolName === EXCEL_MCP_BATCH_TOOL_NAME) return false
  const shortName = resolveExcelMcpShortToolName(toolName)
  return !EXCEL_MCP_READ_TOOL_NAMES.has(shortName)
}

export function filterExcelMcpToolDefinitions(tools: ToolDefinition[]): ToolDefinition[] {
  return filterMcpToolDefinitions(tools, EXCEL_MCP_SERVER_ID, [
    'read_excel',
    'review_excel',
    'modify_excel_cells',
    'highlight_excel_cells',
  ])
}

export function findExcelMcpToolName(
  tools: ToolDefinition[],
  shortName: string,
): string | null {
  return findMcpToolName(tools, shortName)
}

export function buildExcelMcpBatchApprovalArgs(workingCopies: ExcelWorkingCopy[]): string {
  return buildMcpBatchApprovalArgs(
    '本次将调用 modify_excel_cells / highlight_excel_cells 写入 Excel 修订版',
    workingCopies.map((copy) => copy.workingPath),
  )
}

export function buildExcelMcpApprovalScopeKey(assistantMessageId: string): string {
  return buildMcpApprovalScopeKey('excel-mcp', assistantMessageId)
}

export async function prepareExcelWorkingCopies(options: {
  sourcePaths: Array<{ sourcePath: string; fileName: string }>
  workdir: string
  onStatus?: (message: string) => void
}): Promise<ExcelWorkingCopy[]> {
  const copies: ExcelWorkingCopy[] = []

  for (const item of options.sourcePaths) {
    const safeStem = excelWorkingStem(item.fileName)
    const workingName = `修订版_${safeStem}.xlsx`
    const workingPath = join(options.workdir, workingName)
    await mkdir(dirname(workingPath), { recursive: true })
    await copyFile(item.sourcePath, workingPath)
    options.onStatus?.(`已复制修订版：${workingName}`)
    copies.push({
      sourcePath: item.sourcePath,
      workingPath,
      fileName: item.fileName,
    })
  }

  return copies
}

export async function bootstrapExcelMcpRead(options: {
  chatMessages: ChatMessage[]
  tools: ToolDefinition[]
  workingCopies: ExcelWorkingCopy[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
}): Promise<void> {
  const readTool = findExcelMcpToolName(options.tools, 'read_excel')
  const reviewTool = findExcelMcpToolName(options.tools, 'review_excel')
  if (!readTool) {
    throw new ExcelMcpNotReadyError('Excel MCP 工具集中未找到 read_excel')
  }

  for (const copy of options.workingCopies) {
    for (const [toolName, shortLabel] of [
      [readTool, 'read_excel'],
      [reviewTool, 'review_excel'],
    ] as const) {
      if (!toolName) continue
      const callId = `excel-bootstrap-${shortLabel}-${randomUUID()}`
      const args = JSON.stringify({ filePath: copy.workingPath })

      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        status: 'running',
      })

      let result: string
      try {
        result = await executeToolCall(toolName, args, options.toolContext)
      } catch (error) {
        result = `Error: ${toErrorMessage(error, `${shortLabel} 失败`)}`
      }

      const snippet = result.length > 12000 ? `${result.slice(0, 12000)}…` : result
      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        result: snippet,
        status: result.startsWith('Error:') ? 'failed' : 'done',
      })

      if (shortLabel === 'read_excel' && !result.startsWith('Error:')) {
        const snapshot = parseReadExcelToolResult(result)
        if (snapshot) copy.readSnapshot = snapshot
      }

      options.chatMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ id: callId, name: toolName, arguments: args }],
      })
      options.chatMessages.push({
        role: 'tool',
        tool_call_id: callId,
        content: result,
      })
    }
  }
}

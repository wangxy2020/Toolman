import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { toErrorMessage } from '@toolman/shared'
import { executeToolCall, type ToolExecutionContext } from '../tool-executor.service'
import {
  buildLegacyWordConversionStatusMessage,
  docxWorkingStem,
  materializeDocxForMcp,
} from '../office-to-docx.service'
import { findDocxReadDocumentToolName } from './tools'
import { DocxMcpNotReadyError, type DocxWorkingCopy } from './constants'

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

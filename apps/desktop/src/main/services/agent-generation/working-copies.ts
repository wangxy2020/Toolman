import type { ContentBlock } from '@toolman/shared'
import { DOCX_MCP_SERVER_ID, EXCEL_MCP_SERVER_ID, isDocxMcpSourceFileBlock, isExcelMcpSourceFileBlock } from '@toolman/shared'
import type { parseAssistantRuntime } from '../agent.service'
import {
  assertDocxMcpReady,
  prepareDocxWorkingCopies,
  type DocxWorkingCopy,
} from '../docx-mcp-task.service'
import {
  assertExcelMcpReady,
  prepareExcelWorkingCopies,
  type ExcelWorkingCopy,
} from '../excel-mcp-task.service'
import { resolveWorkingDirectory } from '../permission.service'
import { resolveAttachmentReadPath } from '../resolve-user-content-blocks.service'
import type { GenerationStreamContext } from './types'

export type GenerationWorkingCopies = {
  docxBlocks: Extract<ContentBlock, { type: 'file' }>[]
  docxTaskActive: boolean
  docxWorkingCopies?: DocxWorkingCopy[]
  excelBlocks: Extract<ContentBlock, { type: 'file' }>[]
  excelTaskActive: boolean
  excelWorkingCopies?: ExcelWorkingCopy[]
}

export async function prepareGenerationWorkingCopies(options: {
  generationBlocks: ContentBlock[]
  enableTools: boolean
  mcpServerIds: string[]
  runtime: ReturnType<typeof parseAssistantRuntime>
  stream: GenerationStreamContext
}): Promise<GenerationWorkingCopies> {
  const docxBlocks = options.generationBlocks.filter(
    (block): block is Extract<ContentBlock, { type: 'file' }> =>
      block.type === 'file' && isDocxMcpSourceFileBlock(block),
  )
  const docxTaskActive =
    options.enableTools &&
    options.mcpServerIds.includes(DOCX_MCP_SERVER_ID) &&
    docxBlocks.length > 0

  const excelBlocks = options.generationBlocks.filter(
    (block): block is Extract<ContentBlock, { type: 'file' }> =>
      block.type === 'file' && isExcelMcpSourceFileBlock(block),
  )
  const excelTaskActive =
    options.enableTools &&
    options.mcpServerIds.includes(EXCEL_MCP_SERVER_ID) &&
    excelBlocks.length > 0

  let docxWorkingCopies: DocxWorkingCopy[] | undefined
  if (docxTaskActive) {
    options.stream.appendStatus('正在连接 DOCX MCP Server…\n')
    await assertDocxMcpReady()
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    docxWorkingCopies = await prepareDocxWorkingCopies({
      workdir,
      sourcePaths: docxBlocks.map((block) => ({
        sourcePath: resolveAttachmentReadPath(block),
        fileName: block.name,
      })),
      onStatus: (message) => options.stream.appendStatus(`${message}\n`),
    })
    options.stream.appendStatus('修订版文档已就绪…\n')
  }

  let excelWorkingCopies: ExcelWorkingCopy[] | undefined
  if (excelTaskActive) {
    options.stream.appendStatus('正在连接 Excel MCP Server…\n')
    await assertExcelMcpReady()
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    excelWorkingCopies = await prepareExcelWorkingCopies({
      workdir,
      sourcePaths: excelBlocks.map((block) => ({
        sourcePath: resolveAttachmentReadPath(block),
        fileName: block.name,
      })),
      onStatus: (message) => options.stream.appendStatus(`${message}\n`),
    })
    options.stream.appendStatus('修订版 Excel 已就绪…\n')
  }

  return {
    docxBlocks,
    docxTaskActive,
    docxWorkingCopies,
    excelBlocks,
    excelTaskActive,
    excelWorkingCopies,
  }
}

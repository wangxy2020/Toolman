import type { ContentBlock } from '@toolman/shared'
import { DOCX_MCP_SERVER_ID, EXCEL_MCP_SERVER_ID } from '@toolman/shared'
import { stageUserContentBlocks } from '../resolve-user-content-blocks.service'
import { throwIfAborted } from '../../utils/abort-signal'
import { prepareFileBlock } from './file-block'
import { isOcrChatModel, resolveModelSupportsVision } from './vision'

export function contentBlocksNeedModelPrepare(blocks: ContentBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === 'image') return !block.blobHash?.trim()
    if (block.type !== 'file') return false
    if (block.content?.trim()) return false
    if (block.visionPages && block.visionPages.length > 0) return false
    return true
  })
}

export async function prepareChatAttachmentsForModel(options: {
  blocks: ContentBlock[]
  modelId: string
  workspaceId?: string
  mcpServerIds?: string[]
  documentOcrEnabled?: boolean
  signal?: AbortSignal
  onStatus?: (message: string) => void
}): Promise<ContentBlock[]> {
  const staged = await stageUserContentBlocks(options.blocks)
  const supportsVision = resolveModelSupportsVision(options.modelId)
  const ocrChatModel = isOcrChatModel(options.modelId)
  const docxMcpEnabled = options.mcpServerIds?.includes(DOCX_MCP_SERVER_ID) ?? false
  const excelMcpEnabled = options.mcpServerIds?.includes(EXCEL_MCP_SERVER_ID) ?? false
  const prepared: ContentBlock[] = []

  for (const block of staged) {
    throwIfAborted(options.signal)

    if (block.type === 'image') {
      if (!block.blobHash?.trim()) {
        throw new Error('图片附件尚未就绪，请重新选择后发送')
      }
      prepared.push(block)
      continue
    }

    if (block.type !== 'file') {
      prepared.push(block)
      continue
    }

    if (block.content?.trim() || (block.visionPages && block.visionPages.length > 0)) {
      prepared.push(block)
      continue
    }

    prepared.push(
      await prepareFileBlock(block, supportsVision, {
        workspaceId: options.workspaceId,
        documentOcrEnabled: options.documentOcrEnabled,
        ocrChatModel,
        docxMcpEnabled,
        excelMcpEnabled,
        signal: options.signal,
        onStatus: options.onStatus,
      }),
    )
  }

  return prepared
}

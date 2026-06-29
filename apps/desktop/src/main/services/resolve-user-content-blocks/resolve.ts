import { basename } from 'node:path'
import type { ContentBlock } from '@toolman/shared'
import { throwIfAborted, withAbortSignal } from '../../utils/abort-signal'
import { resolveAttachmentReadPath, type ParsedChatFile } from './helpers'
import { parseChatFileAttachment } from './parse'
import { parseChatImageAttachment, stageUserContentBlocks } from './stage'

export async function ensureResolvedUserContentBlocks(
  blocks: ContentBlock[],
  workspaceId: string,
  options?: { documentOcrEnabled?: boolean },
): Promise<ContentBlock[]> {
  const staged = await stageUserContentBlocks(blocks)
  if (!contentBlocksNeedResolution(staged)) return staged
  return resolveUserContentBlocks(staged, workspaceId, options)
}

function contentBlocksNeedResolution(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) =>
      (block.type === 'file' && !block.content?.trim()) ||
      (block.type === 'image' && !block.blobHash?.trim()),
  )
}

export async function resolveUserContentBlocks(
  blocks: ContentBlock[],
  workspaceId: string,
  options?: {
    documentOcrEnabled?: boolean
    onStatus?: (message: string) => void
    signal?: AbortSignal
  },
): Promise<ContentBlock[]> {
  const resolved: ContentBlock[] = []

  for (const block of blocks) {
    throwIfAborted(options?.signal)

    if (block.type === 'file') {
      if (block.content?.trim()) {
        resolved.push(block)
        continue
      }

      const readPath = resolveAttachmentReadPath(block)
      options?.onStatus?.(`正在解析「${block.name || basename(block.path)}」…`)
      let parsed: ParsedChatFile
      try {
        parsed = await withAbortSignal(
          parseChatFileAttachment(readPath, {
            workspaceId,
            documentOcrEnabled: options?.documentOcrEnabled,
            sourcePath: block.path,
            fileName: block.name,
            mimeType: block.mimeType,
            onStatus: options?.onStatus,
          }),
          options?.signal,
        )
      } catch (error) {
        const label = block.name || basename(block.path)
        const detail = error instanceof Error ? error.message.trim() : ''
        const message = detail || '读取或解析文件失败'
        throw new Error(`「${label}」${message}`)
      }
      resolved.push({
        ...block,
        name: block.name || parsed.name,
        content: parsed.content,
        mimeType: parsed.mimeType,
        truncated: parsed.truncated,
      })
      continue
    }

    if (block.type === 'image') {
      if (block.blobHash?.trim()) {
        resolved.push(block)
        continue
      }

      if (!block.path) {
        throw new Error('图片附件缺少文件路径')
      }

      const parsed = parseChatImageAttachment(block.path)
      resolved.push({
        ...block,
        blobHash: parsed.blobHash,
        mimeType: parsed.mimeType,
        alt: block.alt ?? parsed.name,
      })
      continue
    }

    resolved.push(block)
  }

  return resolved
}

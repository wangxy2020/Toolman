import type { ContentBlock } from '@toolman/shared'
import { getBlobStoragePath, writeBlobFromPath } from '../blob.service'
import { stageAttachmentPath } from '../chat-attachment-stage.service'
import type { ParsedChatImage } from './helpers'

export function parseChatImageAttachment(path: string): ParsedChatImage {
  const staged = stageAttachmentPath(path)
  if (staged.kind !== 'image') {
    throw new Error('不支持的图片格式')
  }

  return {
    name: staged.name,
    blobHash: staged.blobHash,
    mimeType: staged.mimeType,
  }
}

export function contentBlocksNeedStaging(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) =>
      (block.type === 'file' && !block.blobHash?.trim()) ||
      (block.type === 'image' && !block.blobHash?.trim()),
  )
}

export function contentBlocksNeedResolution(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) =>
      (block.type === 'file' && !block.content?.trim()) ||
      (block.type === 'image' && !block.blobHash?.trim()),
  )
}

/** 将附件复制到应用本地存储（快速），避免依赖工作区外原始路径 */
export async function stageUserContentBlocks(blocks: ContentBlock[]): Promise<ContentBlock[]> {
  const staged: ContentBlock[] = []

  for (const block of blocks) {
    if (block.type === 'file') {
      if (block.blobHash?.trim()) {
        staged.push(block)
        continue
      }

      if (!block.path) {
        throw new Error(`附件「${block.name}」缺少文件路径`)
      }

      const record = writeBlobFromPath(block.path)
      staged.push({
        ...block,
        blobHash: record.hash,
        mimeType: block.mimeType ?? record.mimeType,
      })
      continue
    }

    if (block.type === 'image') {
      if (block.blobHash?.trim()) {
        staged.push(block)
        continue
      }

      if (!block.path) {
        throw new Error('图片附件缺少文件路径')
      }

      const parsed = parseChatImageAttachment(block.path)
      staged.push({
        ...block,
        blobHash: parsed.blobHash,
        mimeType: parsed.mimeType,
        alt: block.alt ?? parsed.name,
      })
      continue
    }

    staged.push(block)
  }

  return staged
}

export { getBlobStoragePath }

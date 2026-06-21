import type { ContentBlock } from '@toolman/shared'

export interface PendingAttachment {
  path: string
  name: string
  blobHash?: string
  mimeType?: string
  kind?: 'file' | 'image'
}

function isImageAttachmentPath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(path)
}

export function pendingAttachmentsToContentBlocks(
  attachments: PendingAttachment[],
  userText: string,
): ContentBlock[] {
  const blocks: ContentBlock[] = []

  for (const attachment of attachments) {
    const isImage = attachment.kind === 'image' || isImageAttachmentPath(attachment.path)
    if (isImage) {
      blocks.push({
        type: 'image',
        path: attachment.path,
        alt: attachment.name,
        mimeType: attachment.mimeType ?? 'application/octet-stream',
        blobHash: attachment.blobHash ?? '',
      })
    } else {
      blocks.push({
        type: 'file',
        name: attachment.name,
        path: attachment.path,
        content: '',
        blobHash: attachment.blobHash ?? '',
        mimeType: attachment.mimeType,
      })
    }
  }

  const trimmed = userText.trim()
  if (trimmed) {
    blocks.push({ type: 'text', text: trimmed })
  }

  return blocks
}

export function getUserMessageCopyText(blocks: ContentBlock[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type === 'file') {
      lines.push(`附件：${block.name}`)
    }
    if (block.type === 'image' && block.alt) {
      lines.push(`图片：${block.alt}`)
    }
    if (block.type === 'text' && block.text.trim()) {
      lines.push(block.text.trim())
    }
  }
  return lines.join('\n')
}

export function contentBlocksToPendingAttachments(blocks: ContentBlock[]): PendingAttachment[] {
  const attachments: PendingAttachment[] = []

  for (const block of blocks) {
    if (block.type === 'file' && block.path) {
      attachments.push({
        path: block.path,
        name: block.name,
        blobHash: block.blobHash,
        mimeType: block.mimeType,
        kind: 'file',
      })
      continue
    }

    if (block.type === 'image' && block.path) {
      attachments.push({
        path: block.path,
        name: block.alt?.trim() || block.path.split(/[/\\]/).pop() || 'image',
        blobHash: block.blobHash,
        mimeType: block.mimeType,
        kind: 'image',
      })
    }
  }

  return attachments
}

export function getUserVisibleText(blocks: ContentBlock[]): string {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim()
}

export function contentBlocksHaveAttachments(blocks: ContentBlock[]): boolean {
  return blocks.some((block) => block.type === 'file' || block.type === 'image')
}

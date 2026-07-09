import { basename } from 'node:path'
import { toErrorMessage } from '@toolman/shared'
import { isImageFilePath } from '@toolman/knowledge'
import {
  ChatStageAttachmentsInputSchema,
  ChatStageAttachmentsOutputSchema,
  ipcOk,
} from '@toolman/shared'
import { writeBlobFromBuffer, writeBlobFromPath } from './blob.service'

function extensionForImageMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/bmp') return 'bmp'
  return 'png'
}

export function stageAttachmentPath(path: string) {
  const record = writeBlobFromPath(path)
  return {
    path,
    name: basename(path),
    blobHash: record.hash,
    mimeType: record.mimeType,
    kind: isImageFilePath(path) ? ('image' as const) : ('file' as const),
  }
}

export function stageAttachmentBlob(input: {
  base64: string
  mimeType: string
  name?: string
}) {
  const data = Buffer.from(input.base64, 'base64')
  if (data.byteLength === 0) {
    throw new Error('剪贴板图片为空')
  }

  const record = writeBlobFromBuffer(data, input.mimeType)
  const fileName =
    input.name?.trim() || `paste-${Date.now()}.${extensionForImageMime(input.mimeType)}`

  return {
    path: `clipboard://${record.hash}/${fileName}`,
    name: fileName,
    blobHash: record.hash,
    mimeType: record.mimeType,
    kind: 'image' as const,
  }
}

export function stageChatAttachments(input: unknown) {
  const data = ChatStageAttachmentsInputSchema.parse(input)
  const items: Array<{
    path: string
    name: string
    blobHash: string
    mimeType: string
    kind: 'file' | 'image'
  }> = []
  const errors: Array<{ path: string; message: string }> = []

  for (const path of data.paths) {
    try {
      items.push(stageAttachmentPath(path))
    } catch (error) {
      errors.push({
        path,
        message: toErrorMessage(error, '暂存文件失败'),
      })
    }
  }

  for (const blob of data.blobs) {
    try {
      items.push(stageAttachmentBlob(blob))
    } catch (error) {
      errors.push({
        path: blob.name?.trim() || 'clipboard-image',
        message: toErrorMessage(error, '暂存剪贴板图片失败'),
      })
    }
  }

  return ipcOk(
    ChatStageAttachmentsOutputSchema.parse({
      items,
      ...(errors.length > 0 ? { errors } : {}),
    }),
  )
}

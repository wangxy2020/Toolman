import { basename } from 'node:path'
import { toErrorMessage } from '@toolman/shared'
import { isImageFilePath } from '@toolman/knowledge'
import {ChatStageAttachmentsInputSchema,
  ChatStageAttachmentsOutputSchema,
  ipcOk } from '@toolman/shared'
import { writeBlobFromPath } from './blob.service'

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

  return ipcOk(
    ChatStageAttachmentsOutputSchema.parse({
      items,
      ...(errors.length > 0 ? { errors } : {}),
    }),
  )
}

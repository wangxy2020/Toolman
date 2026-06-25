import { statSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { isImageFilePath } from '@toolman/knowledge'
import {FileReadForChatInputSchema,
  FileReadForChatOutputSchema,
  ipcOk } from '@toolman/shared'
import { getDefaultWorkspace } from './workspace.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'
import { assertPathsWithinAllowedRoots } from './path-sandbox.service'
import {
  parseChatFileAttachment,
  parseChatImageAttachment,
} from './resolve-user-content-blocks.service'

function resolveChatWorkspaceId(workspaceId?: string): string | null {
  if (workspaceId) return workspaceId
  return getDefaultWorkspace()?.id ?? null
}

export async function readFilesForChat(input: unknown) {
  const data = FileReadForChatInputSchema.parse(input)
  const workspaceId = resolveChatWorkspaceId(data.workspaceId)
  const documentOcrEnabled = data.documentOcrEnabled ?? isDocumentOcrEnabled()
  const maxBytes = data.maxBytesPerFile

  const files: Array<{
    path: string
    name: string
    content: string
    mimeType: string
    truncated?: boolean
  }> = []
  const images: Array<{
    path: string
    name: string
    blobHash: string
    mimeType: string
  }> = []
  const errors: Array<{ path: string; message: string }> = []

  let allowedPaths: string[]
  try {
    allowedPaths = assertPathsWithinAllowedRoots(data.paths)
  } catch (error) {
    return ipcOk(
      FileReadForChatOutputSchema.parse({
        files: [],
        images: [],
        errors: data.paths.map((path) => ({
          path,
          message: toErrorMessage(error, '路径不在允许访问的范围内'),
        })),
      }),
    )
  }

  for (const path of allowedPaths) {
    try {
      const stat = statSync(path)
      if (!stat.isFile()) {
        errors.push({ path, message: '不是有效文件' })
        continue
      }

      if (isImageFilePath(path)) {
        const parsed = parseChatImageAttachment(path)
        images.push({
          path,
          name: parsed.name,
          blobHash: parsed.blobHash,
          mimeType: parsed.mimeType,
        })
        continue
      }

      const parsed = await parseChatFileAttachment(path, {
        workspaceId,
        documentOcrEnabled,
        maxBytes,
      })
      files.push({
        path,
        name: parsed.name,
        content: parsed.content,
        mimeType: parsed.mimeType,
        ...(parsed.truncated ? { truncated: true } : {}),
      })
    } catch (error) {
      errors.push({
        path,
        message: toErrorMessage(error, '读取文件失败'),
      })
    }
  }

  return ipcOk(
    FileReadForChatOutputSchema.parse({
      files,
      images,
      ...(errors.length > 0 ? { errors } : {}),
    }),
  )
}

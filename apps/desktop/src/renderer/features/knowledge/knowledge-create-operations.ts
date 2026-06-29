import { IpcChannel } from '@toolman/shared'
import {
  countKnowledgeFilesByType,
  getCommonParentPath,
  type KnowledgeFileTypeCount,
} from './knowledge-file-types'
import type { KnowledgeSourcePick } from './knowledge-create-types'
import { deriveKnowledgeBaseName } from './knowledge-create-utils'

export type SourcePickResult =
  | { ok: true; sourcePick: KnowledgeSourcePick; derivedName?: string }
  | { ok: false; error: string }

export async function pickKnowledgeSources(
  baseFolderPath: string | null,
): Promise<SourcePickResult | null> {
  const pickResult = await window.api.invoke(IpcChannel.DialogSelectFilesOrFolders, {
    defaultPath: baseFolderPath ?? undefined,
  })
  if (!pickResult.ok) {
    return { ok: false, error: pickResult.error.message }
  }

  const { items } = pickResult.data as { items: Array<{ path: string; isDirectory: boolean }> }
  if (items.length === 0) return null

  const files = items.filter((item) => !item.isDirectory)
  const folders = items.filter((item) => item.isDirectory)

  if (files.length > 0) {
    const filePaths = files.map((item) => item.path)
    const fileCounts = countKnowledgeFilesByType(filePaths)
    const nextPick: KnowledgeSourcePick = {
      mode: 'files',
      parentPath: getCommonParentPath(filePaths),
      filePaths,
      totalFiles: filePaths.length,
      fileCounts,
    }
    return { ok: true, sourcePick: nextPick, derivedName: deriveKnowledgeBaseName(nextPick) ?? undefined }
  }

  const folderPath = folders[0]?.path
  if (!folderPath) return null

  const scanResult = await window.api.invoke(IpcChannel.KnowledgeFolderScanPreview, {
    folderPath,
  })
  if (!scanResult.ok) {
    return { ok: false, error: scanResult.error.message }
  }

  const data = scanResult.data as {
    total: number
    counts: KnowledgeFileTypeCount[]
  }

  if (data.total > 0) {
    const nextPick: KnowledgeSourcePick = {
      mode: 'folder-with-files',
      folderPath,
      totalFiles: data.total,
      fileCounts: data.counts,
    }
    return { ok: true, sourcePick: nextPick, derivedName: deriveKnowledgeBaseName(nextPick) ?? undefined }
  }

  const nextPick: KnowledgeSourcePick = {
    mode: 'folder-empty',
    folderPath,
  }
  return { ok: true, sourcePick: nextPick, derivedName: deriveKnowledgeBaseName(nextPick) ?? undefined }
}

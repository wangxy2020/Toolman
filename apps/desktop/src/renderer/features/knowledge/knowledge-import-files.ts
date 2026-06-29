import { IpcChannel } from '@toolman/shared'

import { buildIngestPaths } from './knowledge-import-paths'

export type { DefaultFolderKnowledgeKind } from './knowledge-import-default-folder'
export { ensureDefaultFolderKb } from './knowledge-import-default-folder'
export type { ImportTarget } from './knowledge-import-paths'
export {
  buildIngestPaths,
  buildStoragePathForKb,
  resolveDefaultKbStoragePath,
  resolveKnowledgeImportTarget,
  resolveKnowledgeRootFromDefaultStorage,
  resolveKnowledgeSectionRoots,
} from './knowledge-import-paths'

export async function importFilesToKnowledgeStorage(options: {
  workspaceId: string
  storagePath: string
  filePaths: string[]
  setError: (message: string | null) => void
}): Promise<string[] | null> {
  const { storagePath, filePaths, setError } = options
  if (filePaths.length === 0) return null

  if (!storagePath.trim()) {
    setError('知识库存储路径未就绪，请先在设置中配置存储目录')
    return null
  }

  setError(null)

  const ensureResult = await window.api.invoke(IpcChannel.KnowledgeBaseStorageEnsure, {
    path: storagePath,
  })
  if (!ensureResult.ok) {
    setError(ensureResult.error.message)
    return null
  }

  const importResult = await window.api.invoke(IpcChannel.KnowledgeFolderImportFiles, {
    folderPath: storagePath,
    filePaths,
  })
  if (!importResult.ok) {
    setError(importResult.error.message)
    return null
  }

  const data = importResult.data as {
    imported: number
    skipped: number
    failed: Array<{ path: string; message: string }>
  }

  if (data.failed.length > 0 && data.imported === 0 && data.skipped === 0) {
    const detail = data.failed
      .map((item) => item.message)
      .slice(0, 2)
      .join('；')
    setError(`文件复制失败${detail ? `：${detail}` : ''}`)
    return null
  }

  return buildIngestPaths(storagePath, filePaths)
}

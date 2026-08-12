import { IpcChannel, type KnowledgeBase } from '@toolman/shared'
import { isOpenableLocalPath } from './knowledge-base-file-panel-utils'
import type { KnowledgeFilePanelItem } from './KnowledgeBaseFilePanel'
import {
  buildStoragePathForKb,
  ensureDefaultFolderKb,
  importFilesToKnowledgeStorage,
} from './knowledge-import-files'
import { SYSTEM_DEFAULT_FOLDER_KB_NAME } from './knowledge-sidebar-types'

export type SyncMoveTarget =
  | { type: 'default' }
  | { type: 'kb'; kb: KnowledgeBase }

export async function resolveSyncMoveTarget(options: {
  workspaceId: string
  target: SyncMoveTarget
  syncKnowledgeFolderPath: string | null
}): Promise<{ kbId: string; storagePath: string } | null> {
  const { workspaceId, target, syncKnowledgeFolderPath } = options

  if (target.type === 'default') {
    const ensured = await ensureDefaultFolderKb(workspaceId, 'sync')
    if (!ensured) return null
    const storagePath = buildStoragePathForKb(ensured.folderPath, SYSTEM_DEFAULT_FOLDER_KB_NAME)
    if (!storagePath) return null
    return { kbId: ensured.kb.id, storagePath }
  }

  const storagePath = buildStoragePathForKb(syncKnowledgeFolderPath, target.kb.name)
  if (!storagePath) return null
  return { kbId: target.kb.id, storagePath }
}

export async function moveKnowledgeFilesToSync(options: {
  workspaceId: string
  documentIds: string[]
  panelDocuments: KnowledgeFilePanelItem[]
  target: SyncMoveTarget
  syncKnowledgeFolderPath: string | null
  remove: (documentId: string) => Promise<boolean>
  setError: (message: string | null) => void
}): Promise<{ moved: number; failed: number } | null> {
  const {
    workspaceId,
    documentIds,
    panelDocuments,
    target,
    syncKnowledgeFolderPath,
    remove,
    setError,
  } = options

  const selected = panelDocuments.filter((doc) => documentIds.includes(doc.id))
  const movable = selected.filter((doc) => isOpenableLocalPath(doc.absolutePath))
  if (movable.length === 0) {
    setError('selected-files-need-path')
    return null
  }

  const resolved = await resolveSyncMoveTarget({
    workspaceId,
    target,
    syncKnowledgeFolderPath,
  })
  if (!resolved) {
    setError('同步知识库未就绪，请稍候再试')
    return null
  }

  const filePaths = movable.map((doc) => doc.absolutePath as string)
  const ingestPaths = await importFilesToKnowledgeStorage({
    workspaceId,
    storagePath: resolved.storagePath,
    filePaths,
    setError,
  })
  if (!ingestPaths || ingestPaths.length === 0) return null

  const ingestResult = await window.api.invoke(IpcChannel.KnowledgeDocumentIngest, {
    workspaceId,
    kbId: resolved.kbId,
    filePaths: ingestPaths,
  })
  if (!ingestResult.ok) {
    setError(ingestResult.error.message)
    return null
  }

  const ingestData = ingestResult.data as {
    ingested: number
    skipped: number
    failed: Array<{ path: string; message: string }>
  }

  const failedPaths = new Set(ingestData.failed.map((item) => item.path))
  let moved = 0
  let failed = 0

  for (let index = 0; index < movable.length; index += 1) {
    const doc = movable[index]
    const ingestPath = ingestPaths[index]
    if (!ingestPath || failedPaths.has(ingestPath)) {
      failed += 1
      continue
    }
    const deleted = await remove(doc.id)
    if (deleted) moved += 1
    else failed += 1
  }

  return { moved, failed }
}

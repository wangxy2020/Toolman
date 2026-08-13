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
  sourceKbId: string
  documentIds: string[]
  panelDocuments: KnowledgeFilePanelItem[]
  target: SyncMoveTarget
  syncKnowledgeFolderPath: string | null
  setError: (message: string | null) => void
}): Promise<{ moved: number; failed: number } | null> {
  const {
    workspaceId,
    sourceKbId,
    documentIds,
    panelDocuments,
    target,
    syncKnowledgeFolderPath,
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

  const items = movable.flatMap((doc, index) => {
    const destPath = ingestPaths[index]
    if (!destPath) return []
    return [{ documentId: doc.id, destPath }]
  })
  if (items.length === 0) return null

  const relocateResult = await window.api.invoke(IpcChannel.KnowledgeDocumentRelocate, {
    workspaceId,
    sourceKbId,
    destKbId: resolved.kbId,
    items,
  })
  if (!relocateResult.ok) {
    setError(relocateResult.error.message)
    return null
  }

  const relocateData = relocateResult.data as {
    moved: number
    ingested: number
    failed: Array<{ documentId: string; path: string; message: string }>
  }

  return {
    moved: relocateData.moved + relocateData.ingested,
    failed: relocateData.failed.length,
  }
}

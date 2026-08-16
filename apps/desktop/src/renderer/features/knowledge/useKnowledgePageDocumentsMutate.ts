import {
  addKnowledgeSitemap,
  addKnowledgeUrl,
  buildDeleteConfirmMessage,
  deleteKnowledgeDocuments,
  formatImportResultError,
  formatReindexResultError,
  formatSitemapImportResultError,
  importKnowledgeFiles,
} from './knowledge-page-operations'
import {
  moveKnowledgeFilesToSync,
  type SyncMoveTarget,
} from './knowledge-move-to-sync'
import type { KnowledgePageProps } from './knowledge-page-types'
import type { UseKnowledgePageStateResult } from './useKnowledgePageState'
import type { useKnowledgePageDocumentsList } from './useKnowledgePageDocumentsList'
import type { useKnowledgePageDocumentsSelection } from './useKnowledgePageDocumentsSelection'

type DocumentsListResult = ReturnType<typeof useKnowledgePageDocumentsList>
type DocumentsSelectionResult = ReturnType<typeof useKnowledgePageDocumentsSelection>

export function useKnowledgePageDocumentsMutate(
  {
    workspaceId,
    section,
    localFilesFolderPath,
    syncKnowledgeFolderPath,
    onKbChanged,
  }: Pick<
    KnowledgePageProps,
    | 'workspaceId'
    | 'section'
    | 'localFilesFolderPath'
    | 'syncKnowledgeFolderPath'
    | 'onKbChanged'
  >,
  state: Pick<
    UseKnowledgePageStateResult,
    | 't'
    | 'pendingDelete'
    | 'setPendingDelete'
    | 'showingDefaultLocalFilesFolder'
    | 'localFilesDefaultKb'
    | 'syncDefaultKb'
    | 'importTarget'
  >,
  list: Pick<DocumentsListResult, 'documents' | 'panelDocuments'>,
  selection: Pick<DocumentsSelectionResult, 'selectedIds' | 'setSelectedIds'>,
) {
  const {
    t,
    pendingDelete,
    setPendingDelete,
    showingDefaultLocalFilesFolder,
    localFilesDefaultKb,
    syncDefaultKb,
    importTarget,
  } = state
  const { documents, panelDocuments } = list
  const { selectedIds, setSelectedIds } = selection

  const requestDeleteDocuments = (ids: string[]) => {
    if (ids.length === 0) return
    setPendingDelete({
      ids,
      message: buildDeleteConfirmMessage(ids, panelDocuments, section),
    })
  }

  const confirmDeleteDocuments = async () => {
    if (!pendingDelete) return

    const ids = pendingDelete.ids
    setPendingDelete(null)

    const failed = await deleteKnowledgeDocuments({
      ids,
      remove: documents.remove,
    })
    onKbChanged?.()
    setSelectedIds(new Set())

    if (failed > 0) {
      documents.setError(`删除完成，${failed} 个文件删除失败`)
    }
  }

  const handleDeleteDocument = (id: string) => {
    requestDeleteDocuments([id])
  }

  const handleDeleteSelected = () => {
    requestDeleteDocuments(Array.from(selectedIds))
  }

  const handleImportFiles = async (paths: string[]) => {
    const result = await importKnowledgeFiles({
      workspaceId,
      section,
      paths,
      importTargetKbId: importTarget.kbId,
      importTargetStoragePath: importTarget.storagePath,
      showingDefaultLocalFilesFolder,
      localFilesFolderPath,
      localFilesDefaultFolderPath: localFilesDefaultKb.folderPath,
      setError: documents.setError,
      ingestFiles: documents.ingestFiles,
      load: documents.load,
      reloadLocalFilesDefaultKb: localFilesDefaultKb.reload,
    })

    onKbChanged?.()

    if (result) {
      const errorMessage = formatImportResultError(result)
      if (errorMessage) {
        documents.setError(errorMessage)
      }
    }
  }

  const handleAddUrl = async (url: string) => {
    await addKnowledgeUrl({
      workspaceId,
      kbId: importTarget.kbId,
      section,
      url,
      setError: documents.setError,
      load: documents.load,
    })
    onKbChanged?.()
  }

  const handleAddSitemap = async (sitemapUrl: string) => {
    const data = await addKnowledgeSitemap({
      workspaceId,
      kbId: importTarget.kbId,
      sitemapUrl,
      setError: documents.setError,
      load: documents.load,
    })
    onKbChanged?.()

    if (data) {
      const errorMessage = formatSitemapImportResultError(data)
      if (errorMessage) {
        documents.setError(errorMessage)
      }
    }
  }

  const handleReindexAll = async () => {
    if (!importTarget.kbId || panelDocuments.length === 0) return
    if (!window.confirm(`确定重建当前知识库全部 ${panelDocuments.length} 个文档的索引吗？`)) {
      return
    }

    const result = await documents.reindexAll()
    onKbChanged?.()

    if (result) {
      const errorMessage = formatReindexResultError(result)
      if (errorMessage) {
        documents.setError(errorMessage)
      }
    }
  }

  const handleMoveToSync = async (target: SyncMoveTarget) => {
    if (!workspaceId) return
    if (!importTarget.kbId) {
      documents.setError(t('knowledgePage.contextMenu.moveToSyncNeedSelection'))
      return
    }
    if (selectedIds.size === 0) {
      documents.setError(t('knowledgePage.contextMenu.moveToSyncNeedSelection'))
      return
    }

    const result = await moveKnowledgeFilesToSync({
      workspaceId,
      sourceKbId: importTarget.kbId,
      documentIds: Array.from(selectedIds),
      panelDocuments,
      target,
      syncKnowledgeFolderPath: syncKnowledgeFolderPath ?? syncDefaultKb.folderPath,
      setError: (message) => {
        if (message === 'selected-files-need-path') {
          documents.setError(t('knowledgePage.contextMenu.moveToSyncNeedPath'))
          return
        }
        documents.setError(message)
      },
    })

    await documents.load()
    onKbChanged?.()
    if (!result) return

    setSelectedIds(new Set())
    if (result.failed > 0) {
      documents.setError(
        t('knowledgePage.contextMenu.moveToSyncPartial', {
          moved: result.moved,
          failed: result.failed,
        }),
      )
      return
    }
    documents.setError(null)
  }

  return {
    handleDeleteDocument,
    handleDeleteSelected,
    handleImportFiles,
    handleAddUrl,
    handleAddSitemap,
    handleReindexAll,
    handleMoveToSync,
    confirmDeleteDocuments,
  }
}

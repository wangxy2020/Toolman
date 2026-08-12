import { useEffect, useMemo, useState } from 'react'
import { knowledgeDocumentToPanelItem } from './KnowledgeBaseFilePanel'
import { formatKnowledgeIngestStatusBarMessage } from './knowledge-file-display'
import {
  sortKnowledgeFilePanelItems,
  type KnowledgeFileSortField,
} from './knowledge-file-sort'
import { resolveKnowledgeFilesForChat } from './knowledge-chat-files'
import { useKnowledgeDocuments } from './useKnowledgeDocuments'
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
import {
  SYSTEM_DEFAULT_FOLDER_KB_NAMES,
} from './knowledge-sidebar-types'
import type { KnowledgePageProps } from './knowledge-page-types'
import type { UseKnowledgePageStateResult } from './useKnowledgePageState'

export function useKnowledgePageDocuments(
  {
    workspaceId,
    section,
    localFilesFolderPath,
    syncKnowledgeFolderPath,
    knowledgeItems,
    onKbChanged,
    onChatWithKnowledgeFiles,
  }: KnowledgePageProps,
  state: UseKnowledgePageStateResult,
) {
  const {
    t,
    activeId,
    sortField,
    setSortField,
    sortAscending,
    setSortAscending,
    dedupScanState,
    pendingDelete,
    setPendingDelete,
    isFileDedupView,
    showingDefaultLocalFilesFolder,
    showingDefaultSyncFolder,
    localFilesDefaultKb,
    syncDefaultKb,
    importTarget,
    showFileToolbar,
    defaultFolderInitializing,
  } = state

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const documents = useKnowledgeDocuments(workspaceId, importTarget.kbId)

  const syncMoveTargets = useMemo(
    () =>
      (knowledgeItems ?? []).filter(
        (item) =>
          item.kind === 'sync' &&
          !SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(item.name) &&
          item.id !== importTarget.kbId,
      ),
    [knowledgeItems, importTarget.kbId],
  )

  const showDefaultSyncTarget = !(
    showingDefaultSyncFolder ||
    (syncDefaultKb.kbId != null && syncDefaultKb.kbId === importTarget.kbId)
  )

  const panelDocuments = useMemo(() => {
    const items = documents.items.map((doc) => ({
      ...knowledgeDocumentToPanelItem(doc),
      ingestProgress: documents.ingestProgressById[doc.id] ?? null,
      ingestDetail: documents.ingestDetailById[doc.id] ?? null,
    }))
    return sortKnowledgeFilePanelItems(items, sortField, sortAscending)
  }, [
    documents.ingestDetailById,
    documents.ingestProgressById,
    documents.items,
    sortField,
    sortAscending,
  ])

  const chatAttachableFiles = useMemo(
    () => resolveKnowledgeFilesForChat(panelDocuments, selectedIds),
    [panelDocuments, selectedIds],
  )

  const panelLoading =
    defaultFolderInitializing || (documents.loading && Boolean(importTarget.kbId))

  const statusBar = useMemo(() => {
    if (documents.ingesting) {
      const formatted = formatKnowledgeIngestStatusBarMessage({
        items: documents.items,
        progressById: documents.ingestProgressById,
        detailById: documents.ingestDetailById,
        t,
      })
      return {
        priority: {
          tone: 'info' as const,
          text: formatted?.text ?? t('knowledgePage.importing'),
        },
        fallback: {
          tone: 'info' as const,
          text: formatted?.text ?? t('knowledgePage.importing'),
        },
        meta: formatted?.meta ?? null,
      }
    }
    if (panelLoading) {
      return {
        priority: null,
        fallback: { tone: 'info' as const, text: t('common.loading') },
        meta: null,
      }
    }
    if (isFileDedupView && dedupScanState.scanning) {
      const progress = dedupScanState.progress
      const text =
        progress && progress.total > 0
          ? `${t('knowledgePage.scanningDuplicates')} ${progress.scanned}/${progress.total}`
          : t('knowledgePage.scanningDuplicates')
      return {
        priority: null,
        fallback: { tone: 'info' as const, text },
        meta: null,
      }
    }
    return {
      priority: null,
      fallback: { tone: 'muted' as const, text: t('knowledgePage.ready') },
      meta: null,
    }
  }, [
    dedupScanState.progress,
    dedupScanState.scanning,
    documents.ingestDetailById,
    documents.ingestProgressById,
    documents.ingesting,
    documents.items,
    isFileDedupView,
    panelLoading,
    t,
  ])

  const statusFallback = statusBar.fallback
  const statusPriority = statusBar.priority
  const statusMeta = statusBar.meta

  useEffect(() => {
    setSelectedIds(new Set())
  }, [importTarget.kbId, activeId, section])

  useEffect(() => {
    const validIds = new Set(panelDocuments.map((item) => item.id))
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [panelDocuments])

  const handleChatWithFiles = () => {
    if (selectedIds.size === 0) {
      documents.setError(t('knowledgePage.toolbar.chatWithFiles'))
      return
    }
    const items = chatAttachableFiles
    if (items.length === 0) {
      documents.setError('所选文件无法带到聊天（仅支持有本地路径的文件）')
      return
    }
    onChatWithKnowledgeFiles?.(items)
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(panelDocuments.map((item) => item.id)))
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleSortFieldChange = (field: KnowledgeFileSortField) => {
    if (field === sortField) {
      setSortAscending((current) => !current)
      return
    }
    setSortField(field)
    setSortAscending(field === 'name')
  }

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
    if (selectedIds.size === 0) {
      documents.setError(t('knowledgePage.contextMenu.moveToSyncNeedSelection'))
      return
    }

    const result = await moveKnowledgeFilesToSync({
      workspaceId,
      documentIds: Array.from(selectedIds),
      panelDocuments,
      target,
      syncKnowledgeFolderPath: syncKnowledgeFolderPath ?? syncDefaultKb.folderPath,
      remove: documents.remove,
      setError: (message) => {
        if (message === 'selected-files-need-path') {
          documents.setError(t('knowledgePage.contextMenu.moveToSyncNeedPath'))
          return
        }
        documents.setError(message)
      },
    })

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

  const handleContextMenu = (event: React.MouseEvent, _documentId?: string) => {
    if (!showFileToolbar) return
    event.preventDefault()
    // Right-click opens the menu only — do not change row selection.
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  return {
    documents,
    selectedIds,
    contextMenu,
    setContextMenu,
    panelDocuments,
    chatAttachableFiles,
    panelLoading,
    statusFallback,
    statusPriority,
    statusMeta,
    syncMoveTargets,
    showDefaultSyncTarget,
    handleChatWithFiles,
    handleToggleSelect,
    handleSelectAll,
    handleClearSelection,
    handleSortFieldChange,
    handleDeleteDocument,
    handleDeleteSelected,
    handleImportFiles,
    handleAddUrl,
    handleAddSitemap,
    handleReindexAll,
    handleMoveToSync,
    handleContextMenu,
    confirmDeleteDocuments,
    onChatWithKnowledgeFiles,
  }
}

import { useEffect, useMemo, useState } from 'react'
import { knowledgeDocumentToPanelItem } from './KnowledgeBaseFilePanel'
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
import type { KnowledgePageProps } from './knowledge-page-types'
import type { UseKnowledgePageStateResult } from './useKnowledgePageState'

export function useKnowledgePageDocuments(
  {
    workspaceId,
    section,
    localFilesFolderPath,
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
    localFilesDefaultKb,
    importTarget,
    showFileToolbar,
    defaultFolderInitializing,
  } = state

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const documents = useKnowledgeDocuments(workspaceId, importTarget.kbId)

  const panelDocuments = useMemo(() => {
    const items = documents.items.map((doc) => ({
      ...knowledgeDocumentToPanelItem(doc),
      ingestProgress: documents.ingestProgressById[doc.id] ?? null,
    }))
    return sortKnowledgeFilePanelItems(items, sortField, sortAscending)
  }, [documents.ingestProgressById, documents.items, sortField, sortAscending])

  const chatAttachableFiles = useMemo(
    () => resolveKnowledgeFilesForChat(panelDocuments, selectedIds),
    [panelDocuments, selectedIds],
  )

  const panelLoading =
    defaultFolderInitializing || (documents.loading && Boolean(importTarget.kbId))

  const statusFallback = useMemo(() => {
    if (documents.ingesting) {
      return { tone: 'info' as const, text: t('knowledgePage.importing') }
    }
    if (panelLoading) {
      return { tone: 'info' as const, text: t('common.loading') }
    }
    if (isFileDedupView && dedupScanState.scanning) {
      const progress = dedupScanState.progress
      if (progress && progress.total > 0) {
        return {
          tone: 'info' as const,
          text: `${t('knowledgePage.scanningDuplicates')} ${progress.scanned}/${progress.total}`,
        }
      }
      return { tone: 'info' as const, text: t('knowledgePage.scanningDuplicates') }
    }
    return { tone: 'muted' as const, text: t('knowledgePage.ready') }
  }, [
    dedupScanState.progress,
    dedupScanState.scanning,
    documents.ingesting,
    isFileDedupView,
    panelLoading,
    t,
  ])

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

  const handleContextMenu = (event: React.MouseEvent, documentId?: string) => {
    if (!showFileToolbar) return
    event.preventDefault()
    if (documentId) {
      setSelectedIds((current) => {
        if (current.has(documentId)) return current
        return new Set([documentId])
      })
    }
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
    handleContextMenu,
    confirmDeleteDocuments,
    onChatWithKnowledgeFiles,
  }
}

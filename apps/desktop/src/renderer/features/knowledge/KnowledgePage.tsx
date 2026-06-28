import { ErrorBoundary } from '../../components/ErrorBoundary'
import { useI18n } from '../../i18n/useI18n'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IpcChannel, type KnowledgeBase } from '@toolman/shared'
import { IconFolderPlus, IconRefresh, IconChevronUp, IconSliders } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import {
  ModulePageStatusProvider,
  useRegisterModulePanelError,
} from '../../components/module-page-status'
import { getModulePageConfig } from '../modules/module-config'
import { KnowledgeBaseSettingsModal } from './KnowledgeBaseSettingsModal'
import { SharedKnowledgePanel } from './SharedKnowledgePanel'
import type { SharedKnowledgeEntry } from './useAllP2pSharedKnowledge'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  isSharedKnowledgeId,
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'
import {
  KnowledgeBaseFilePanel,
  knowledgeDocumentToPanelItem,
  type KnowledgeFilePanelItem,
} from './KnowledgeBaseFilePanel'
import { KnowledgeAddUrlModal } from './KnowledgeAddUrlModal'
import { KnowledgeFileDedupPanel, type DedupScanState } from './KnowledgeFileDedupPanel'
import { KnowledgeFileRegistryPanel } from './KnowledgeFileRegistryPanel'
import { getParentPath } from './knowledge-dedup-utils'
import { KnowledgeFileToolbar } from './KnowledgeFileToolbar'
import { KnowledgeFileContextMenu } from './KnowledgeFileContextMenu'
import {
  sortKnowledgeFilePanelItems,
  type KnowledgeFileSortField,
} from './knowledge-file-sort'
import { importFilesToKnowledgeStorage, resolveKnowledgeImportTarget, resolveKnowledgeSectionRoots, ensureDefaultFolderKb } from './knowledge-import-files'
import { resolveKnowledgeFilesForChat } from './knowledge-chat-files'
import { useDefaultFolderKnowledgeBase } from './useDefaultFolderKnowledgeBase'
import { useKnowledgeDocuments } from './useKnowledgeDocuments'
import type { SystemPaths } from '../chat/useSystemPaths'

type SettingsTarget = 'kb' | null

interface PendingFileDelete {
  ids: string[]
  message: string
}

interface Props {
  workspaceId: string | null
  section: KnowledgeSidebarSection
  activeId: string | null
  active: KnowledgeBase | null
  sharedKnowledgeEntries?: SharedKnowledgeEntry[]
  knowledgeFolderPath: string | null
  knowledgeFolderLoading?: boolean
  knowledgeFolderError?: string | null
  networkKnowledgeFolderPath: string | null
  networkKnowledgeFolderLoading?: boolean
  networkKnowledgeFolderError?: string | null
  localFilesFolderPath: string | null
  localFilesFolderLoading?: boolean
  localFilesFolderError?: string | null
  loading?: boolean
  error?: string | null
  onKbChanged?: () => void
  onKnowledgeFolderPathChanged?: (path: string) => void
  onKnowledgeFolderError?: (message: string | null) => void
  onNetworkKnowledgeFolderPathChanged?: (path: string) => void
  onNetworkKnowledgeFolderError?: (message: string | null) => void
  onLocalFilesFolderPathChanged?: (path: string) => void
  onLocalFilesFolderError?: (message: string | null) => void
  systemPaths?: SystemPaths | null
  onOpenNote?: (noteId: string) => boolean
  onChatWithKnowledgeFiles?: (items: KnowledgeFilePanelItem[]) => void
}

export function KnowledgePage({
  workspaceId,
  section,
  activeId,
  active,
  sharedKnowledgeEntries = [],
  knowledgeFolderPath,
  knowledgeFolderLoading,
  knowledgeFolderError,
  networkKnowledgeFolderPath,
  networkKnowledgeFolderLoading,
  networkKnowledgeFolderError,
  localFilesFolderPath,
  localFilesFolderLoading,
  localFilesFolderError,
  loading,
  error,
  onKbChanged,
  onKnowledgeFolderPathChanged: _onKnowledgeFolderPathChanged,
  onKnowledgeFolderError: _onKnowledgeFolderError,
  onNetworkKnowledgeFolderPathChanged: _onNetworkKnowledgeFolderPathChanged,
  onNetworkKnowledgeFolderError: _onNetworkKnowledgeFolderError,
  onLocalFilesFolderPathChanged: _onLocalFilesFolderPathChanged,
  onLocalFilesFolderError: _onLocalFilesFolderError,
  systemPaths: _systemPaths,
  onOpenNote,
  onChatWithKnowledgeFiles,
}: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig('knowledge', t)
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget>(null)
  const [showAddUrlModal, setShowAddUrlModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [sortField, setSortField] = useState<KnowledgeFileSortField>('createdAt')
  const [sortAscending, setSortAscending] = useState(false)
  const [dedupFolderPath, setDedupFolderPath] = useState<string | null>(null)
  const [dedupScanState, setDedupScanState] = useState<DedupScanState>({
    scanning: false,
    progress: null,
  })
  const [dedupRefreshToken, setDedupRefreshToken] = useState(0)
  const [settingsKbOverride, setSettingsKbOverride] = useState<KnowledgeBase | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingFileDelete | null>(null)

  const isFileDedupView =
    section === 'file-tools' && activeId === FILE_DEDUP_TOOL_ID
  const isFileRegistryView =
    section === 'file-tools' && activeId === FILE_REGISTRY_TOOL_ID

  useEffect(() => {
    if (!isFileDedupView) {
      setDedupFolderPath(null)
      setDedupScanState({ scanning: false, progress: null })
      setDedupRefreshToken(0)
    }
  }, [isFileDedupView])

  const showingDefaultFolder =
    section === 'local' && activeId === DEFAULT_KNOWLEDGE_FOLDER_ID
  const showingDefaultNetworkFolder =
    section === 'network' && activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID
  const showingDefaultLocalFilesFolder =
    section === 'local-files' && activeId === DEFAULT_LOCAL_FILES_FOLDER_ID
  const showingSavedSharedFolder =
    section === 'shared' &&
    active?.kind === 'shared' &&
    activeId != null &&
    !isSharedKnowledgeId(activeId)

  const activeSharedEntry = useMemo(() => {
    if (!activeId || !isSharedKnowledgeId(activeId)) return null
    return sharedKnowledgeEntries.find((entry) => entry.id === activeId) ?? null
  }, [activeId, sharedKnowledgeEntries])

  const showingLiveSharedFolder = section === 'shared' && activeSharedEntry != null

  const localDefaultKb = useDefaultFolderKnowledgeBase(
    workspaceId,
    'local',
    section === 'local',
  )
  const networkDefaultKb = useDefaultFolderKnowledgeBase(
    workspaceId,
    'network',
    section === 'network',
  )
  const localFilesDefaultKb = useDefaultFolderKnowledgeBase(
    workspaceId,
    'local_files',
    section === 'local-files',
  )

  const embedSettingsKb = useMemo(() => {
    if (active) return active
    if (showingDefaultFolder) return localDefaultKb.kb
    if (showingDefaultNetworkFolder) return networkDefaultKb.kb
    if (showingDefaultLocalFilesFolder) return localFilesDefaultKb.kb
    return null
  }, [
    active,
    showingDefaultFolder,
    showingDefaultNetworkFolder,
    showingDefaultLocalFilesFolder,
    localDefaultKb.kb,
    networkDefaultKb.kb,
    localFilesDefaultKb.kb,
  ])

  const sectionRoots = useMemo(
    () =>
      resolveKnowledgeSectionRoots({
        knowledgeFolderPath,
        networkKnowledgeFolderPath,
        localFilesFolderPath,
        localDefaultKbStoragePath: localDefaultKb.folderPath,
        networkDefaultKbStoragePath: networkDefaultKb.folderPath,
        localFilesDefaultKbStoragePath: localFilesDefaultKb.folderPath,
      }),
    [
      knowledgeFolderPath,
      networkKnowledgeFolderPath,
      localFilesFolderPath,
      localDefaultKb.folderPath,
      networkDefaultKb.folderPath,
      localFilesDefaultKb.folderPath,
    ],
  )

  const importTarget = useMemo(
    () =>
      resolveKnowledgeImportTarget({
        workspaceId,
        section,
        activeId,
        activeKbId: active?.id ?? null,
        activeKbName: active?.name ?? null,
        activeKbKind: active?.kind ?? null,
        defaultFolderKbId: localDefaultKb.kbId,
        defaultNetworkFolderKbId: networkDefaultKb.kbId,
        defaultLocalFilesKbId: localFilesDefaultKb.kbId,
        knowledgeFolderPath: sectionRoots.local,
        networkKnowledgeFolderPath: sectionRoots.network,
        localFilesFolderPath: sectionRoots.localFiles,
      }),
    [
      workspaceId,
      section,
      activeId,
      active,
      localDefaultKb.kbId,
      networkDefaultKb.kbId,
      localFilesDefaultKb.kbId,
      sectionRoots,
    ],
  )

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

  useEffect(() => {
    setSelectedIds(new Set())
    setSettingsKbOverride(null)
    setPendingDelete(null)
  }, [importTarget.kbId, activeId, section])

  useEffect(() => {
    const validIds = new Set(panelDocuments.map((item) => item.id))
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [panelDocuments])

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

  const deleteFileMessageSuffix =
    section === 'network'
      ? '删除后无法恢复。'
      : '程序记录与知识库文件夹中的副本都会删除，且无法恢复。'

  const requestDeleteDocuments = (ids: string[]) => {
    if (ids.length === 0) return

    const message =
      ids.length === 1
        ? `确定删除「${panelDocuments.find((item) => item.id === ids[0])?.title ?? '该文件'}」？${deleteFileMessageSuffix}`
        : `确定删除选中的 ${ids.length} 个文件？${deleteFileMessageSuffix}`

    setPendingDelete({ ids, message })
  }

  const confirmDeleteDocuments = async () => {
    if (!pendingDelete) return

    const ids = pendingDelete.ids
    setPendingDelete(null)

    let failed = 0
    for (const id of ids) {
      const ok = await documents.remove(id)
      if (!ok) failed += 1
    }
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
    if (section === 'network') {
      documents.setError('网络知识库仅支持添加网页 URL，不能导入本地文件')
      return
    }

    let kbId = importTarget.kbId
    let storagePath = importTarget.storagePath

    if (
      !kbId &&
      showingDefaultLocalFilesFolder &&
      workspaceId &&
      (localFilesFolderPath ?? localFilesDefaultKb.folderPath)
    ) {
      const ensured = await ensureDefaultFolderKb(workspaceId, 'local_files')
      if (ensured) {
        localFilesDefaultKb.reload()
        kbId = ensured.kb.id
        storagePath = ensured.folderPath
      }
    }

    if (!workspaceId || !kbId || !storagePath || paths.length === 0) {
      documents.setError('知识库未就绪，请先在设置中配置存储目录')
      return
    }

    const ingestPaths = await importFilesToKnowledgeStorage({
      workspaceId,
      storagePath,
      filePaths: paths,
      setError: documents.setError,
    })
    if (!ingestPaths) return

    let result: Awaited<ReturnType<typeof documents.ingestFiles>> = null
    if (kbId !== importTarget.kbId) {
      const ingestResponse = await window.api.invoke(IpcChannel.KnowledgeDocumentIngest, {
        workspaceId,
        kbId,
        filePaths: ingestPaths,
      })
      if (!ingestResponse.ok) {
        documents.setError(ingestResponse.error.message)
        return
      }
      result = ingestResponse.data as NonNullable<typeof result>
      localFilesDefaultKb.reload()
    } else {
      result = await documents.ingestFiles(ingestPaths)
      await documents.load()
    }

    onKbChanged?.()

    if (result && result.failed.length > 0) {
      const detail = result.failed.map((item) => item.message).slice(0, 2).join('；')
      documents.setError(
        `导入失败 ${result.failed.length} 个${detail ? `：${detail}` : ''}`,
      )
    } else if (result && result.skipped > 0 && (result.queued ?? 0) === 0 && result.failed.length === 0) {
      documents.setError(`所选文件已存在，跳过 ${result.skipped} 个`)
    }
  }

  const handleAddUrl = async (url: string) => {
    if (section === 'local' || section === 'local-files') {
      throw new Error('本地知识库仅支持上传文件，网页请添加到网络知识库')
    }

    if (!workspaceId || !importTarget.kbId) {
      throw new Error('知识库未就绪，请稍候再试')
    }

    documents.setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeSourceAddUrl, {
      workspaceId,
      kbId: importTarget.kbId,
      url,
    })

    if (!result.ok) {
      throw new Error(result.error.message)
    }

    const data = result.data as { outcome: 'ingested' | 'skipped' | 'failed'; message?: string }
    if (data.outcome === 'failed') {
      throw new Error(data.message ?? '网页导入失败')
    }

    await documents.load()
    onKbChanged?.()
  }

  const handleAddSitemap = async (sitemapUrl: string) => {
    if (!workspaceId || !importTarget.kbId) {
      throw new Error('知识库未就绪，请稍候再试')
    }

    documents.setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeSourceAddSitemap, {
      workspaceId,
      kbId: importTarget.kbId,
      sitemapUrl,
    })

    if (!result.ok) {
      throw new Error(result.error.message)
    }

    const data = result.data as {
      urlsFound: number
      ingested: number
      skipped: number
      failed: Array<{ path: string; message: string }>
    }

    await documents.load()
    onKbChanged?.()

    if (data.failed.length > 0) {
      const detail = data.failed
        .slice(0, 2)
        .map((item) => item.message)
        .join('；')
      documents.setError(
        `Sitemap 导入完成：成功 ${data.ingested}，跳过 ${data.skipped}，失败 ${data.failed.length}${detail ? `（${detail}）` : ''}`,
      )
    }
  }

  const handleReindexAll = async () => {
    if (!importTarget.kbId || panelDocuments.length === 0) return
    if (!window.confirm(`确定重建当前知识库全部 ${panelDocuments.length} 个文档的索引吗？`)) {
      return
    }

    const result = await documents.reindexAll()
    onKbChanged?.()

    if (result && result.failed.length > 0) {
      const detail = result.failed
        .slice(0, 2)
        .map((item) => item.message)
        .join('；')
      documents.setError(
        `重建完成：成功 ${result.ingested}，跳过 ${result.skipped}，失败 ${result.failed.length}${detail ? `（${detail}）` : ''}`,
      )
    }
  }

  const sectionLabel = getKnowledgeSidebarSectionLabel(section, t)
  const breadcrumbItemName =
    section === 'local'
      ? activeId === DEFAULT_KNOWLEDGE_FOLDER_ID
        ? SYSTEM_DEFAULT_FOLDER_KB_NAME
        : active?.name
      : section === 'network'
        ? activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID
          ? SYSTEM_DEFAULT_FOLDER_KB_NAME
          : active?.name
        : section === 'local-files'
          ? activeId === DEFAULT_LOCAL_FILES_FOLDER_ID
            ? SYSTEM_DEFAULT_FOLDER_KB_NAME
            : active?.name
          : section === 'shared'
            ? activeSharedEntry
              ? `[${activeSharedEntry.workspaceName}] ${activeSharedEntry.resource.name}`
              : active?.name
          : section === 'file-tools'
            ? activeId === FILE_REGISTRY_TOOL_ID
              ? t('knowledgePage.fileRegistry')
              : t('knowledgePage.fileDedup')
            : undefined

  const settingsEnabled = Boolean(
    section !== 'file-tools' &&
      (active ||
        (showingDefaultFolder && (localDefaultKb.kb || !localDefaultKb.loading)) ||
        (showingDefaultNetworkFolder && (networkDefaultKb.kb || !networkDefaultKb.loading)) ||
        (showingDefaultLocalFilesFolder &&
          (localFilesDefaultKb.kb || !localFilesDefaultKb.loading))),
  )

  const handleOpenSettings = () => {
    if (settingsKbOverride ?? embedSettingsKb) {
      setSettingsTarget('kb')
      return
    }

    if (!workspaceId || !showingDefaultLocalFilesFolder) return

    void ensureDefaultFolderKb(workspaceId, 'local_files').then((ensured) => {
      if (!ensured) return
      setSettingsKbOverride(ensured.kb)
      localFilesDefaultKb.reload()
      setSettingsTarget('kb')
    })
  }

  const handleSelectDedupFolder = async () => {
    const result = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
    if (!result.ok) return
    const path = (result.data as { path: string | null }).path
    if (!path) return
    setDedupFolderPath(path)
  }

  const handleDedupRefresh = () => {
    if (!dedupFolderPath) return
    setDedupRefreshToken((value) => value + 1)
  }

  const handleDedupGoParent = () => {
    if (!dedupFolderPath) return
    const parent = getParentPath(dedupFolderPath)
    if (parent) setDedupFolderPath(parent)
  }

  const defaultFolderInitializing =
    (showingDefaultFolder && (knowledgeFolderLoading || localDefaultKb.loading)) ||
    (showingDefaultNetworkFolder &&
      (networkKnowledgeFolderLoading || networkDefaultKb.loading)) ||
    (showingDefaultLocalFilesFolder &&
      (localFilesFolderLoading || localFilesDefaultKb.loading))

  const panelLoading =
    defaultFolderInitializing ||
    (documents.loading && Boolean(importTarget.kbId))

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

  const importReady =
    importTarget.ready ||
    (showingDefaultLocalFilesFolder &&
      Boolean(localFilesFolderPath ?? localFilesDefaultKb.folderPath) &&
      !localFilesDefaultKb.loading)

  const showFileToolbar =
    Boolean(workspaceId) &&
    (section === 'local' ||
      section === 'network' ||
      section === 'local-files' ||
      showingSavedSharedFolder)

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

  const isNetworkKbView = section === 'network'

  const renderKnowledgeFilePanel = () => (
    <KnowledgeBaseFilePanel
      documents={panelDocuments}
      loading={Boolean(panelLoading && documents.items.length === 0)}
      ingesting={importTarget.vectorized && documents.ingesting}
      showIndexActions={importTarget.vectorized}
      mode={isNetworkKbView ? 'url' : 'file'}
      importDisabled={!importReady}
      defaultImportPath={importTarget.defaultImportPath}
      selectedIds={selectedIds}
      onToggleSelect={handleToggleSelect}
      onImportFiles={(paths) => void handleImportFiles(paths)}
      onImportError={(message) => documents.setError(message)}
      onOpenAddUrl={() => setShowAddUrlModal(true)}
      onAddUrl={(url) => void handleAddUrl(url).catch((error) => {
        documents.setError(error instanceof Error ? error.message : '网页导入失败')
      })}
      onReindexDocument={(id) => void documents.reindex(id).then(() => onKbChanged?.())}
      onCancelIngestDocument={(id) => void documents.cancelIngest(id).then(() => onKbChanged?.())}
      onDeleteDocument={(id) => void handleDeleteDocument(id)}
      onOpenNote={onOpenNote}
      onContextMenu={handleContextMenu}
    />
  )

  const renderKnowledgeSectionContent = () => {
    if (section === 'local' || section === 'network' || section === 'local-files') {
      if (
        !showingDefaultFolder &&
        !showingDefaultNetworkFolder &&
        !showingDefaultLocalFilesFolder &&
        !active &&
        !loading
      ) {
        return (
          <KnowledgeBaseFilePanel
            documents={[]}
            onImportFiles={() => {}}
            importDisabled
          />
        )
      }

      if (
        active &&
        section === 'local' &&
        active.kind !== 'local' &&
        !showingDefaultFolder
      ) {
        return (
          <div className="tm-module-empty">
            <h2 className="tm-module-empty-title">{t('knowledgePage.sections.local')}</h2>
            <p className="tm-module-empty-hint">
              {t('knowledgePage.wrongSection', {
                name: translateKnowledgeFolderName(active.name, t),
                section: t('knowledgePage.sections.local'),
              })}
            </p>
          </div>
        )
      }

      if (
        active &&
        section === 'network' &&
        active.kind !== 'network' &&
        !showingDefaultNetworkFolder
      ) {
        return (
          <div className="tm-module-empty">
            <h2 className="tm-module-empty-title">{t('knowledgePage.sections.network')}</h2>
            <p className="tm-module-empty-hint">
              {t('knowledgePage.wrongSection', {
                name: translateKnowledgeFolderName(active.name, t),
                section: t('knowledgePage.sections.network'),
              })}
            </p>
          </div>
        )
      }

      if (
        active &&
        section === 'local-files' &&
        active.kind !== 'local_files' &&
        !showingDefaultLocalFilesFolder
      ) {
        return (
          <div className="tm-module-empty">
            <h2 className="tm-module-empty-title">{t('knowledgePage.sections.localFiles')}</h2>
            <p className="tm-module-empty-hint">
              {t('knowledgePage.wrongSection', {
                name: translateKnowledgeFolderName(active.name, t),
                section: t('knowledgePage.sections.localFiles'),
              })}
            </p>
          </div>
        )
      }

      return renderKnowledgeFilePanel()
    }

    return null
  }

  return (
    <ErrorBoundary title={t('errors.knowledge')}>
    <main className="tm-main">
      <KnowledgePageHeader
        sectionLabel={sectionLabel}
        kbName={
          section === 'shared' || isFileDedupView ? undefined : breadcrumbItemName
        }
        settingsEnabled={settingsEnabled}
        onOpenSettings={handleOpenSettings}
        dedupMode={isFileDedupView}
        dedupFolderPath={dedupFolderPath}
        dedupScanning={dedupScanState.scanning}
        onSelectDedupFolder={() => void handleSelectDedupFolder()}
        onDedupRefresh={handleDedupRefresh}
        onDedupGoParent={handleDedupGoParent}
        toolbar={
          showFileToolbar ? (
            <KnowledgeFileToolbar
              sortField={sortField}
              sortAscending={sortAscending}
              onSortFieldChange={handleSortFieldChange}
              onChatWithFiles={
                onChatWithKnowledgeFiles ? () => handleChatWithFiles() : undefined
              }
              chatDisabled={selectedIds.size === 0 || chatAttachableFiles.length === 0}
            />
          ) : null
        }
      />

      <ModulePageStatusProvider>
        <KnowledgePageStatusRegistry
          error={error}
          documentsError={documents.error}
          onClearDocumentsError={() => documents.setError(null)}
          knowledgeFolderError={knowledgeFolderError}
          networkKnowledgeFolderError={networkKnowledgeFolderError}
          localFilesFolderError={localFilesFolderError}
          localDefaultKbError={localDefaultKb.error}
          onClearLocalDefaultKbError={() => localDefaultKb.setError(null)}
          networkDefaultKbError={networkDefaultKb.error}
          onClearNetworkDefaultKbError={() => networkDefaultKb.setError(null)}
          localFilesDefaultKbError={localFilesDefaultKb.error}
          onClearLocalFilesDefaultKbError={() => localFilesDefaultKb.setError(null)}
        />

        <div className="tm-module-content">
        {!workspaceId ? (
          <div className="tm-module-empty">
            <h2 className="tm-module-empty-title">{config.contentEmptyTitle}</h2>
            <p className="tm-module-empty-hint">{t('knowledgePage.selectWorkspace')}</p>
          </div>
        ) : section === 'local' || section === 'network' || section === 'local-files' ? (
          renderKnowledgeSectionContent()
        ) : section === 'shared' ? (
          showingSavedSharedFolder ? (
            renderKnowledgeFilePanel()
          ) : showingLiveSharedFolder && activeSharedEntry ? (
            <SharedKnowledgePanel
              entry={activeSharedEntry}
              onOpenError={(message) => documents.setError(message)}
            />
          ) : (
            <div className="tm-module-empty">
              <h2 className="tm-module-empty-title">{t('knowledgePage.sections.shared')}</h2>
              <p className="tm-module-empty-hint">{t('sidebar.knowledge.noFolders')}</p>
            </div>
          )
        ) : section === 'file-tools' ? (
          workspaceId ? (
            isFileRegistryView ? (
              <KnowledgeFileRegistryPanel workspaceId={workspaceId} />
            ) : (
              <KnowledgeFileDedupPanel
                workspaceId={workspaceId}
                folderPath={dedupFolderPath}
                onFolderPathChange={setDedupFolderPath}
                onScanStateChange={setDedupScanState}
                refreshToken={dedupRefreshToken}
              />
            )
          ) : (
            <div className="tm-module-empty">
              <h2 className="tm-module-empty-title">{t('knowledgePage.sections.fileTools')}</h2>
              <p className="tm-module-empty-hint">{t('knowledgePage.selectWorkspace')}</p>
            </div>
          )
        ) : (
          <div className="tm-module-empty">
            <h2 className="tm-module-empty-title">{t('knowledgePage.sections.local')}</h2>
            <p className="tm-module-empty-hint">{config.contentEmptyHint}</p>
          </div>
        )}
        </div>

        <ModulePageStatusBar fallback={statusFallback} />
      </ModulePageStatusProvider>

      {settingsTarget === 'kb' && workspaceId && (settingsKbOverride ?? embedSettingsKb) ? (
        <KnowledgeBaseSettingsModal
          key={(settingsKbOverride ?? embedSettingsKb)!.id}
          workspaceId={workspaceId}
          kb={settingsKbOverride ?? embedSettingsKb!}
          nameReadOnly={
            showingDefaultFolder || showingDefaultNetworkFolder || showingDefaultLocalFilesFolder
          }
          defaultFolderKind={
            showingDefaultFolder
              ? 'local'
              : showingDefaultNetworkFolder
                ? 'network'
                : showingDefaultLocalFilesFolder
                  ? 'local_files'
                  : undefined
          }
          onClose={() => {
            setSettingsTarget(null)
            setSettingsKbOverride(null)
          }}
          onSaved={async () => {
            localDefaultKb.reload()
            networkDefaultKb.reload()
            localFilesDefaultKb.reload()
            await onKbChanged?.()
          }}
        />
      ) : null}
      {showAddUrlModal && isNetworkKbView ? (
        <KnowledgeAddUrlModal
          onClose={() => setShowAddUrlModal(false)}
          onSubmitUrl={handleAddUrl}
          onSubmitSitemap={handleAddSitemap}
        />
      ) : null}

      {contextMenu ? (
        <KnowledgeFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedIds.size}
          documentCount={panelDocuments.length}
          reindexAllDisabled={documents.ingesting}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
          onReindexAll={() => void handleReindexAll()}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('knowledgePage.deleteFile')}
          message={pendingDelete.message}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDeleteDocuments()}
        />
      ) : null}
    </main>
    </ErrorBoundary>
  )
}

function KnowledgePageStatusRegistry({
  error,
  documentsError,
  onClearDocumentsError,
  knowledgeFolderError,
  networkKnowledgeFolderError,
  localFilesFolderError,
  localDefaultKbError,
  onClearLocalDefaultKbError,
  networkDefaultKbError,
  onClearNetworkDefaultKbError,
  localFilesDefaultKbError,
  onClearLocalFilesDefaultKbError,
}: {
  error?: string | null
  documentsError: string | null
  onClearDocumentsError: () => void
  knowledgeFolderError?: string | null
  networkKnowledgeFolderError?: string | null
  localFilesFolderError?: string | null
  localDefaultKbError: string | null
  onClearLocalDefaultKbError: () => void
  networkDefaultKbError: string | null
  onClearNetworkDefaultKbError: () => void
  localFilesDefaultKbError: string | null
  onClearLocalFilesDefaultKbError: () => void
}) {
  useRegisterModulePanelError('knowledge-bases', error ?? null)
  useRegisterModulePanelError('knowledge-documents', documentsError, onClearDocumentsError)
  useRegisterModulePanelError('knowledge-folder-local', knowledgeFolderError ?? null)
  useRegisterModulePanelError('knowledge-folder-network', networkKnowledgeFolderError ?? null)
  useRegisterModulePanelError('knowledge-folder-local-files', localFilesFolderError ?? null)
  useRegisterModulePanelError(
    'knowledge-default-local',
    localDefaultKbError,
    onClearLocalDefaultKbError,
  )
  useRegisterModulePanelError(
    'knowledge-default-network',
    networkDefaultKbError,
    onClearNetworkDefaultKbError,
  )
  useRegisterModulePanelError(
    'knowledge-default-local-files',
    localFilesDefaultKbError,
    onClearLocalFilesDefaultKbError,
  )

  return null
}

function KnowledgePageHeader({
  sectionLabel,
  kbName,
  settingsEnabled,
  onOpenSettings,
  dedupMode = false,
  dedupFolderPath = null,
  dedupScanning = false,
  onSelectDedupFolder,
  onDedupRefresh,
  onDedupGoParent,
  toolbar,
}: {
  sectionLabel: string
  kbName?: string
  settingsEnabled: boolean
  onOpenSettings: () => void
  dedupMode?: boolean
  dedupFolderPath?: string | null
  dedupScanning?: boolean
  onSelectDedupFolder?: () => void
  onDedupRefresh?: () => void
  onDedupGoParent?: () => void
  toolbar?: ReactNode
}) {
  const { t } = useI18n()
  const config = getModulePageConfig('knowledge', t)

  return (
    <header className="tm-chat-header">
      <div className="tm-chat-breadcrumb tm-chat-breadcrumb--dedup">
        {dedupMode ? (
          <>
            <span className="tm-model-pill tm-module-pill">{t('knowledgePage.fileDedup')}</span>
            {dedupFolderPath ? (
              <span className="tm-dedup-header-path-group">
                {dedupScanning ? (
                  <IconRefresh size={14} className="tm-dedup-header-spinner tm-icon-spin" />
                ) : (
                  <button
                    type="button"
                    className="tm-dedup-header-icon-btn"
                    aria-label={t('knowledgePage.refreshScan')}
                    onClick={onDedupRefresh}
                  >
                    <IconRefresh size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="tm-dedup-header-icon-btn"
                  aria-label={t('knowledgePage.parentFolder')}
                  disabled={dedupScanning || !getParentPath(dedupFolderPath)}
                  onClick={onDedupGoParent}
                >
                  <IconChevronUp size={14} />
                </button>
                <span className="tm-dedup-header-path" title={dedupFolderPath}>
                  {dedupFolderPath}
                </span>
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className="tm-model-pill tm-module-pill">{config.title}</span>
            <span className="tm-module-breadcrumb-group">
              <span className="tm-chat-breadcrumb-sep">/</span>
              <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">{sectionLabel}</span>
            </span>
            {kbName ? (
              <span className="tm-module-breadcrumb-group">
                <span className="tm-chat-breadcrumb-sep">/</span>
                <span
                  className="tm-model-pill tm-module-pill tm-module-pill--secondary"
                  title={kbName}
                >
                  {translateKnowledgeFolderName(kbName, t)}
                </span>
              </span>
            ) : null}
          </>
        )}
      </div>

      <div className="tm-chat-header-end">
        {toolbar}
        {dedupMode ? (
          <button
            type="button"
            className="tm-dedup-header-select-btn"
            onClick={onSelectDedupFolder}
          >
            <IconFolderPlus size={18} />
            <span>{t('knowledgePage.selectFolder')}</span>
          </button>
        ) : (
          <button
            type="button"
            className="tm-chat-header-settings-btn"
            title={t('knowledgePage.settingsTitle', { title: config.title })}
            disabled={!settingsEnabled}
            onClick={onOpenSettings}
          >
            <IconSliders size={16} />
          </button>
        )}
      </div>
    </header>
  )
}

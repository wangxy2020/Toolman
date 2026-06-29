import { useI18n } from '../../i18n/useI18n'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import { useEffect, useMemo, useState } from 'react'
import { getModulePageConfig } from '../modules/module-config'
import type { KnowledgeFileSortField } from './knowledge-file-sort'
import {
  ensureDefaultFolderKb,
  resolveKnowledgeImportTarget,
  resolveKnowledgeSectionRoots,
} from './knowledge-import-files'
import { useDefaultFolderKnowledgeBase } from './useDefaultFolderKnowledgeBase'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  isSharedKnowledgeId,
} from './knowledge-sidebar-types'
import { resolveBreadcrumbItemName } from './knowledge-page-operations'
import type {
  KnowledgePageProps,
  PendingFileDelete,
  SettingsTarget,
} from './knowledge-page-types'
import { useKnowledgePageDedup } from './useKnowledgePageDedup'

export function useKnowledgePageState({
  workspaceId,
  section,
  activeId,
  active,
  sharedKnowledgeEntries = [],
  knowledgeFolderPath,
  knowledgeFolderLoading,
  networkKnowledgeFolderPath,
  networkKnowledgeFolderLoading,
  localFilesFolderPath,
  localFilesFolderLoading,
  loading,
  error,
  onKbChanged,
}: KnowledgePageProps) {
  const { t } = useI18n()
  const config = getModulePageConfig('knowledge', t)
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget>(null)
  const [showAddUrlModal, setShowAddUrlModal] = useState(false)
  const [sortField, setSortField] = useState<KnowledgeFileSortField>('createdAt')
  const [sortAscending, setSortAscending] = useState(false)
  const [settingsKbOverride, setSettingsKbOverride] = useState<
    NonNullable<KnowledgePageProps['active']>
  | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingFileDelete | null>(null)

  const isFileDedupView = section === 'file-tools' && activeId === FILE_DEDUP_TOOL_ID
  const isFileRegistryView = section === 'file-tools' && activeId === FILE_REGISTRY_TOOL_ID

  const dedup = useKnowledgePageDedup(isFileDedupView)

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

  useEffect(() => {
    setSettingsKbOverride(null)
    setPendingDelete(null)
  }, [importTarget.kbId, activeId, section])

  const sectionLabel = getKnowledgeSidebarSectionLabel(section, t)
  const breadcrumbItemName = resolveBreadcrumbItemName({
    section,
    activeId,
    active,
    activeSharedEntry,
    fileRegistryLabel: t('knowledgePage.fileRegistry'),
    fileDedupLabel: t('knowledgePage.fileDedup'),
  })

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

  const defaultFolderInitializing =
    (showingDefaultFolder && (knowledgeFolderLoading || localDefaultKb.loading)) ||
    (showingDefaultNetworkFolder &&
      (networkKnowledgeFolderLoading || networkDefaultKb.loading)) ||
    (showingDefaultLocalFilesFolder &&
      (localFilesFolderLoading || localFilesDefaultKb.loading))

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

  const isNetworkKbView = section === 'network'

  const settingsKb = settingsKbOverride ?? embedSettingsKb

  const handleCloseSettings = () => {
    setSettingsTarget(null)
    setSettingsKbOverride(null)
  }

  const handleSettingsSaved = async () => {
    localDefaultKb.reload()
    networkDefaultKb.reload()
    localFilesDefaultKb.reload()
    await onKbChanged?.()
  }

  return {
    t,
    config,
    error,
    loading,
    workspaceId,
    section,
    active,
    activeId,
    activeSharedEntry,
    settingsTarget,
    showAddUrlModal,
    setShowAddUrlModal,
    sortField,
    setSortField,
    sortAscending,
    setSortAscending,
    ...dedup,
    pendingDelete,
    setPendingDelete,
    isFileDedupView,
    isFileRegistryView,
    showingDefaultFolder,
    showingDefaultNetworkFolder,
    showingDefaultLocalFilesFolder,
    showingSavedSharedFolder,
    showingLiveSharedFolder,
    localDefaultKb,
    networkDefaultKb,
    localFilesDefaultKb,
    importTarget,
    sectionLabel,
    breadcrumbItemName,
    settingsEnabled,
    settingsKb,
    importReady,
    showFileToolbar,
    isNetworkKbView,
    defaultFolderInitializing,
    handleOpenSettings,
    handleCloseSettings,
    handleSettingsSaved,
    onKbChanged,
  }
}

export type UseKnowledgePageStateResult = ReturnType<typeof useKnowledgePageState>

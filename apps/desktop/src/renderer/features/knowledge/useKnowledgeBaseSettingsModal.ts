import { useEffect, useMemo, useRef, useState } from 'react'
import { useKnowledgeSettingsModels } from './useKnowledgeSettingsModels'
import { useKnowledgeWatchStatus } from './useKnowledgeWatchStatus'
import { useKnowledgeDefaultFolder } from './useKnowledgeDefaultFolder'
import { useI18n } from '../../i18n/useI18n'
import { translateKnowledgeBaseDescription } from '../../i18n/system-labels'
import type { KnowledgeBaseSettingsModalProps, SettingsTab } from './knowledge-base-settings-types'
import { buildSettingsTabs, getModalTitle, hasWatchChanged } from './knowledge-base-settings-utils'
import { openStorageInFinder, submitKnowledgeBaseUpdate } from './knowledge-base-settings-operations'
import {
  buildEmbeddingOptions,
  resolveKbStoragePath,
  useKnowledgeBaseSettingsFormFields,
  useResolvedDefaultEmbeddingRef,
} from './useKnowledgeBaseSettingsFormFields'

export function useKnowledgeBaseSettingsModal({
  workspaceId,
  kb,
  nameReadOnly,
  defaultFolderKind,
  onClose,
  onSaved,
}: KnowledgeBaseSettingsModalProps) {
  const { t } = useI18n()
  const isNetworkKb = kb.kind === 'network'
  const isLocalKb = kb.kind === 'local'
  const isLocalFilesKb = kb.kind === 'local_files'
  const isVectorizedKb = !isLocalFilesKb

  const localRootFolder = useKnowledgeDefaultFolder(isLocalKb ? workspaceId : null, 'local')
  const networkRootFolder = useKnowledgeDefaultFolder(isNetworkKb ? workspaceId : null, 'network')
  const localFilesRootFolder = useKnowledgeDefaultFolder(
    isLocalFilesKb ? workspaceId : null,
    'local_files',
  )

  const {
    loading: modelsLoading,
    embeddingModels,
    rerankModels,
    docProcessorProviders,
    defaultDocProcessorProviderId,
    defaultEmbeddingRef,
  } = useKnowledgeSettingsModels(workspaceId)

  const resolvedDefaultEmbeddingRef = useResolvedDefaultEmbeddingRef(kb, defaultEmbeddingRef)
  const form = useKnowledgeBaseSettingsFormFields(
    kb,
    resolvedDefaultEmbeddingRef,
    defaultDocProcessorProviderId,
  )

  const descriptionDisplay = useMemo(
    () =>
      defaultFolderKind ? translateKnowledgeBaseDescription(form.description, t) : form.description,
    [defaultFolderKind, form.description, t],
  )

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [memoryCount, setMemoryCount] = useState(0)
  const footerErrorRef = useRef<HTMLParagraphElement>(null)
  const watchStatus = useKnowledgeWatchStatus(isLocalKb ? workspaceId : null, isLocalKb ? kb.id : null)

  const showSubmitError = (message: string) => {
    setError(message)
    requestAnimationFrame(() => {
      footerErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  const kbStoragePath = useMemo(
    () =>
      resolveKbStoragePath(
        kb.name,
        isLocalKb,
        isLocalFilesKb,
        localRootFolder.path,
        localFilesRootFolder.path,
        networkRootFolder.path,
      ),
    [
      isLocalKb,
      isLocalFilesKb,
      kb.name,
      localRootFolder.path,
      localFilesRootFolder.path,
      networkRootFolder.path,
    ],
  )

  const embeddingOptions = useMemo(
    () =>
      buildEmbeddingOptions(
        embeddingModels,
        form.embeddingRef,
        resolvedDefaultEmbeddingRef,
        docProcessorProviders,
      ),
    [embeddingModels, form.embeddingRef, resolvedDefaultEmbeddingRef, docProcessorProviders],
  )

  const watchChanged = hasWatchChanged(
    kb,
    form.watchInclude,
    form.watchExclude,
    form.watchDebounceMs,
    form.urlRefreshIntervalHours,
  )

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    const result = await submitKnowledgeBaseUpdate(
      workspaceId,
      kb,
      {
        name: form.name,
        description: form.description,
        embeddingRef: form.embeddingRef,
        docProcessorProviderId: form.docProcessorProviderId,
        rerankRef: form.rerankRef,
        chunkSize: form.chunkSize,
        chunkOverlap: form.chunkOverlap,
        chunkStrategy: form.chunkStrategy,
        watchInclude: form.watchInclude,
        watchExclude: form.watchExclude,
        watchDebounceMs: form.watchDebounceMs,
        urlRefreshIntervalHours: form.urlRefreshIntervalHours,
        scoreThreshold: form.scoreThreshold,
        vectorBackend: form.vectorBackend,
      },
      resolvedDefaultEmbeddingRef,
      defaultDocProcessorProviderId,
      isLocalKb,
      isLocalFilesKb,
      t('knowledgePage.settings.advanced.vectorReindexConfirm'),
    )

    setSubmitting(false)
    if (!result.ok) {
      showSubmitError(result.error)
      return
    }

    await onSaved?.()
    onClose()
  }

  const handleOpenStorageInFinder = async (path: string) => {
    const openError = await openStorageInFinder(path)
    if (openError) setError(openError)
  }

  const combinedError =
    error ?? watchStatus.error ?? networkRootFolder.error ?? localFilesRootFolder.error
  const modalTitle = getModalTitle(t, isLocalFilesKb, isLocalKb)
  const settingsTabs = useMemo(
    () =>
      buildSettingsTabs(t, {
        isLocalFilesKb,
        isLocalKb,
        isNetworkKb,
        isVectorizedKb,
        memoryCount,
      }),
    [isLocalFilesKb, isLocalKb, isNetworkKb, isVectorizedKb, memoryCount, t],
  )

  useEffect(() => {
    if (!settingsTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('basic')
    }
  }, [activeTab, settingsTabs])

  return {
    t,
    kb,
    workspaceId,
    onClose,
    onSaved,
    nameReadOnly,
    defaultFolderKind,
    isNetworkKb,
    isLocalKb,
    isLocalFilesKb,
    isVectorizedKb,
    ...form,
    descriptionDisplay,
    submitting,
    activeTab,
    setActiveTab,
    setMemoryCount,
    footerErrorRef,
    modelsLoading,
    embeddingOptions,
    rerankModels,
    docProcessorProviders,
    watchStatus,
    isWatchingStoragePath: Boolean(kbStoragePath && watchStatus.isWatchingPath(kbStoragePath)),
    kbStoragePath,
    watchChanged,
    handleSubmit,
    handleOpenStorageInFinder,
    combinedError,
    modalTitle,
    settingsTabs,
  }
}

export type KnowledgeBaseSettingsModalState = ReturnType<typeof useKnowledgeBaseSettingsModal>

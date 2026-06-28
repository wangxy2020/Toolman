import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  IpcChannel,
  KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER,
  type KnowledgeBase,
} from '@toolman/shared'
import {
  decodeModelRef,
  encodeModelRef,
  formatModelLabel,
  useKnowledgeSettingsModels,
} from './useKnowledgeSettingsModels'
import { useKnowledgeWatchStatus } from './useKnowledgeWatchStatus'
import { useKnowledgeDefaultFolder } from './useKnowledgeDefaultFolder'
import { buildStoragePathForKb } from './knowledge-import-files'
import { KnowledgeSearchDebugPanel } from './KnowledgeSearchDebugPanel'
import { KnowledgeSourcesPanel } from './KnowledgeSourcesPanel'
import { KnowledgeIngestJobPanel } from './KnowledgeIngestJobPanel'
import { MemoryEntryPanel } from './MemoryEntryPanel'
import { SYSTEM_DEFAULT_FOLDER_KB_NAME, SYSTEM_DEFAULT_FOLDER_KB_NAMES } from './knowledge-sidebar-types'
import { useI18n } from '../../i18n/useI18n'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'

interface Props {
  workspaceId: string
  kb: KnowledgeBase
  nameReadOnly?: boolean
  defaultFolderKind?: 'local' | 'network' | 'local_files'
  onClose: () => void
  onSaved?: () => void | Promise<void>
}

const DEFAULT_SCORE_THRESHOLD = 0.3

function FormLabel({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <span className="tm-kb-settings-label tm-kb-settings-label--with-hint">
      {children}
      {hint ? (
        <span className="tm-kb-settings-help" title={hint} aria-label={hint}>
          ⓘ
        </span>
      ) : null}
    </span>
  )
}

function resolveEmbeddingRef(
  embedConfig: KnowledgeBase['embedConfig'],
  defaultEmbeddingRef: string,
): string {
  if (embedConfig.embedProviderId && embedConfig.embedModelId) {
    return encodeModelRef(embedConfig.embedProviderId, embedConfig.embedModelId)
  }
  if (embedConfig.embedModelId) {
    return encodeModelRef('', embedConfig.embedModelId)
  }
  return defaultEmbeddingRef
}

function resolveRerankRef(embedConfig: KnowledgeBase['embedConfig']): string {
  if (embedConfig.rerankProviderId && embedConfig.rerankModelId) {
    return encodeModelRef(embedConfig.rerankProviderId, embedConfig.rerankModelId)
  }
  return ''
}

function formatOptionalNumber(value: number, defaultValue: number): string {
  return value === defaultValue ? '' : String(value)
}

function parseOptionalPositiveInt(
  value: string,
  defaultValue: number,
  fieldLabel: string,
): number | { error: string } {
  const trimmed = value.trim()
  if (!trimmed) return defaultValue

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return { error: `${fieldLabel}须为正整数` }
  }
  return parsed
}

function parseOptionalNonNegativeInt(
  value: string,
  defaultValue: number,
  fieldLabel: string,
): number | { error: string } {
  const trimmed = value.trim()
  if (!trimmed) return defaultValue

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return { error: `${fieldLabel}须为非负整数` }
  }
  return parsed
}

function parseOptionalScoreThreshold(value: string): number | { error: string } | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return { error: '匹配度阈值须在 0 到 1 之间' }
  }
  return parsed
}

function patternsToText(patterns: string[]): string {
  return patterns.join('\n')
}

function textToPatterns(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function resolveEmbeddingSelection(
  embeddingRef: string,
  resolvedDefaultEmbeddingRef: string,
  embedConfig: KnowledgeBase['embedConfig'],
): { providerId: string; modelId: string } | null {
  const fromRef = decodeModelRef(embeddingRef || resolvedDefaultEmbeddingRef)
  if (fromRef?.modelId) return fromRef

  if (embedConfig.embedModelId) {
    return {
      providerId: embedConfig.embedProviderId ?? '',
      modelId: embedConfig.embedModelId,
    }
  }

  return null
}

function WatchStatusBadge({
  loading,
  watching,
  loadingLabel,
  watchingLabel,
  notWatchingLabel,
}: {
  loading: boolean
  watching: boolean
  loadingLabel: string
  watchingLabel: string
  notWatchingLabel: string
}) {
  if (loading) {
    return <span className="tm-kb-settings-watch-status">{loadingLabel}</span>
  }

  return (
    <span
      className={[
        'tm-kb-settings-watch-status',
        watching ? 'tm-kb-settings-watch-status--active' : 'tm-kb-settings-watch-status--inactive',
      ].join(' ')}
    >
      {watching ? watchingLabel : notWatchingLabel}
    </span>
  )
}

type SettingsTab = 'basic' | 'watch' | 'memory' | 'advanced'

function formatMemoryBadge(count: number): string | undefined {
  if (count <= 0) return undefined
  return count > 9 ? '9+' : String(count)
}

export function KnowledgeBaseSettingsModal({
  workspaceId,
  kb,
  nameReadOnly = false,
  defaultFolderKind,
  onClose,
  onSaved,
}: Props) {
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

  const [name, setName] = useState(kb.name)
  const [description, setDescription] = useState(kb.description ?? '')
  const [embeddingRef, setEmbeddingRef] = useState('')
  const [docProcessorProviderId, setDocProcessorProviderId] = useState(
    kb.embedConfig.docProcessorProviderId ?? '',
  )
  const [rerankRef, setRerankRef] = useState('')
  const [chunkSize, setChunkSize] = useState(
    formatOptionalNumber(kb.chunkConfig.chunkSize, DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize),
  )
  const [chunkOverlap, setChunkOverlap] = useState(
    formatOptionalNumber(kb.chunkConfig.chunkOverlap, DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap),
  )
  const [chunkStrategy, setChunkStrategy] = useState(kb.chunkConfig.strategy)
  const [watchInclude, setWatchInclude] = useState(patternsToText(kb.watchConfig.include))
  const [watchExclude, setWatchExclude] = useState(patternsToText(kb.watchConfig.exclude))
  const [watchDebounceMs, setWatchDebounceMs] = useState(
    formatOptionalNumber(kb.watchConfig.debounceMs, DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs),
  )
  const [urlRefreshIntervalHours, setUrlRefreshIntervalHours] = useState(
    formatOptionalNumber(
      kb.watchConfig.urlRefreshIntervalHours ?? 0,
      DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours,
    ),
  )
  const [scoreThreshold, setScoreThreshold] = useState(
    kb.embedConfig.scoreThreshold === undefined
      ? ''
      : formatOptionalNumber(kb.embedConfig.scoreThreshold, DEFAULT_SCORE_THRESHOLD),
  )
  const [vectorBackend, setVectorBackend] = useState<'file' | 'lance'>(
    kb.embedConfig.vectorBackend ?? 'file',
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

  const kbStoragePath = useMemo(() => {
    if (isLocalFilesKb) {
      const base = localFilesRootFolder.path
      if (!base) return null
      if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) {
        return buildStoragePathForKb(base, SYSTEM_DEFAULT_FOLDER_KB_NAME) || null
      }
      return buildStoragePathForKb(base, kb.name) || null
    }

    if (isLocalKb) {
      const base = localRootFolder.path
      if (!base) return null
      if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) {
        return buildStoragePathForKb(base, SYSTEM_DEFAULT_FOLDER_KB_NAME) || null
      }
      return buildStoragePathForKb(base, kb.name) || null
    }

    const base = networkRootFolder.path
    if (!base) return null
    if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) {
      return buildStoragePathForKb(base, SYSTEM_DEFAULT_FOLDER_KB_NAME) || null
    }
    return buildStoragePathForKb(base, kb.name) || null
  }, [
    isLocalKb,
    isLocalFilesKb,
    kb.name,
    localRootFolder.path,
    localFilesRootFolder.path,
    networkRootFolder.path,
  ])

  const isWatchingStoragePath = Boolean(
    kbStoragePath && watchStatus.isWatchingPath(kbStoragePath),
  )

  const resolvedDefaultEmbeddingRef = useMemo(() => {
    if (defaultEmbeddingRef) return defaultEmbeddingRef
    if (kb.embedConfig.embedProviderId && kb.embedConfig.embedModelId) {
      return encodeModelRef(kb.embedConfig.embedProviderId, kb.embedConfig.embedModelId)
    }
    return encodeModelRef('', kb.embedConfig.embedModelId)
  }, [defaultEmbeddingRef, kb.embedConfig.embedModelId, kb.embedConfig.embedProviderId])

  useEffect(() => {
    setName(kb.name)
    setDescription(kb.description ?? '')
    setEmbeddingRef(resolveEmbeddingRef(kb.embedConfig, resolvedDefaultEmbeddingRef))
    setDocProcessorProviderId(kb.embedConfig.docProcessorProviderId ?? '')
    setRerankRef(resolveRerankRef(kb.embedConfig))
    setChunkSize(
      formatOptionalNumber(kb.chunkConfig.chunkSize, DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize),
    )
    setChunkOverlap(
      formatOptionalNumber(kb.chunkConfig.chunkOverlap, DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap),
    )
    setChunkStrategy(kb.chunkConfig.strategy)
    setWatchInclude(patternsToText(kb.watchConfig.include))
    setWatchExclude(patternsToText(kb.watchConfig.exclude))
    setWatchDebounceMs(
      formatOptionalNumber(kb.watchConfig.debounceMs, DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs),
    )
    setUrlRefreshIntervalHours(
      formatOptionalNumber(
        kb.watchConfig.urlRefreshIntervalHours ?? 0,
        DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours,
      ),
    )
    setScoreThreshold(
      kb.embedConfig.scoreThreshold === undefined
        ? ''
        : formatOptionalNumber(kb.embedConfig.scoreThreshold, DEFAULT_SCORE_THRESHOLD),
    )
    setVectorBackend(kb.embedConfig.vectorBackend ?? 'file')
  }, [kb.id, kb.updatedAt])

  useEffect(() => {
    if (kb.embedConfig.docProcessorProviderId) return
    if (!defaultDocProcessorProviderId) return
    setDocProcessorProviderId((current) => current || defaultDocProcessorProviderId)
  }, [kb.embedConfig.docProcessorProviderId, defaultDocProcessorProviderId])

  useEffect(() => {
    if (!embeddingRef && resolvedDefaultEmbeddingRef) {
      setEmbeddingRef(resolvedDefaultEmbeddingRef)
    }
  }, [embeddingRef, resolvedDefaultEmbeddingRef])

  const embeddingOptions = useMemo(() => {
    const options = [...embeddingModels]
    const currentRef = embeddingRef || resolvedDefaultEmbeddingRef
    if (currentRef && !options.some((option) => option.value === currentRef)) {
      const decoded = decodeModelRef(currentRef)
      if (decoded) {
        const provider = docProcessorProviders.find((item) => item.value === decoded.providerId)
        options.unshift({
          value: currentRef,
          label: formatModelLabel(decoded.modelId, provider?.label ?? '未知'),
          providerId: decoded.providerId,
          modelId: decoded.modelId,
        })
      }
    }
    return options
  }, [
    embeddingModels,
    embeddingRef,
    resolvedDefaultEmbeddingRef,
    docProcessorProviders,
  ])

  const embedReindexChanged =
    embeddingRef !== resolveEmbeddingRef(kb.embedConfig, resolvedDefaultEmbeddingRef) ||
    rerankRef !== resolveRerankRef(kb.embedConfig) ||
    vectorBackend !== (kb.embedConfig.vectorBackend ?? 'file') ||
    (scoreThreshold.trim()
      ? Number(scoreThreshold)
      : undefined) !== kb.embedConfig.scoreThreshold

  const chunkChanged =
    (chunkSize.trim() ? Number(chunkSize) : DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize) !==
      kb.chunkConfig.chunkSize ||
    (chunkOverlap.trim() ? Number(chunkOverlap) : DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap) !==
      kb.chunkConfig.chunkOverlap ||
    chunkStrategy !== kb.chunkConfig.strategy

  const watchChanged =
    textToPatterns(watchInclude).join('\n') !== kb.watchConfig.include.join('\n') ||
    textToPatterns(watchExclude).join('\n') !== kb.watchConfig.exclude.join('\n') ||
    (watchDebounceMs.trim()
      ? Number(watchDebounceMs)
      : DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs) !== kb.watchConfig.debounceMs ||
    (urlRefreshIntervalHours.trim()
      ? Number(urlRefreshIntervalHours)
      : DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours) !==
      (kb.watchConfig.urlRefreshIntervalHours ?? 0)

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      showSubmitError('请输入知识库名称')
      return
    }

    if (isLocalFilesKb) {
      setSubmitting(true)
      setError(null)
      const result = await window.api.invoke(IpcChannel.KnowledgeBaseUpdate, {
        id: kb.id,
        workspaceId,
        name: trimmedName,
        description: description.trim() || null,
      })
      setSubmitting(false)
      if (!result.ok) {
        showSubmitError(result.error.message)
        return
      }
      await onSaved?.()
      onClose()
      return
    }

    const parsedChunkSize = parseOptionalPositiveInt(
      chunkSize,
      DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize,
      '分段大小',
    )
    if (typeof parsedChunkSize !== 'number') {
      showSubmitError(parsedChunkSize.error)
      return
    }

    const parsedChunkOverlap = parseOptionalNonNegativeInt(
      chunkOverlap,
      DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap,
      '重叠大小',
    )
    if (typeof parsedChunkOverlap !== 'number') {
      showSubmitError(parsedChunkOverlap.error)
      return
    }

    let parsedWatchDebounce = DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs
    let parsedUrlRefreshInterval = DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours
    if (isLocalKb) {
      const debounceResult = parseOptionalPositiveInt(
        watchDebounceMs,
        DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs,
        '监听防抖',
      )
      if (typeof debounceResult !== 'number') {
        showSubmitError(debounceResult.error)
        return
      }
      parsedWatchDebounce = debounceResult
    } else {
      const refreshResult = parseOptionalNonNegativeInt(
        urlRefreshIntervalHours,
        DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours,
        '网页刷新间隔',
      )
      if (typeof refreshResult !== 'number') {
        showSubmitError(refreshResult.error)
        return
      }
      parsedUrlRefreshInterval = refreshResult
    }

    const parsedScoreThreshold = parseOptionalScoreThreshold(scoreThreshold)
    if (typeof parsedScoreThreshold === 'object' && parsedScoreThreshold !== null && 'error' in parsedScoreThreshold) {
      showSubmitError(parsedScoreThreshold.error)
      return
    }

    const embeddingSelection = resolveEmbeddingSelection(
      embeddingRef,
      resolvedDefaultEmbeddingRef,
      kb.embedConfig,
    )
    if (!embeddingSelection?.modelId) {
      showSubmitError('请选择嵌入模型')
      return
    }

    const rerankSelection = rerankRef ? decodeModelRef(rerankRef) : null

    const storedDocProcessorProviderId =
      docProcessorProviderId || defaultDocProcessorProviderId || null

    const embedConfig: Partial<KnowledgeBase['embedConfig']> = {
      embedProviderId: embeddingSelection.providerId || null,
      embedModelId: embeddingSelection.modelId,
      rerankProviderId: rerankSelection?.providerId || null,
      rerankModelId: rerankSelection?.modelId || null,
      ...(isLocalKb ? { docProcessorProviderId: storedDocProcessorProviderId } : {}),
      vectorBackend,
      scoreThreshold: parsedScoreThreshold,
    }

    const chunkConfig: Partial<KnowledgeBase['chunkConfig']> = {
      chunkSize: parsedChunkSize,
      chunkOverlap: parsedChunkOverlap,
      strategy: chunkStrategy,
    }

    const watchConfig: Partial<KnowledgeBase['watchConfig']> | undefined = isLocalKb
      ? {
          include: textToPatterns(watchInclude),
          exclude: textToPatterns(watchExclude),
          debounceMs: parsedWatchDebounce,
        }
      : {
          urlRefreshIntervalHours: parsedUrlRefreshInterval,
        }

    setSubmitting(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.KnowledgeBaseUpdate, {
      id: kb.id,
      workspaceId,
      name: trimmedName,
      description: description.trim() || null,
      embedConfig,
      chunkConfig,
      watchConfig,
    })

    setSubmitting(false)

    if (!result.ok) {
      showSubmitError(result.error.message)
      return
    }

    await onSaved?.()

    if (kb.documentCount > 0 && (embedReindexChanged || chunkChanged)) {
      const shouldReindex = window.confirm(t('knowledgePage.settings.advanced.vectorReindexConfirm'))
      if (shouldReindex) {
        const reindexResult = await window.api.invoke(IpcChannel.KnowledgeKbReindex, {
          workspaceId,
          kbId: kb.id,
        })
        if (!reindexResult.ok) {
          showSubmitError(reindexResult.error.message)
          return
        }
      }
    }

    onClose()
  }

  const handleOpenStorageInFinder = async (path: string) => {
    const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { opened: boolean; error?: string }
    if (!data.opened && data.error) setError(data.error)
  }

  const combinedError =
    error ?? watchStatus.error ?? networkRootFolder.error ?? localFilesRootFolder.error

  const modalTitle = isLocalFilesKb
    ? t('knowledgePage.settings.titleLocalFiles')
    : isLocalKb
      ? t('knowledgePage.settings.titleLocal')
      : t('knowledgePage.settings.titleNetwork')

  const settingsTabs = useMemo(() => {
    const tabs: Array<{ id: SettingsTab; label: string; badge?: string }> = [
      {
        id: 'basic',
        label: isLocalFilesKb
          ? t('knowledgePage.settings.tabs.basic')
          : t('knowledgePage.settings.tabs.basicModel'),
      },
    ]
    if (isLocalKb) tabs.push({ id: 'watch', label: t('knowledgePage.settings.tabs.watch') })
    if (isNetworkKb) tabs.push({ id: 'watch', label: t('knowledgePage.settings.tabs.refresh') })
    tabs.push({
      id: 'memory',
      label: t('knowledgePage.settings.tabs.memory'),
      badge: formatMemoryBadge(memoryCount),
    })
    if (isVectorizedKb) tabs.push({ id: 'advanced', label: t('knowledgePage.settings.tabs.advanced') })
    return tabs
  }, [isLocalFilesKb, isLocalKb, isNetworkKb, isVectorizedKb, memoryCount, t])

  useEffect(() => {
    if (!settingsTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('basic')
    }
  }, [activeTab, settingsTabs])

  return (
    <div className="tm-modal-overlay tm-modal-overlay--kb-settings" onClick={onClose}>
      <div
        className="tm-kb-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-kb-settings-modal-header">
          <h3 id="kb-settings-title" className="tm-kb-settings-modal-title">
            <span className="tm-kb-settings-modal-title-dot" aria-hidden="true" />
            {modalTitle}
          </h3>
          <button type="button" className="tm-kb-settings-modal-close" aria-label={t('common.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-kb-settings-modal-body">
          <nav className="tm-kb-settings-modal-nav" aria-label={t('knowledgePage.settingsTitle', { title: t('modules.knowledge.title') })}>
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-kb-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-kb-settings-modal-nav-item--active' : '',
                  tab.badge ? 'tm-kb-settings-modal-nav-item--badge' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.badge ? <span className="tm-kb-settings-nav-badge">{tab.badge}</span> : null}
              </button>
            ))}
          </nav>

          <div className="tm-kb-settings-modal-content">
            {activeTab === 'basic' ? (
              <div className="tm-kb-settings-form">
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="kb-settings-name">
                    {t('knowledgePage.settings.name')}
                  </label>
                  <input
                    id="kb-settings-name"
                    className="tm-kb-settings-input"
                    value={nameReadOnly ? translateKnowledgeFolderName(name, t) : name}
                    onChange={(event) => setName(event.target.value)}
                    readOnly={nameReadOnly}
                  />
                </div>

                <div className="tm-kb-settings-row tm-kb-settings-row--top">
                  <label className="tm-kb-settings-label" htmlFor="kb-settings-description">
                    {t('knowledgePage.settings.descriptionOptional')}
                  </label>
                  <textarea
                    id="kb-settings-description"
                    className="tm-kb-settings-textarea"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                  />
                </div>

                {isNetworkKb ? (
                  <p className="tm-kb-settings-hint">{t('knowledgePage.settings.hints.networkKbBasic')}</p>
                ) : null}
                {isLocalFilesKb ? (
                  <p className="tm-kb-settings-hint">{t('knowledgePage.settings.hints.localFilesBasic')}</p>
                ) : null}

                {isLocalFilesKb && kbStoragePath ? (
                  <>
                    <div className="tm-kb-settings-row">
                      <span className="tm-kb-settings-label">{t('knowledgePage.settings.storageDir')}</span>
                      <div className="tm-kb-settings-path">{kbStoragePath}</div>
                    </div>
                    <div className="tm-kb-settings-row-actions">
                      <button
                        type="button"
                        className="tm-kb-settings-inline-btn"
                        onClick={() => void handleOpenStorageInFinder(kbStoragePath)}
                        disabled={submitting}
                      >
                        {t('knowledgePage.settings.openInFinder')}
                      </button>
                    </div>
                  </>
                ) : null}

                {isVectorizedKb ? (
                  <div className="tm-kb-settings-row">
                    <FormLabel hint="用于将文档内容转换为向量，修改后需重建索引。">{t('knowledgePage.settings.embedModel')}</FormLabel>
                    <select
                      id="kb-settings-embedding"
                      className="tm-kb-settings-input"
                      value={embeddingRef}
                      onChange={(event) => setEmbeddingRef(event.target.value)}
                      disabled={modelsLoading}
                    >
                      {embeddingOptions.length === 0 ? (
                        <option value="">{t('knowledgePage.settings.noModel')}</option>
                      ) : (
                        embeddingOptions.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                ) : null}

                {isNetworkKb && !defaultFolderKind && kbStoragePath ? (
                  <>
                    <div className="tm-kb-settings-row">
                      <span className="tm-kb-settings-label">{t('knowledgePage.settings.storageDir')}</span>
                      <div className="tm-kb-settings-path">{kbStoragePath}</div>
                    </div>
                    <div className="tm-kb-settings-row-actions">
                      <button
                        type="button"
                        className="tm-kb-settings-inline-btn"
                        onClick={() => void handleOpenStorageInFinder(kbStoragePath)}
                        disabled={submitting}
                      >
                        {t('knowledgePage.settings.openInFinder')}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'watch' && isLocalKb ? (
              <div className="tm-kb-settings-form">
                <div className="tm-kb-settings-section-head">
                  <span className="tm-kb-settings-section-title">{t('knowledgePage.settings.includeRules')}</span>
                  <WatchStatusBadge
                    loading={watchStatus.loading}
                    watching={isWatchingStoragePath}
                    loadingLabel={t('knowledgePage.settings.checking')}
                    watchingLabel={t('knowledgePage.settings.watching')}
                    notWatchingLabel={t('knowledgePage.settings.notWatching')}
                  />
                </div>
                <textarea
                  className="tm-kb-settings-textarea tm-kb-settings-textarea--mono"
                  value={watchInclude}
                  onChange={(event) => setWatchInclude(event.target.value)}
                  placeholder={KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER}
                  rows={4}
                />
                <p className="tm-kb-settings-hint">{t('knowledgePage.settings.watch.supportedTypes')}</p>

                <div className="tm-kb-settings-field-block">
                  <FormLabel hint={t('knowledgePage.settings.watch.excludeHint')}>{t('knowledgePage.settings.excludeRules')}</FormLabel>
                  <textarea
                    className="tm-kb-settings-textarea tm-kb-settings-textarea--mono"
                    value={watchExclude}
                    onChange={(event) => setWatchExclude(event.target.value)}
                    placeholder={patternsToText(DEFAULT_KNOWLEDGE_WATCH_CONFIG.exclude)}
                    rows={3}
                  />
                  <p className="tm-kb-settings-hint">{t('knowledgePage.settings.watch.officeTempExclude')}</p>
                </div>

                <div className="tm-kb-settings-row">
                  <FormLabel hint={t('knowledgePage.settings.watch.debounceHint')}>{t('knowledgePage.settings.debounce')}</FormLabel>
                  <input
                    className="tm-kb-settings-input"
                    type="number"
                    min={100}
                    value={watchDebounceMs}
                    onChange={(event) => setWatchDebounceMs(event.target.value)}
                    placeholder={t('knowledgePage.settings.watch.defaultDebounce', {
                      value: DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs,
                    })}
                  />
                </div>

                {watchChanged ? (
                  <p className="tm-kb-settings-hint">{t('knowledgePage.settings.hints.watchRulesChanged')}</p>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'watch' && isNetworkKb ? (
              <div className="tm-kb-settings-form">
                <div className="tm-kb-settings-row">
                  <FormLabel hint={t('knowledgePage.settings.watch.refreshIntervalHint')}>
                    {t('knowledgePage.settings.refreshInterval')}
                  </FormLabel>
                  <input
                    className="tm-kb-settings-input"
                    type="number"
                    min={0}
                    value={urlRefreshIntervalHours}
                    onChange={(event) => setUrlRefreshIntervalHours(event.target.value)}
                    placeholder="0"
                  />
                </div>
                {kb.watchConfig.lastUrlRefreshAt ? (
                  <p className="tm-kb-settings-hint">
                    {t('knowledgePage.settings.hints.lastRefresh', {
                      time: new Date(kb.watchConfig.lastUrlRefreshAt).toLocaleString(),
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'memory' ? (
              <MemoryEntryPanel workspaceId={workspaceId} onCountChange={setMemoryCount} />
            ) : null}

            {activeTab === 'advanced' && isVectorizedKb ? (
              <div className="tm-kb-settings-form">
                {isLocalKb ? (
                  <div className="tm-kb-settings-row">
                    <FormLabel hint={t('knowledgePage.settings.advanced.docProcessorHint')}>{t('knowledgePage.settings.documentProcessing')}</FormLabel>
                    <select
                      className="tm-kb-settings-input"
                      value={docProcessorProviderId}
                      onChange={(event) => setDocProcessorProviderId(event.target.value)}
                      disabled={modelsLoading}
                    >
                      <option value="">{t('knowledgePage.settings.advanced.docProcessorPlaceholder')}</option>
                      {docProcessorProviders.map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="tm-kb-settings-row">
                    <FormLabel hint={t('knowledgePage.settings.advanced.rerankHint')}>{t('knowledgePage.settings.rerankModel')}</FormLabel>
                  <select
                    className="tm-kb-settings-input"
                    value={rerankRef}
                    onChange={(event) => setRerankRef(event.target.value)}
                    disabled={modelsLoading}
                  >
                    <option value="">{t('knowledgePage.settings.noModel')}</option>
                    {rerankModels.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="tm-kb-settings-row">
                  <FormLabel
                    hint={
                      isNetworkKb
                        ? t('knowledgePage.settings.advanced.chunkStrategyNetwork')
                        : t('knowledgePage.settings.advanced.chunkStrategyLocal')
                    }
                  >
                    {t('knowledgePage.settings.chunkStrategy')}
                  </FormLabel>
                  <select
                    className="tm-kb-settings-input"
                    value={chunkStrategy}
                    onChange={(event) =>
                      setChunkStrategy(event.target.value as KnowledgeBase['chunkConfig']['strategy'])
                    }
                  >
                    <option value="markdown">{t('knowledgePage.settings.chunkMarkdown')}</option>
                    <option value="fixed">{t('knowledgePage.settings.chunkFixed')}</option>
                    {isLocalKb ? <option value="semantic">{t('knowledgePage.settings.chunkSemantic')}</option> : null}
                  </select>
                </div>

                <div className="tm-kb-settings-row">
                  <FormLabel hint={t('knowledgePage.settings.advanced.chunkSizeHint')}>{t('knowledgePage.settings.chunkSize')}</FormLabel>
                  <input
                    className="tm-kb-settings-input"
                    type="number"
                    min={64}
                    value={chunkSize}
                    onChange={(event) => setChunkSize(event.target.value)}
                    placeholder={t('knowledgePage.settings.advanced.defaultPlaceholder')}
                  />
                </div>

                <div className="tm-kb-settings-row">
                  <FormLabel hint={t('knowledgePage.settings.advanced.chunkOverlapHint')}>{t('knowledgePage.settings.chunkOverlap')}</FormLabel>
                  <input
                    className="tm-kb-settings-input"
                    type="number"
                    min={0}
                    value={chunkOverlap}
                    onChange={(event) => setChunkOverlap(event.target.value)}
                    placeholder={t('knowledgePage.settings.advanced.defaultPlaceholder')}
                  />
                </div>

                <div className="tm-kb-settings-row">
                  <FormLabel hint={t('knowledgePage.settings.advanced.matchThresholdHint')}>
                    {t('knowledgePage.settings.matchThreshold')}
                  </FormLabel>
                  <input
                    className="tm-kb-settings-input"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={scoreThreshold}
                    onChange={(event) => setScoreThreshold(event.target.value)}
                    placeholder={t('knowledgePage.settings.advanced.defaultPlaceholder')}
                  />
                </div>

                <div className="tm-kb-settings-row">
                  <FormLabel hint={t('knowledgePage.settings.advanced.vectorStoreHint')}>
                    {t('knowledgePage.settings.vectorStore')}
                  </FormLabel>
                  <select
                    className="tm-kb-settings-input"
                    value={vectorBackend}
                    onChange={(event) => setVectorBackend(event.target.value as 'file' | 'lance')}
                  >
                    <option value="file">{t('knowledgePage.settings.storeJson')}</option>
                    <option value="lance">{t('knowledgePage.settings.storeLance')}</option>
                  </select>
                </div>

                <KnowledgeSearchDebugPanel workspaceId={workspaceId} kbId={kb.id} />
                <KnowledgeSourcesPanel workspaceId={workspaceId} onChanged={onSaved} />
                <KnowledgeIngestJobPanel workspaceId={workspaceId} kbId={kb.id} />
              </div>
            ) : null}
          </div>
        </div>

        <footer className="tm-kb-settings-modal-footer">
          {combinedError ? (
            <p ref={footerErrorRef} className="tm-form-error tm-kb-settings-modal-footer-error">
              {combinedError}
            </p>
          ) : null}
          <div className="tm-kb-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? t('common.loading') : t('knowledgePage.settings.saveConfig')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

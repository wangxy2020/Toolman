import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  IpcChannel,
  KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER,
  KNOWLEDGE_WATCH_OFFICE_TEMP_EXCLUDE_HINT,
  KNOWLEDGE_WATCH_SUPPORTED_TYPES_HINT,
  type KnowledgeBase,
} from '@toolman/shared'
import { IconHelp } from '../../components/icons'
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
import { SYSTEM_DEFAULT_FOLDER_KB_NAMES } from './knowledge-sidebar-types'

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
    <span className="tm-form-label">
      {children}
      {hint ? (
        <span className="tm-form-label-hint" title={hint}>
          <IconHelp size={13} />
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
}: {
  loading: boolean
  watching: boolean
}) {
  if (loading) {
    return <span className="tm-knowledge-settings-watch-status">检查中…</span>
  }

  return (
    <span
      className={[
        'tm-knowledge-settings-watch-status',
        watching
          ? 'tm-knowledge-settings-watch-status--active'
          : 'tm-knowledge-settings-watch-status--inactive',
      ].join(' ')}
    >
      {watching ? '监听中' : '未监听'}
    </span>
  )
}

export function KnowledgeBaseSettingsModal({
  workspaceId,
  kb,
  nameReadOnly = false,
  defaultFolderKind,
  onClose,
  onSaved,
}: Props) {
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
      if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) return base
      return buildStoragePathForKb(base, kb.name) || null
    }

    if (isLocalKb) {
      const base = localRootFolder.path
      if (!base) return null
      if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) return base
      return buildStoragePathForKb(base, kb.name) || null
    }

    const base = networkRootFolder.path
    if (!base) return null
    if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) return base
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
      const shouldReindex = window.confirm(
        '嵌入模型、分块或向量存储设置已变更，建议重建全部索引以使检索生效。是否立即重建？',
      )
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
    ? '本地文件设置'
    : isLocalKb
      ? '本地知识库设置'
      : '网络知识库设置'

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-modal--knowledge-create"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">{modalTitle}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-modal-body tm-knowledge-settings-body">
          <section className="tm-knowledge-settings-section">
            <h3 className="tm-knowledge-settings-heading">基本信息</h3>
            <label className="tm-form-field">
              <FormLabel>名称</FormLabel>
              <input
                className="tm-form-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                readOnly={nameReadOnly}
              />
            </label>
            <label className="tm-form-field">
              <FormLabel>描述（可选）</FormLabel>
              <textarea
                className="tm-form-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
              />
            </label>
            {isNetworkKb ? (
              <p className="tm-knowledge-detail-hint">
                在主界面拖拽或添加 HTTP/HTTPS 网页链接，系统会抓取页面内容并建立索引。
              </p>
            ) : null}
            {isLocalFilesKb ? (
              <p className="tm-knowledge-detail-hint">
                本地文件仅用于存储与管理文件，不会进行向量化或检索索引。
              </p>
            ) : null}
            {isLocalFilesKb && kbStoragePath ? (
              <>
                <label className="tm-form-field">
                  <FormLabel hint="此本地文件库的存储目录。">存储目录</FormLabel>
                  <div className="tm-knowledge-folder-path">{kbStoragePath}</div>
                </label>
                <div className="tm-knowledge-folder-actions">
                  <button
                    type="button"
                    className="tm-btn tm-btn--secondary"
                    onClick={() => void handleOpenStorageInFinder(kbStoragePath)}
                    disabled={submitting}
                  >
                    在 Finder 中打开
                  </button>
                </div>
              </>
            ) : null}
            {isVectorizedKb ? (
            <label className="tm-form-field">
              <FormLabel hint="用于将文档内容转换为向量，修改后需重建索引。">嵌入模型</FormLabel>
              <select
                className="tm-form-input"
                value={embeddingRef}
                onChange={(event) => setEmbeddingRef(event.target.value)}
                disabled={modelsLoading}
              >
                {embeddingOptions.length === 0 ? (
                  <option value="">没有模型</option>
                ) : (
                  embeddingOptions.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            ) : null}
            {isNetworkKb && !defaultFolderKind && kbStoragePath ? (
              <>
                <label className="tm-form-field">
                  <FormLabel hint="此知识库的网页快照等文件存储目录。">存储目录</FormLabel>
                  <div className="tm-knowledge-folder-path">{kbStoragePath}</div>
                </label>
                <div className="tm-knowledge-folder-actions">
                  <button
                    type="button"
                    className="tm-btn tm-btn--secondary"
                    onClick={() => void handleOpenStorageInFinder(kbStoragePath)}
                    disabled={submitting}
                  >
                    在 Finder 中打开
                  </button>
                </div>
              </>
            ) : null}
          </section>

          {isVectorizedKb ? (
          <section className="tm-knowledge-settings-section">
            <h3 className="tm-knowledge-settings-heading">高级设置</h3>
            {isLocalKb ? (
              <label className="tm-form-field">
                <FormLabel hint="用于解析 PDF、Office 等复杂文档格式的服务商。">文档处理</FormLabel>
                <select
                  className="tm-form-input"
                  value={docProcessorProviderId}
                  onChange={(event) => setDocProcessorProviderId(event.target.value)}
                  disabled={modelsLoading}
                >
                  <option value="">选择一个文档处理服务商</option>
                  {docProcessorProviders.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="tm-form-field">
              <FormLabel hint="检索时对候选结果重新排序的模型。">重排模型</FormLabel>
              <select
                className="tm-form-input"
                value={rerankRef}
                onChange={(event) => setRerankRef(event.target.value)}
                disabled={modelsLoading}
              >
                <option value="">没有模型</option>
                {rerankModels.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tm-form-field">
              <FormLabel
                hint={
                  isNetworkKb
                    ? '网页内容通常适合 Markdown 结构分块。'
                    : 'fixed 按字符切分；markdown 保留标题结构；semantic 按语义边界切分（较慢）。'
                }
              >
                分块策略
              </FormLabel>
              <select
                className="tm-form-input"
                value={chunkStrategy}
                onChange={(event) =>
                  setChunkStrategy(event.target.value as KnowledgeBase['chunkConfig']['strategy'])
                }
              >
                <option value="markdown">Markdown 结构</option>
                <option value="fixed">固定长度</option>
                {isLocalKb ? <option value="semantic">语义分块</option> : null}
              </select>
            </label>
            <label className="tm-form-field">
              <FormLabel hint="每个文本分段的字符数，留空使用默认值。">分段大小</FormLabel>
              <input
                className="tm-form-input"
                type="number"
                min={64}
                value={chunkSize}
                onChange={(event) => setChunkSize(event.target.value)}
                placeholder="默认值（不建议修改）"
              />
            </label>
            <label className="tm-form-field">
              <FormLabel hint="相邻分段之间的重叠字符数，留空使用默认值。">重叠大小</FormLabel>
              <input
                className="tm-form-input"
                type="number"
                min={0}
                value={chunkOverlap}
                onChange={(event) => setChunkOverlap(event.target.value)}
                placeholder="默认值（不建议修改）"
              />
            </label>
          </section>
          ) : null}

          {isLocalKb ? (
            <section className="tm-knowledge-settings-section">
              <div className="tm-knowledge-settings-heading-row">
                <h3 className="tm-knowledge-settings-heading">文件夹监听</h3>
                <WatchStatusBadge
                  loading={watchStatus.loading}
                  watching={isWatchingStoragePath}
                />
              </div>
              <label className="tm-form-field">
                <FormLabel hint="每行一个 glob 模式，用于匹配需要索引的文件。">包含规则</FormLabel>
                <textarea
                  className="tm-form-textarea"
                  value={watchInclude}
                  onChange={(event) => setWatchInclude(event.target.value)}
                  placeholder={KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER}
                  rows={4}
                />
                <p className="tm-form-hint">{KNOWLEDGE_WATCH_SUPPORTED_TYPES_HINT}</p>
              </label>
              <label className="tm-form-field">
                <FormLabel hint="每行一个 glob 模式，匹配到的文件将跳过索引。">排除规则</FormLabel>
                <textarea
                  className="tm-form-textarea"
                  value={watchExclude}
                  onChange={(event) => setWatchExclude(event.target.value)}
                  placeholder={patternsToText(DEFAULT_KNOWLEDGE_WATCH_CONFIG.exclude)}
                  rows={3}
                />
                <p className="tm-form-hint">{KNOWLEDGE_WATCH_OFFICE_TEMP_EXCLUDE_HINT}</p>
              </label>
              <label className="tm-form-field">
                <FormLabel hint="文件变更后等待多久再触发重新索引（毫秒）。">防抖间隔</FormLabel>
                <input
                  className="tm-form-input"
                  type="number"
                  min={100}
                  value={watchDebounceMs}
                  onChange={(event) => setWatchDebounceMs(event.target.value)}
                  placeholder={`默认 ${DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs}`}
                />
              </label>
              {watchChanged ? (
                <p className="tm-knowledge-detail-hint">监听规则变更后需保存，将对知识库目录内文件生效。</p>
              ) : null}
            </section>
          ) : null}

          {isNetworkKb ? (
            <section className="tm-knowledge-settings-section">
              <h3 className="tm-knowledge-settings-heading">网页刷新</h3>
              <label className="tm-form-field">
                <FormLabel hint="定时重新抓取并索引知识库内全部网页，0 表示关闭。">
                  刷新间隔（小时）
                </FormLabel>
                <input
                  className="tm-form-input"
                  type="number"
                  min={0}
                  value={urlRefreshIntervalHours}
                  onChange={(event) => setUrlRefreshIntervalHours(event.target.value)}
                  placeholder="0（关闭）"
                />
              </label>
              {kb.watchConfig.lastUrlRefreshAt ? (
                <p className="tm-knowledge-detail-hint">
                  上次刷新：{new Date(kb.watchConfig.lastUrlRefreshAt).toLocaleString()}
                </p>
              ) : null}
            </section>
          ) : null}

          {isVectorizedKb ? (
          <section className="tm-knowledge-settings-section">
            <h3 className="tm-knowledge-settings-heading">检索设置</h3>
            <label className="tm-form-field">
              <FormLabel hint="检索时过滤低相关度结果的阈值（0–1），留空使用默认值。">
                匹配度阈值
              </FormLabel>
              <input
                className="tm-form-input"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={scoreThreshold}
                onChange={(event) => setScoreThreshold(event.target.value)}
                placeholder="默认值（不建议修改）"
              />
            </label>
            <label className="tm-form-field">
              <FormLabel hint="file 为 JSON 文件向量；lance 使用 LanceDB，适合较大知识库。切换后建议重建索引。">
                向量存储
              </FormLabel>
              <select
                className="tm-form-input"
                value={vectorBackend}
                onChange={(event) => setVectorBackend(event.target.value as 'file' | 'lance')}
              >
                <option value="file">JSON 文件（默认）</option>
                <option value="lance">LanceDB</option>
              </select>
            </label>
          </section>
          ) : null}

          {isVectorizedKb ? (
            <>
          <KnowledgeSearchDebugPanel workspaceId={workspaceId} kbId={kb.id} />
          <KnowledgeSourcesPanel workspaceId={workspaceId} onChanged={onSaved} />
          <KnowledgeIngestJobPanel workspaceId={workspaceId} kbId={kb.id} />
            </>
          ) : null}
          <MemoryEntryPanel workspaceId={workspaceId} />
        </div>

        <footer className="tm-modal-footer tm-modal-footer--stacked">
          {combinedError ? (
            <p ref={footerErrorRef} className="tm-form-error tm-modal-footer-error">
              {combinedError}
            </p>
          ) : null}
          <div className="tm-modal-footer-actions">
            <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button
              type="button"
              className="tm-btn tm-btn--primary"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

import {
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  IpcChannel,
  type KnowledgeBase,
} from '@toolman/shared'
import { decodeModelRef } from './useKnowledgeSettingsModels'
import {
  hasChunkChanged,
  hasEmbedReindexChanged,
  parseOptionalNonNegativeInt,
  parseOptionalPositiveInt,
  parseOptionalScoreThreshold,
  resolveEmbeddingSelection,
  textToPatterns,
} from './knowledge-base-settings-utils'

export interface SettingsFormValues {
  name: string
  description: string
  embeddingRef: string
  docProcessorProviderId: string
  rerankRef: string
  chunkSize: string
  chunkOverlap: string
  chunkStrategy: KnowledgeBase['chunkConfig']['strategy']
  watchInclude: string
  watchExclude: string
  watchDebounceMs: string
  urlRefreshIntervalHours: string
  scoreThreshold: string
  vectorBackend: 'file' | 'lance'
}

export type SubmitValidationError = { error: string }

export function validateAndBuildUpdatePayload(
  kb: KnowledgeBase,
  workspaceId: string,
  values: SettingsFormValues,
  resolvedDefaultEmbeddingRef: string,
  defaultDocProcessorProviderId: string | undefined,
  isLocalKb: boolean,
  isLocalFilesKb: boolean,
):
  | SubmitValidationError
  | {
      payload: {
        id: string
        workspaceId: string
        name: string
        description: string | null
        embedConfig?: Partial<KnowledgeBase['embedConfig']>
        chunkConfig?: Partial<KnowledgeBase['chunkConfig']>
        watchConfig?: Partial<KnowledgeBase['watchConfig']>
      }
      embedReindexChanged: boolean
      chunkChanged: boolean
    } {
  const trimmedName = values.name.trim()
  if (!trimmedName) {
    return { error: '请输入知识库名称' }
  }

  if (isLocalFilesKb) {
    return {
      payload: {
        id: kb.id,
        workspaceId,
        name: trimmedName,
        description: values.description.trim() || null,
      },
      embedReindexChanged: false,
      chunkChanged: false,
    }
  }

  const parsedChunkSize = parseOptionalPositiveInt(
    values.chunkSize,
    DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize,
    '分段大小',
  )
  if (typeof parsedChunkSize !== 'number') {
    return parsedChunkSize
  }

  const parsedChunkOverlap = parseOptionalNonNegativeInt(
    values.chunkOverlap,
    DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap,
    '重叠大小',
  )
  if (typeof parsedChunkOverlap !== 'number') {
    return parsedChunkOverlap
  }

  let parsedWatchDebounce = DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs
  let parsedUrlRefreshInterval = DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours
  if (isLocalKb) {
    const debounceResult = parseOptionalPositiveInt(
      values.watchDebounceMs,
      DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs,
      '监听防抖',
    )
    if (typeof debounceResult !== 'number') {
      return debounceResult
    }
    parsedWatchDebounce = debounceResult
  } else {
    const refreshResult = parseOptionalNonNegativeInt(
      values.urlRefreshIntervalHours,
      DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours,
      '网页刷新间隔',
    )
    if (typeof refreshResult !== 'number') {
      return refreshResult
    }
    parsedUrlRefreshInterval = refreshResult
  }

  const parsedScoreThreshold = parseOptionalScoreThreshold(values.scoreThreshold)
  if (
    typeof parsedScoreThreshold === 'object' &&
    parsedScoreThreshold !== null &&
    'error' in parsedScoreThreshold
  ) {
    return parsedScoreThreshold
  }

  const embeddingSelection = resolveEmbeddingSelection(
    values.embeddingRef,
    resolvedDefaultEmbeddingRef,
    kb.embedConfig,
  )
  if (!embeddingSelection?.modelId) {
    return { error: '请选择嵌入模型' }
  }

  const rerankSelection = values.rerankRef ? decodeModelRef(values.rerankRef) : null
  const storedDocProcessorProviderId =
    values.docProcessorProviderId || defaultDocProcessorProviderId || null

  const embedConfig: Partial<KnowledgeBase['embedConfig']> = {
    embedProviderId: embeddingSelection.providerId || null,
    embedModelId: embeddingSelection.modelId,
    rerankProviderId: rerankSelection?.providerId || null,
    rerankModelId: rerankSelection?.modelId || null,
    ...(isLocalKb ? { docProcessorProviderId: storedDocProcessorProviderId } : {}),
    vectorBackend: values.vectorBackend,
    scoreThreshold: parsedScoreThreshold,
  }

  const chunkConfig: Partial<KnowledgeBase['chunkConfig']> = {
    chunkSize: parsedChunkSize,
    chunkOverlap: parsedChunkOverlap,
    strategy: values.chunkStrategy,
  }

  const watchConfig: Partial<KnowledgeBase['watchConfig']> | undefined = isLocalKb
    ? {
        include: textToPatterns(values.watchInclude),
        exclude: textToPatterns(values.watchExclude),
        debounceMs: parsedWatchDebounce,
      }
    : {
        urlRefreshIntervalHours: parsedUrlRefreshInterval,
      }

  const embedReindexChanged = hasEmbedReindexChanged(
    kb,
    resolvedDefaultEmbeddingRef,
    values.embeddingRef,
    values.rerankRef,
    values.vectorBackend,
    values.scoreThreshold,
  )
  const chunkChanged = hasChunkChanged(
    kb,
    values.chunkSize,
    values.chunkOverlap,
    values.chunkStrategy,
  )

  return {
    payload: {
      id: kb.id,
      workspaceId,
      name: trimmedName,
      description: values.description.trim() || null,
      embedConfig,
      chunkConfig,
      watchConfig,
    },
    embedReindexChanged,
    chunkChanged,
  }
}

export async function openStorageInFinder(path: string): Promise<string | null> {
  const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
  if (!result.ok) return result.error.message
  const data = result.data as { opened: boolean; error?: string }
  if (!data.opened && data.error) return data.error
  return null
}

export async function submitKnowledgeBaseUpdate(
  workspaceId: string,
  kb: KnowledgeBase,
  values: SettingsFormValues,
  resolvedDefaultEmbeddingRef: string,
  defaultDocProcessorProviderId: string | undefined,
  isLocalKb: boolean,
  isLocalFilesKb: boolean,
  reindexConfirmMessage: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const built = validateAndBuildUpdatePayload(
    kb,
    workspaceId,
    values,
    resolvedDefaultEmbeddingRef,
    defaultDocProcessorProviderId,
    isLocalKb,
    isLocalFilesKb,
  )
  if ('error' in built) {
    return { ok: false, error: built.error }
  }

  const result = await window.api.invoke(IpcChannel.KnowledgeBaseUpdate, built.payload)
  if (!result.ok) {
    return { ok: false, error: result.error.message }
  }

  if (kb.documentCount > 0 && (built.embedReindexChanged || built.chunkChanged)) {
    const shouldReindex = window.confirm(reindexConfirmMessage)
    if (shouldReindex) {
      const reindexResult = await window.api.invoke(IpcChannel.KnowledgeKbReindex, {
        workspaceId,
        kbId: kb.id,
      })
      if (!reindexResult.ok) {
        return { ok: false, error: reindexResult.error.message }
      }
    }
  }

  return { ok: true }
}

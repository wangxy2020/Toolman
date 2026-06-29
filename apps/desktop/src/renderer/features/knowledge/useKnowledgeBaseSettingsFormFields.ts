import { useEffect, useMemo, useState } from 'react'
import type { KnowledgeBase } from '@toolman/shared'
import {
  decodeModelRef,
  encodeModelRef,
  formatModelLabel,
  type KnowledgeModelOption,
} from './useKnowledgeSettingsModels'
import { buildStoragePathForKb } from './knowledge-import-files'
import { SYSTEM_DEFAULT_FOLDER_KB_NAME, SYSTEM_DEFAULT_FOLDER_KB_NAMES } from './knowledge-sidebar-types'
import {
  getInitialFormState,
  resolveEmbeddingRef,
  resolveRerankRef,
} from './knowledge-base-settings-utils'

export function resolveKbStoragePath(
  kbName: string,
  isLocalKb: boolean,
  isLocalFilesKb: boolean,
  localPath: string | null,
  localFilesPath: string | null,
  networkPath: string | null,
): string | null {
  const resolvePath = (base: string | null) => {
    if (!base) return null
    if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kbName)) {
      return buildStoragePathForKb(base, SYSTEM_DEFAULT_FOLDER_KB_NAME) || null
    }
    return buildStoragePathForKb(base, kbName) || null
  }
  if (isLocalFilesKb) return resolvePath(localFilesPath)
  if (isLocalKb) return resolvePath(localPath)
  return resolvePath(networkPath)
}

export function buildEmbeddingOptions(
  embeddingModels: KnowledgeModelOption[],
  embeddingRef: string,
  resolvedDefaultEmbeddingRef: string,
  docProcessorProviders: Array<{ value: string; label: string }>,
): KnowledgeModelOption[] {
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
}

export function resolveDefaultEmbeddingRef(
  kb: KnowledgeBase,
  defaultEmbeddingRef: string | undefined,
): string {
  if (defaultEmbeddingRef) return defaultEmbeddingRef
  if (kb.embedConfig.embedProviderId && kb.embedConfig.embedModelId) {
    return encodeModelRef(kb.embedConfig.embedProviderId, kb.embedConfig.embedModelId)
  }
  return encodeModelRef('', kb.embedConfig.embedModelId)
}

export function useKnowledgeBaseSettingsFormFields(
  kb: KnowledgeBase,
  resolvedDefaultEmbeddingRef: string,
  defaultDocProcessorProviderId: string | undefined,
) {
  const initial = getInitialFormState(kb)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [embeddingRef, setEmbeddingRef] = useState('')
  const [docProcessorProviderId, setDocProcessorProviderId] = useState(initial.docProcessorProviderId)
  const [rerankRef, setRerankRef] = useState('')
  const [chunkSize, setChunkSize] = useState(initial.chunkSize)
  const [chunkOverlap, setChunkOverlap] = useState(initial.chunkOverlap)
  const [chunkStrategy, setChunkStrategy] = useState(initial.chunkStrategy)
  const [watchInclude, setWatchInclude] = useState(initial.watchInclude)
  const [watchExclude, setWatchExclude] = useState(initial.watchExclude)
  const [watchDebounceMs, setWatchDebounceMs] = useState(initial.watchDebounceMs)
  const [urlRefreshIntervalHours, setUrlRefreshIntervalHours] = useState(initial.urlRefreshIntervalHours)
  const [scoreThreshold, setScoreThreshold] = useState(initial.scoreThreshold)
  const [vectorBackend, setVectorBackend] = useState(initial.vectorBackend)

  useEffect(() => {
    const next = getInitialFormState(kb)
    setName(next.name)
    setDescription(next.description)
    setEmbeddingRef(resolveEmbeddingRef(kb.embedConfig, resolvedDefaultEmbeddingRef))
    setDocProcessorProviderId(next.docProcessorProviderId)
    setRerankRef(resolveRerankRef(kb.embedConfig))
    setChunkSize(next.chunkSize)
    setChunkOverlap(next.chunkOverlap)
    setChunkStrategy(next.chunkStrategy)
    setWatchInclude(next.watchInclude)
    setWatchExclude(next.watchExclude)
    setWatchDebounceMs(next.watchDebounceMs)
    setUrlRefreshIntervalHours(next.urlRefreshIntervalHours)
    setScoreThreshold(next.scoreThreshold)
    setVectorBackend(next.vectorBackend)
  }, [kb.id, kb.updatedAt, resolvedDefaultEmbeddingRef])

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

  return {
    name,
    setName,
    description,
    setDescription,
    embeddingRef,
    setEmbeddingRef,
    docProcessorProviderId,
    setDocProcessorProviderId,
    rerankRef,
    setRerankRef,
    chunkSize,
    setChunkSize,
    chunkOverlap,
    setChunkOverlap,
    chunkStrategy,
    setChunkStrategy,
    watchInclude,
    setWatchInclude,
    watchExclude,
    setWatchExclude,
    watchDebounceMs,
    setWatchDebounceMs,
    urlRefreshIntervalHours,
    setUrlRefreshIntervalHours,
    scoreThreshold,
    setScoreThreshold,
    vectorBackend,
    setVectorBackend,
  }
}

export function useResolvedDefaultEmbeddingRef(
  kb: KnowledgeBase,
  defaultEmbeddingRef: string | undefined,
) {
  return useMemo(
    () => resolveDefaultEmbeddingRef(kb, defaultEmbeddingRef),
    [defaultEmbeddingRef, kb.embedConfig.embedModelId, kb.embedConfig.embedProviderId],
  )
}

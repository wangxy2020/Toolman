import {
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  type KnowledgeBase,
} from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { decodeModelRef, encodeModelRef } from './useKnowledgeSettingsModels'
import { DEFAULT_SCORE_THRESHOLD, type SettingsTab } from './knowledge-base-settings-types'

export function formatOptionalNumber(value: number, defaultValue: number): string {
  return value === defaultValue ? '' : String(value)
}

export function parseOptionalPositiveInt(
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

export function parseOptionalNonNegativeInt(
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

export function parseOptionalScoreThreshold(value: string): number | { error: string } | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return { error: '匹配度阈值须在 0 到 1 之间' }
  }
  return parsed
}

export function patternsToText(patterns: string[]): string {
  return patterns.join('\n')
}

export function textToPatterns(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function resolveEmbeddingRef(
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

export function resolveRerankRef(embedConfig: KnowledgeBase['embedConfig']): string {
  if (embedConfig.rerankProviderId && embedConfig.rerankModelId) {
    return encodeModelRef(embedConfig.rerankProviderId, embedConfig.rerankModelId)
  }
  return ''
}

export function resolveEmbeddingSelection(
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

export function formatMemoryBadge(count: number): string | undefined {
  if (count <= 0) return undefined
  return count > 9 ? '9+' : String(count)
}

export function buildSettingsTabs(
  t: TranslateFn,
  options: {
    isLocalFilesKb: boolean
    isLocalKb: boolean
    isNetworkKb: boolean
    isVectorizedKb: boolean
    memoryCount: number
  },
): Array<{ id: SettingsTab; label: string; badge?: string }> {
  const { isLocalFilesKb, isLocalKb, isNetworkKb, isVectorizedKb, memoryCount } = options
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
}

export function getModalTitle(
  t: TranslateFn,
  isLocalFilesKb: boolean,
  isLocalKb: boolean,
): string {
  if (isLocalFilesKb) return t('knowledgePage.settings.titleLocalFiles')
  if (isLocalKb) return t('knowledgePage.settings.titleLocal')
  return t('knowledgePage.settings.titleNetwork')
}

export function getInitialFormState(kb: KnowledgeBase) {
  return {
    name: kb.name,
    description: kb.description ?? '',
    docProcessorProviderId: kb.embedConfig.docProcessorProviderId ?? '',
    chunkSize: formatOptionalNumber(kb.chunkConfig.chunkSize, DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize),
    chunkOverlap: formatOptionalNumber(
      kb.chunkConfig.chunkOverlap,
      DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap,
    ),
    chunkStrategy: kb.chunkConfig.strategy,
    watchInclude: patternsToText(kb.watchConfig.include),
    watchExclude: patternsToText(kb.watchConfig.exclude),
    watchDebounceMs: formatOptionalNumber(
      kb.watchConfig.debounceMs,
      DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs,
    ),
    urlRefreshIntervalHours: formatOptionalNumber(
      kb.watchConfig.urlRefreshIntervalHours ?? 0,
      DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours,
    ),
    scoreThreshold:
      kb.embedConfig.scoreThreshold === undefined
        ? ''
        : formatOptionalNumber(kb.embedConfig.scoreThreshold, DEFAULT_SCORE_THRESHOLD),
    vectorBackend: (kb.embedConfig.vectorBackend ?? 'file') as 'file' | 'lance',
  }
}

export function hasEmbedReindexChanged(
  kb: KnowledgeBase,
  resolvedDefaultEmbeddingRef: string,
  embeddingRef: string,
  rerankRef: string,
  vectorBackend: 'file' | 'lance',
  scoreThreshold: string,
): boolean {
  return (
    embeddingRef !== resolveEmbeddingRef(kb.embedConfig, resolvedDefaultEmbeddingRef) ||
    rerankRef !== resolveRerankRef(kb.embedConfig) ||
    vectorBackend !== (kb.embedConfig.vectorBackend ?? 'file') ||
    (scoreThreshold.trim() ? Number(scoreThreshold) : undefined) !== kb.embedConfig.scoreThreshold
  )
}

export function hasChunkChanged(
  kb: KnowledgeBase,
  chunkSize: string,
  chunkOverlap: string,
  chunkStrategy: KnowledgeBase['chunkConfig']['strategy'],
): boolean {
  return (
    (chunkSize.trim() ? Number(chunkSize) : DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize) !==
      kb.chunkConfig.chunkSize ||
    (chunkOverlap.trim() ? Number(chunkOverlap) : DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap) !==
      kb.chunkConfig.chunkOverlap ||
    chunkStrategy !== kb.chunkConfig.strategy
  )
}

export function hasWatchChanged(
  kb: KnowledgeBase,
  watchInclude: string,
  watchExclude: string,
  watchDebounceMs: string,
  urlRefreshIntervalHours: string,
): boolean {
  return (
    textToPatterns(watchInclude).join('\n') !== kb.watchConfig.include.join('\n') ||
    textToPatterns(watchExclude).join('\n') !== kb.watchConfig.exclude.join('\n') ||
    (watchDebounceMs.trim()
      ? Number(watchDebounceMs)
      : DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs) !== kb.watchConfig.debounceMs ||
    (urlRefreshIntervalHours.trim()
      ? Number(urlRefreshIntervalHours)
      : DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours) !==
      (kb.watchConfig.urlRefreshIntervalHours ?? 0)
  )
}

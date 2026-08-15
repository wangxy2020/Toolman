import {
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
} from '@toolman/shared'
import type { MobileCreatedKb } from '../storage/createdKnowledgeBases'
import type { KnowledgeMetaItem } from '../sync/mobileSync'
import type { KnowledgeSidebarSection } from './knowledgeSidebar'

export type KnowledgeSettingsTab = 'basic' | 'watch' | 'memory' | 'advanced'

export function knowledgeSettingsTitle(kind: string | null): string {
  if (kind === 'sync') return '同步知识库设置'
  if (kind === 'local') return '本地知识库设置'
  if (kind === 'network') return '网络知识库设置'
  return '知识库设置'
}

export function resolveKnowledgeSettingsKind(input: {
  createdKb: MobileCreatedKb | null
  syncedKb: KnowledgeMetaItem | null
  activeSection?: KnowledgeSidebarSection | null
}): string | null {
  return (
    input.createdKb?.kind ??
    (input.activeSection === 'network' || input.activeSection === 'local'
      ? input.activeSection
      : input.activeSection === 'sync'
        ? 'sync'
        : input.syncedKb?.kind ?? input.activeSection ?? null)
  )
}

export function knowledgeSettingsTabs(
  isLocalKb: boolean,
  isNetworkKb: boolean,
): Array<{ id: KnowledgeSettingsTab; label: string }> {
  const next: Array<{ id: KnowledgeSettingsTab; label: string }> = [
    { id: 'basic', label: '基础与模型' },
  ]
  if (isLocalKb) next.push({ id: 'watch', label: '文件夹监听' })
  if (isNetworkKb) next.push({ id: 'watch', label: '网页刷新' })
  next.push({ id: 'memory', label: '长期记忆' })
  next.push({ id: 'advanced', label: '高级与调试' })
  return next
}

export function knowledgeChunkStrategyLabel(): string {
  if (DEFAULT_KNOWLEDGE_CHUNK_CONFIG.strategy === 'markdown') return 'Markdown 结构'
  if (DEFAULT_KNOWLEDGE_CHUNK_CONFIG.strategy === 'fixed') return '固定长度'
  return '语义分块'
}

export function parseWatchDebounceMs(raw: string): number {
  const debounce = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(debounce) && debounce > 0
    ? debounce
    : DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs
}

export function parseUrlRefreshIntervalHours(raw: string): number {
  const refreshHours = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(refreshHours) && refreshHours >= 0
    ? refreshHours
    : DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours
}

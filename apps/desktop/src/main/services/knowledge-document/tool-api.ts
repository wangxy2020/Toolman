import type { KnowledgeSearchResult } from '@toolman/shared'
import {
  KnowledgeDocumentReindexInputSchema,
  KnowledgeKbReindexInputSchema,
  filterSearchableKnowledgeBaseIds,
  knowledgeKindAllowsRetrieval,
  resolveKnowledgeRetrievalScope,
} from '@toolman/shared'
import { getKnowledgeBaseRepository } from '../../db/repos'
import {
  startReindexDocumentInBackground,
  startReindexKnowledgeBaseInBackground,
} from '../knowledge-ingest.service'
import { searchKnowledge } from './search'

function listSearchableKbIds(workspaceId: string): string[] {
  return filterSearchableKnowledgeBaseIds(
    getKnowledgeBaseRepository().listByWorkspace(workspaceId),
  )
}

export function formatSearchLocalKnowledgeHits(
  results: Array<{
    kbName: string
    documentTitle: string
    score: number
    text: string
    pageNumber?: number
    chunkIndex?: number
  }>,
): string {
  return results
    .map((item, index) => {
      const page = item.pageNumber != null ? ` page_number=${item.pageNumber}` : ''
      const chunk = item.chunkIndex != null ? ` chunk=${item.chunkIndex}` : ''
      return `${index + 1}. document=${item.documentTitle}${page}${chunk} [${item.kbName}] (${(item.score * 100).toFixed(1)}%)\n${item.text.trim()}`
    })
    .join('\n\n')
}

export function formatLocalKnowledgeList(
  items: Array<{ id: string; name: string; documentCount: number; chunkCount: number }>,
): string {
  if (items.length === 0) return '当前工作区暂无本地知识库。'
  return items
    .map(
      (item) =>
        `- ${item.name} (id: ${item.id}, 文档 ${item.documentCount}, 分块 ${item.chunkCount})`,
    )
    .join('\n')
}

export function listKnowledgeBasesForTool(workspaceId: string) {
  return getKnowledgeBaseRepository()
    .listByWorkspace(workspaceId)
    .filter((kb) => knowledgeKindAllowsRetrieval(kb.kind))
    .map((kb) => ({
      id: kb.id,
      name: kb.name,
      documentCount: kb.documentCount,
      chunkCount: kb.chunkCount,
    }))
}

export async function searchKnowledgeForTool(options: {
  workspaceId: string
  query: string
  kbIds: string[]
  topK?: number
  scoreThreshold?: number
  kbSettings?: Record<string, { topK?: number; scoreThreshold?: number }>
}) {
  if (options.kbIds.length === 0) return []

  return searchKnowledge({
    workspaceId: options.workspaceId,
    kbIds: options.kbIds,
    query: options.query,
    topK: options.topK ?? 6,
    scoreThreshold: options.scoreThreshold,
    kbSettings: options.kbSettings,
  })
}

export function getAssistantKbIds(assistant: { kbIdsJson: string } | null): string[] {
  if (!assistant) return []
  try {
    const parsed = JSON.parse(assistant.kbIdsJson) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export async function searchKnowledgeForChat(options: {
  workspaceId: string
  kbIds: string[]
  query: string
  topK?: number
  scoreThreshold?: number
  kbSettings?: Record<string, { topK?: number; scoreThreshold?: number }>
}): Promise<KnowledgeSearchResult[]> {
  if (options.kbIds.length === 0) return []
  return searchKnowledge({
    workspaceId: options.workspaceId,
    kbIds: options.kbIds,
    query: options.query,
    topK: options.topK ?? 6,
    scoreThreshold: options.scoreThreshold,
    kbSettings: options.kbSettings,
  })
}

export function resolveEffectiveKbIds(options: {
  workspaceId: string
  assistant: { kbIdsJson: string } | null
  overrideKbIds?: string[]
  explicitDenyKbIds?: string[]
}): string[] {
  const searchableKbIds = listSearchableKbIds(options.workspaceId)
  if (options.overrideKbIds?.length) {
    return resolveKnowledgeRetrievalScope({
      searchableKbIds,
      explicitAllow: options.overrideKbIds,
      explicitDeny: options.explicitDenyKbIds,
      defaultAllowAll: false,
    })
  }

  const assistantKbIds = getAssistantKbIds(options.assistant)
  const scoped = resolveKnowledgeRetrievalScope({
    searchableKbIds,
    explicitAllow: assistantKbIds,
    explicitDeny: options.explicitDenyKbIds,
    defaultAllowAll: assistantKbIds.length === 0,
  })
  if (scoped.length > 0 || assistantKbIds.length === 0) return scoped

  // Bound KB was deleted / rebuilt — treat as unbound rather than searching nothing.
  return resolveKnowledgeRetrievalScope({
    searchableKbIds,
    explicitAllow: [],
    explicitDeny: options.explicitDenyKbIds,
    defaultAllowAll: true,
  })
}

export async function reindexKnowledgeDocument(input: unknown) {
  const data = KnowledgeDocumentReindexInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }
  return startReindexDocumentInBackground({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentId: data.documentId,
  })
}

export async function reindexKnowledgeBaseDocuments(input: unknown) {
  const data = KnowledgeKbReindexInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }
  return startReindexKnowledgeBaseInBackground({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentIds: data.documentIds,
  })
}

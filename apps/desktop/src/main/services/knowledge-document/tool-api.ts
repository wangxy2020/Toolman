import type { KnowledgeSearchResult } from '@toolman/shared'
import {
  KnowledgeDocumentReindexInputSchema,
  KnowledgeKbReindexInputSchema,
} from '@toolman/shared'
import { getKnowledgeBaseRepository } from '../../db/repos'
import { reindexDocument, reindexKnowledgeBase } from '../knowledge-ingest.service'
import { searchKnowledge } from './search'

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
}): string[] {
  if (options.overrideKbIds?.length) {
    return options.overrideKbIds
  }

  const assistantKbIds = getAssistantKbIds(options.assistant)
  if (assistantKbIds.length > 0) {
    return assistantKbIds
  }

  return getKnowledgeBaseRepository()
    .listByWorkspace(options.workspaceId)
    .map((kb) => kb.id)
}

export async function reindexKnowledgeDocument(input: unknown) {
  const data = KnowledgeDocumentReindexInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }
  return reindexDocument({
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
  return reindexKnowledgeBase({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
  })
}

import { join } from 'node:path'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { app } from 'electron'
import {
  embedTexts,
  FileVectorStore,
  getMemoryVectorStorePath,
  hashText,
  MEMORY_VECTOR_KB_ID,
} from '@toolman/knowledge'
import type { VectorRecord } from '@toolman/knowledge'
import { getMemoryEntryRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveWorkspaceEmbedConfig } from './knowledge-embed.service'

export interface MemorySearchHit {
  id: string
  content: string
  score: number
}

function memoryVectorsDir(workspaceId: string): string {
  return join(getWorkspaceKnowledgeDir(workspaceId), 'vectors')
}

export async function indexMemoryEntry(options: {
  workspaceId: string
  entryId: string
  content: string
}): Promise<void> {
  const embed = resolveWorkspaceEmbedConfig(options.workspaceId)
  const [vector] = await embedTexts(embed.embedOptions, [options.content])
  const store = new FileVectorStore(getMemoryVectorStorePath(memoryVectorsDir(options.workspaceId)))

  const record: VectorRecord = {
    chunkId: options.entryId,
    documentId: options.entryId,
    kbId: MEMORY_VECTOR_KB_ID,
    vector,
    metadata: {
      title: options.content.slice(0, 80),
    },
  }

  store.upsert([record], {
    dimension: vector.length,
    model: embed.embedModel,
  })
}

export async function searchMemoryVectors(
  workspaceId: string,
  query: string,
  options?: { topK?: number; scoreThreshold?: number },
): Promise<MemorySearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const embed = resolveWorkspaceEmbedConfig(workspaceId)
  const [queryVector] = await embedTexts(embed.embedOptions, [trimmed])
  const store = new FileVectorStore(getMemoryVectorStorePath(memoryVectorsDir(workspaceId)))
  const topK = options?.topK ?? 6
  const scoreThreshold = options?.scoreThreshold ?? 0.35

  const hits = store
    .search(queryVector, topK, MEMORY_VECTOR_KB_ID)
    .filter((hit) => hit.score >= scoreThreshold)

  const repo = getMemoryEntryRepository()
  const results: MemorySearchHit[] = []

  for (const hit of hits) {
    const entry = repo.findById(hit.documentId, workspaceId)
    if (!entry) continue
    results.push({
      id: entry.id,
      content: entry.content,
      score: hit.score,
    })
  }

  return results
}

export function removeMemoryVector(workspaceId: string, entryId: string): void {
  const store = new FileVectorStore(getMemoryVectorStorePath(memoryVectorsDir(workspaceId)))
  const current = store.load()
  store.save({
    ...current,
    records: current.records.filter((record) => record.documentId !== entryId),
  })
}

/** 删除各工作区下的长期记忆向量文件 */
export function purgeAllMemoryVectors(): void {
  const knowledgeRoot = join(app.getPath('userData'), 'knowledge')
  if (!existsSync(knowledgeRoot)) return

  for (const entry of readdirSync(knowledgeRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const memoryVectorPath = join(knowledgeRoot, entry.name, 'vectors', 'memory.vectors.json')
    if (existsSync(memoryVectorPath)) {
      rmSync(memoryVectorPath, { force: true })
    }
  }
}

export async function migrateJsonMemoriesToDb(options: {
  workspaceId: string
  entries: Array<{ id: string; content: string; assistantId?: string; createdAt: number }>
}): Promise<void> {
  const repo = getMemoryEntryRepository()
  for (const item of options.entries) {
    const contentHash = hashText(item.content)
    if (repo.findByHash(options.workspaceId, contentHash)) continue

    const row = repo.create({
      workspaceId: options.workspaceId,
      content: item.content,
      contentHash,
      assistantId: item.assistantId ?? null,
      source: 'import',
    })

    try {
      await indexMemoryEntry({
        workspaceId: options.workspaceId,
        entryId: row.id,
        content: row.content,
      })
    } catch {
      // 向量索引失败不阻断 JSON 迁移
    }
  }
}

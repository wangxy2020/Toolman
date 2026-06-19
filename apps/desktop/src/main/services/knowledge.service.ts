import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  KnowledgeBaseCreateInputSchema,
  KnowledgeBaseDeleteInputSchema,
  KnowledgeBaseGetInputSchema,
  KnowledgeBaseListInputSchema,
  KnowledgeBaseSchema,
  KnowledgeBaseUpdateInputSchema,
  KnowledgeChunkConfigSchema,
  KnowledgeEmbedConfigSchema,
  KnowledgeWatchConfigSchema,
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  type KnowledgeBase,
} from '@toolman/shared'
import { removeKbVectors } from '@toolman/knowledge'
import type { KnowledgeBaseRow } from '@toolman/db'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { resolveDefaultDocProcessorProviderId } from './provider.service'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { removeKbFts } from './knowledge-fts.service'
import { restartKnowledgeWatchersForKb, stopKnowledgeWatchersForKb } from './knowledge-watcher.service'

export function getWorkspaceKnowledgeDir(workspaceId: string): string {
  const dir = join(app.getPath('userData'), 'knowledge', workspaceId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  mkdirSync(join(dir, 'vectors'), { recursive: true })
  mkdirSync(join(dir, 'parsed'), { recursive: true })
  mkdirSync(join(dir, 'snapshots'), { recursive: true })
  return dir
}

function parseJson<T>(value: string, schema: { parse: (input: unknown) => T }, fallback: T): T {
  try {
    return schema.parse(JSON.parse(value))
  } catch {
    return fallback
  }
}

function toKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return KnowledgeBaseSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    kind: row.kind ?? 'local',
    embedConfig: parseJson(row.embedConfigJson, KnowledgeEmbedConfigSchema, DEFAULT_KNOWLEDGE_EMBED_CONFIG),
    chunkConfig: parseJson(row.chunkConfigJson, KnowledgeChunkConfigSchema, DEFAULT_KNOWLEDGE_CHUNK_CONFIG),
    watchConfig: parseJson(row.watchConfigJson, KnowledgeWatchConfigSchema, DEFAULT_KNOWLEDGE_WATCH_CONFIG),
    status: row.status,
    documentCount: row.documentCount,
    chunkCount: row.chunkCount,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export function listKnowledgeBases(input: unknown): KnowledgeBase[] {
  const data = KnowledgeBaseListInputSchema.parse(input)
  const rows = getKnowledgeBaseRepository().listByWorkspace(data.workspaceId)
  return rows.map(toKnowledgeBase)
}

export function getKnowledgeBase(input: unknown): KnowledgeBase | null {
  const data = KnowledgeBaseGetInputSchema.parse(input)
  const row = getKnowledgeBaseRepository().findRowById(data.id, data.workspaceId)
  return row ? toKnowledgeBase(row) : null
}

export function createKnowledgeBase(input: unknown): KnowledgeBase {
  const data = KnowledgeBaseCreateInputSchema.parse(input)
  getWorkspaceKnowledgeDir(data.workspaceId)

  const defaultDocProcessorProviderId = resolveDefaultDocProcessorProviderId(data.workspaceId)

  const embedConfig = KnowledgeEmbedConfigSchema.parse({
    ...DEFAULT_KNOWLEDGE_EMBED_CONFIG,
    docProcessorProviderId: defaultDocProcessorProviderId,
    ...data.embedConfig,
  })
  const chunkConfig = KnowledgeChunkConfigSchema.parse({
    ...DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
    ...data.chunkConfig,
  })
  const watchConfig = KnowledgeWatchConfigSchema.parse({
    ...DEFAULT_KNOWLEDGE_WATCH_CONFIG,
    ...data.watchConfig,
  })

  const row = getKnowledgeBaseRepository().create({
    workspaceId: data.workspaceId,
    name: data.name,
    description: data.description,
    kind: data.kind ?? 'local',
    embedConfigJson: JSON.stringify(embedConfig),
    chunkConfigJson: JSON.stringify(chunkConfig),
    watchConfigJson: JSON.stringify(watchConfig),
  })

  const storagePath = resolveKnowledgeBaseStoragePath(row, { ensure: true })
  if (storagePath) {
    ensureKnowledgeBaseStorageSource(data.workspaceId, row.id, storagePath)
    restartKnowledgeWatchersForKb(data.workspaceId, row.id)
  }

  return toKnowledgeBase(row)
}

export function updateKnowledgeBase(input: unknown): KnowledgeBase | null {
  const data = KnowledgeBaseUpdateInputSchema.parse(input)
  const repo = getKnowledgeBaseRepository()
  const existing = repo.findRowById(data.id, data.workspaceId)
  if (!existing) return null

  const currentEmbed = parseJson(
    existing.embedConfigJson,
    KnowledgeEmbedConfigSchema,
    DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  )
  const currentChunk = parseJson(
    existing.chunkConfigJson,
    KnowledgeChunkConfigSchema,
    DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  )
  const currentWatch = parseJson(
    existing.watchConfigJson,
    KnowledgeWatchConfigSchema,
    DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  )

  const row = repo.update({
    id: data.id,
    workspaceId: data.workspaceId,
    name: data.name,
    description: data.description,
    embedConfigJson: data.embedConfig
      ? JSON.stringify(KnowledgeEmbedConfigSchema.parse({ ...currentEmbed, ...data.embedConfig }))
      : undefined,
    chunkConfigJson: data.chunkConfig
      ? JSON.stringify(KnowledgeChunkConfigSchema.parse({ ...currentChunk, ...data.chunkConfig }))
      : undefined,
    watchConfigJson: data.watchConfig
      ? JSON.stringify(KnowledgeWatchConfigSchema.parse({ ...currentWatch, ...data.watchConfig }))
      : undefined,
  })

  if (row && data.watchConfig) {
    restartKnowledgeWatchersForKb(data.workspaceId, data.id)
  }

  return row ? toKnowledgeBase(row) : null
}

export async function deleteKnowledgeBase(input: unknown): Promise<boolean> {
  const data = KnowledgeBaseDeleteInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const existing = kbRepo.findRowById(data.id, data.workspaceId)
  if (!existing) return false

  stopKnowledgeWatchersForKb(data.workspaceId, data.id)

  const embedConfig = parseJson(
    existing.embedConfigJson,
    KnowledgeEmbedConfigSchema,
    DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  )

  const docRepo = getDocumentRepository()
  const documentIds = docRepo.listActiveDocumentIdsByKb(data.id)

  const vectorsDir = join(getWorkspaceKnowledgeDir(data.workspaceId), 'vectors')
  await removeKbVectors(vectorsDir, data.id, embedConfig.vectorBackend)
  removeKbFts(data.id)

  docRepo.clearRegistryForDocumentIds(documentIds)
  docRepo.deleteIngestJobsByKb(data.id)
  docRepo.softDeleteAllChunksByKb(data.id)
  docRepo.softDeleteAllSourcesByKb(data.id)
  docRepo.softDeleteAllByKb(data.id)

  return kbRepo.softDelete(data.id, data.workspaceId)
}

export async function purgeAllKnowledgeStorageData(): Promise<void> {
  const kbRepo = getKnowledgeBaseRepository()
  const docRepo = getDocumentRepository()

  for (const kb of kbRepo.listAllActive()) {
    stopKnowledgeWatchersForKb(kb.workspaceId, kb.id)

    const embedConfig = parseJson(
      kb.embedConfigJson,
      KnowledgeEmbedConfigSchema,
      DEFAULT_KNOWLEDGE_EMBED_CONFIG,
    )

    const documentIds = docRepo.listActiveDocumentIdsByKb(kb.id)
    const vectorsDir = join(getWorkspaceKnowledgeDir(kb.workspaceId), 'vectors')
    await removeKbVectors(vectorsDir, kb.id, embedConfig.vectorBackend)
    removeKbFts(kb.id)

    docRepo.clearRegistryForDocumentIds(documentIds)
    docRepo.deleteIngestJobsByKb(kb.id)
    docRepo.softDeleteAllChunksByKb(kb.id)
    docRepo.softDeleteAllSourcesByKb(kb.id)
    docRepo.softDeleteAllByKb(kb.id)

    kbRepo.update({
      id: kb.id,
      workspaceId: kb.workspaceId,
      documentCount: 0,
      chunkCount: 0,
      status: 'idle',
    })
  }
}

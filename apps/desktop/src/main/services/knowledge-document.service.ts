import {
  KnowledgeDocumentDeleteInputSchema,
  KnowledgeDocumentIngestInputSchema,
  KnowledgeDocumentListInputSchema,
  KnowledgeDocumentSchema,
  KnowledgeSearchInputSchema,
  KnowledgeSearchResultSchema,
  KnowledgeDocumentReindexInputSchema,
  KnowledgeKbReindexInputSchema,
  KnowledgeIngestJobListInputSchema,
  KnowledgeIngestJobSchema,
  type KnowledgeDocument,
  type KnowledgeIngestJob,
  type KnowledgeSearchResult,
} from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import {
  embedTexts,
  fuseHybridResults,
  dedupeByDocument,
  rerankDocuments,
  openKbVectorStore,
  isIgnoredKnowledgeIngestFile,
  type VectorSearchHit,
} from '@toolman/knowledge'
import { join } from 'node:path'
import type { KnowledgeBaseRow } from '@toolman/db'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveEmbedConfig, resolveKbScoreThreshold, resolveRerankConfig } from './knowledge-embed.service'
import { prepareIngestQueue, purgeIndexedDocument, reconcileStuckLocalFilesDocuments, reindexDocument, reindexKnowledgeBase, startIngestFilePathsInBackground } from './knowledge-ingest.service'
import { searchChunksFts } from './knowledge-fts.service'
import { deleteKnowledgeFolderFile, isPathInsideFolder } from './knowledge-folder-files.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { assertKnowledgeBaseAcceptsLocalFiles } from './knowledge-kb-kind-guard'

function parseErrorJson(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { message?: string }
    return parsed.message ?? value
  } catch {
    return value
  }
}

function inferSourceKind(absolutePath: string | null | undefined): KnowledgeDocument['sourceKind'] {
  if (!absolutePath) return 'file'
  return absolutePath.startsWith('http://') || absolutePath.startsWith('https://') ? 'url' : 'file'
}

function deleteManagedKnowledgeFileFromDisk(
  kb: KnowledgeBaseRow,
  absolutePath: string | null | undefined,
): void {
  if (!absolutePath || inferSourceKind(absolutePath) === 'url') return
  if (kb.kind === 'shared' || kb.kind === 'network') return

  const storagePath = resolveKnowledgeBaseStoragePath(kb, { ensure: false })
  if (!storagePath || !isPathInsideFolder(storagePath, absolutePath)) return

  deleteKnowledgeFolderFile({
    folderPath: storagePath,
    filePath: absolutePath,
  })
}

function toDocument(
  row: {
    id: string
    kbId: string
    title: string
    contentHash: string | null
    mimeType: string | null
    status: KnowledgeDocument['status']
    absolutePath: string | null
    errorJson: string | null
    createdAt: Date
    updatedAt: Date
  },
  chunkCount: number,
  sizeBytes?: number | null,
): KnowledgeDocument {
  return KnowledgeDocumentSchema.parse({
    id: row.id,
    kbId: row.kbId,
    title: row.title,
    contentHash: row.contentHash,
    mimeType: row.mimeType,
    status: row.status,
    absolutePath: row.absolutePath,
    sourceKind: inferSourceKind(row.absolutePath),
    chunkCount,
    sizeBytes: sizeBytes ?? null,
    errorMessage: parseErrorJson(row.errorJson),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

function isIgnoredKnowledgeDocument(row: {
  absolutePath: string | null
  title: string
}): boolean {
  if (row.absolutePath && isIgnoredKnowledgeIngestFile(row.absolutePath)) return true
  return isIgnoredKnowledgeIngestFile(row.title)
}

export async function listKnowledgeDocuments(input: unknown): Promise<KnowledgeDocument[]> {
  const data = KnowledgeDocumentListInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const kb =
    kbRepo.findRowById(data.kbId, data.workspaceId) ?? kbRepo.findRowByIdOnly(data.kbId)
  if (!kb) return []

  if (kb.kind === 'local_files') {
    await reconcileStuckLocalFilesDocuments(data.workspaceId, data.kbId)
  }

  const repo = getDocumentRepository()
  return repo
    .listByKb(data.kbId)
    .filter((row) => !isIgnoredKnowledgeDocument(row))
    .map((row) => {
    const registry =
      repo.findRegistryByDocumentId(row.id) ??
      (row.absolutePath ? repo.findRegistryByPath(data.workspaceId, row.absolutePath) : null)
    return toDocument(row, repo.countChunksByDocument(row.id, data.kbId), registry?.sizeBytes ?? null)
  })
}

export function listKnowledgeIngestJobs(input: unknown): KnowledgeIngestJob[] {
  const data = KnowledgeIngestJobListInputSchema.parse(input)
  const repo = getDocumentRepository()
  return repo
    .listPendingIngestJobs({
      workspaceId: data.workspaceId,
      kbId: data.kbId,
      includeFailed: data.includeFailed ?? true,
    })
    .filter(({ document }) => !isIgnoredKnowledgeDocument(document))
    .map(({ job, document }) =>
    KnowledgeIngestJobSchema.parse({
      id: job.id,
      documentId: job.documentId,
      kbId: job.kbId,
      workspaceId: job.workspaceId,
      stage: job.stage,
      progress: job.progress,
      title: document.title,
      absolutePath: document.absolutePath,
      errorMessage: parseErrorJson(document.errorJson),
      createdAt: job.createdAt.getTime(),
    }),
  )
}

export async function ingestKnowledgeDocuments(input: unknown) {
  const data = KnowledgeDocumentIngestInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }
  assertKnowledgeBaseAcceptsLocalFiles(kb)

  const prepared = prepareIngestQueue({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    filePaths: data.filePaths,
  })

  startIngestFilePathsInBackground({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    filePaths: prepared.filePaths,
  })

  return {
    ingested: 0,
    skipped: prepared.skipped,
    queued: prepared.filePaths.length,
    failed: prepared.failed,
  }
}

export async function deleteKnowledgeDocument(input: unknown): Promise<boolean> {
  const data = KnowledgeDocumentDeleteInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) return false

  const repo = getDocumentRepository()
  const doc = repo.findById(data.documentId, data.kbId)
  if (!doc) return false

  try {
    deleteManagedKnowledgeFileFromDisk(kb, doc.absolutePath)
  } catch (error) {
    const message = toErrorMessage(error, '删除本地文件失败')
    throw new Error(message)
  }

  await purgeIndexedDocument({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    documentId: data.documentId,
  })

  getKnowledgeBaseRepository().update({
    id: data.kbId,
    workspaceId: data.workspaceId,
    documentCount: repo.countByKb(data.kbId),
    chunkCount: repo.countChunksByKb(data.kbId),
  })

  return true
}

export async function searchKnowledge(input: unknown): Promise<KnowledgeSearchResult[]> {
  const data = KnowledgeSearchInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const allKbs = kbRepo.listByWorkspace(data.workspaceId)
  const targetKbs = data.kbIds?.length
    ? allKbs.filter((kb) => data.kbIds!.includes(kb.id))
    : allKbs

  if (targetKbs.length === 0) return []

  const docRepo = getDocumentRepository()
  const vectorsDir = join(getWorkspaceKnowledgeDir(data.workspaceId), 'vectors')
  const hybridEnabled = data.hybridEnabled !== false
  const fusedHits: Array<{
    chunkId: string
    documentId: string
    score: number
  }> = []

  for (const kb of targetKbs) {
    const embed = resolveEmbedConfig(data.workspaceId, kb.id)
    const perKb = data.kbSettings?.[kb.id]
    const kbTopK = perKb?.topK ?? data.topK
    const scoreThreshold = resolveKbScoreThreshold(
      kb.embedConfigJson,
      perKb?.scoreThreshold ?? data.scoreThreshold,
    )
    const poolSize = Math.min(kbTopK * 4, 40)
    const [queryVector] = await embedTexts(embed.embedOptions, [data.query])
    const store = await openKbVectorStore({
      vectorsDir,
      kbId: kb.id,
      backend: embed.vectorBackend,
    })

    const vectorResults = (await store.search(queryVector, poolSize, kb.id))
      .filter((hit: VectorSearchHit) => hit.score >= scoreThreshold)
      .map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        score: hit.score,
      }))

    const ftsResults = hybridEnabled
      ? searchChunksFts([kb.id], data.query, poolSize).map((hit) => ({
          chunkId: hit.chunkId,
          documentId: hit.documentId,
          score: hit.score,
        }))
      : []

    let merged = hybridEnabled
      ? dedupeByDocument(
          fuseHybridResults(vectorResults, ftsResults, {
            topK: poolSize,
            vectorWeight: data.vectorWeight,
            ftsWeight: data.ftsWeight,
          }),
          poolSize,
        )
      : vectorResults

    const rerank = resolveRerankConfig(data.workspaceId, kb.id)
    if (rerank && merged.length > 1) {
      const chunkRows = docRepo.getChunksByIds(merged.map((hit) => hit.chunkId))
      const textByChunkId = new Map(chunkRows.map((row) => [row.id, row.text]))
      const documents = merged.map((hit) => textByChunkId.get(hit.chunkId) ?? '')
      const reranked = await rerankDocuments(
        rerank.rerankOptions,
        data.query,
        documents,
        poolSize,
      )
      merged = reranked.map((item) => ({
        ...merged[item.index]!,
        score: item.score,
      }))
    }

    for (const hit of merged) {
      fusedHits.push({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        score: hit.score,
      })
    }
  }

  const sorted = fusedHits.sort((a, b) => b.score - a.score).slice(0, data.topK)
  const hits: KnowledgeSearchResult[] = []

  for (const hit of sorted) {
    const chunks = docRepo.getChunksByIds([hit.chunkId])
    const chunk = chunks[0]
    if (!chunk) continue
    const doc = docRepo.findById(hit.documentId, chunk.kbId)
    if (!doc) continue
    const kb = targetKbs.find((item) => item.id === chunk.kbId)
    if (!kb) continue

    hits.push({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentTitle: doc.title,
      kbId: kb.id,
      kbName: kb.name,
      score: hit.score,
      text: chunk.text,
      sourcePath: doc.absolutePath,
    })
  }

  return hits.map((item) => KnowledgeSearchResultSchema.parse(item))
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

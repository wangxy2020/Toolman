import { statSync } from 'node:fs'
import { join } from 'node:path'
import { toErrorMessage } from '@toolman/shared'
import {
  hashFileBytes,
  isIgnoredKnowledgeIngestFile,
  removeDocumentVectors,
} from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveEmbedConfig } from './knowledge-embed.service'
import { knowledgeIngestSupportsFile } from './knowledge-parse-options.service'
import { maybeSyncSharedKnowledgeDocument } from './p2p/knowledge-sync.service'
import { clearIngestCancel, assertIngestStillActive } from './knowledge-ingest-manager.service'
import {
  findActiveDocumentById,
  findActiveDocumentByPath,
  shouldSkipReadyDocument,
} from './knowledge-document-lifecycle.util'
import {
  emitIngestStage,
  ensureIngestDocument,
  recordIngestFailure,
  refreshKbStats,
  updateDocumentStage,
  type IngestFileAtPathOptions,
  type IngestFileAtPathResult,
} from './knowledge-ingest-shared'
import { syncDocumentFts } from './knowledge-fts.service'
import { parseAndEmbedFile } from './knowledge-ingest-file-pipeline'

export async function registerStorageOnlyFileAtPath(
  options: IngestFileAtPathOptions,
): Promise<IngestFileAtPathResult> {
  const { workspaceId, kbId, filePath, sourceId, documentId } = options
  const repo = getDocumentRepository()

  if (isIgnoredKnowledgeIngestFile(filePath)) {
    return { outcome: 'skipped', path: filePath }
  }

  let contentHash: string
  try {
    contentHash = hashFileBytes(filePath)
  } catch (error) {
    const message = toErrorMessage(error, '无法读取文件')
    recordIngestFailure(repo, workspaceId, kbId, filePath, message)
    return { outcome: 'failed', path: filePath, message }
  }

  const existing =
    findActiveDocumentByPath(repo, kbId, filePath) ??
    (documentId ? findActiveDocumentById(repo, kbId, documentId) : undefined)

  if (existing?.contentHash === contentHash && shouldSkipReadyDocument(repo, kbId, existing.id, contentHash, existing)) {
    return { outcome: 'skipped', path: filePath }
  }

  const title = filePath.split(/[/\\]/).pop() ?? filePath
  const docRow = existing
    ? (repo.update(existing.id, kbId, {
        title,
        contentHash,
        absolutePath: filePath,
        status: 'ready',
        errorJson: null,
      }),
      repo.findById(existing.id, kbId) ?? existing)
    : repo.create({
        id: documentId,
        kbId,
        sourceId: sourceId ?? null,
        title,
        contentHash,
        status: 'ready',
        absolutePath: filePath,
      })

  const stat = statSync(filePath)
  repo.upsertFileRegistry({
    workspaceId,
    absolutePath: filePath,
    contentHash,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    documentId: docRow.id,
  })

  repo.deleteIngestJobByDocumentId(docRow.id)

  emitIngestStage({
    workspaceId,
    kbId,
    documentId: docRow.id,
    stage: 'ready',
  })

  return { outcome: 'ingested', path: filePath }
}

export async function ingestFileAtPath(
  options: IngestFileAtPathOptions,
): Promise<IngestFileAtPathResult> {
  const { workspaceId, kbId, filePath, sourceId, documentId, skipP2pSync } = options
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (kb?.kind === 'local_files') {
    return registerStorageOnlyFileAtPath(options)
  }
  if (kb?.kind === 'shared' && !skipP2pSync) {
    return { outcome: 'skipped', path: filePath }
  }

  const repo = getDocumentRepository()

  if (kb && kb.kind === 'network') {
    const message = '网络知识库仅支持网页 URL，不能导入本地文件'
    recordIngestFailure(repo, workspaceId, kbId, filePath, message)
    return { outcome: 'failed', path: filePath, message }
  }
  const vectorsDir = join(getWorkspaceKnowledgeDir(workspaceId), 'vectors')

  if (isIgnoredKnowledgeIngestFile(filePath)) {
    return { outcome: 'skipped', path: filePath }
  }

  if (!knowledgeIngestSupportsFile(filePath)) {
    recordIngestFailure(repo, workspaceId, kbId, filePath, '不支持的文件类型')
    return { outcome: 'failed', path: filePath, message: '不支持的文件类型' }
  }

  let contentHash: string
  try {
    contentHash = hashFileBytes(filePath)
  } catch (error) {
    const message = toErrorMessage(error, '无法读取文件')
    recordIngestFailure(repo, workspaceId, kbId, filePath, message)
    return { outcome: 'failed', path: filePath, message }
  }

  const existingReady = repo.findByPath(kbId, filePath)
  if (
    existingReady &&
    shouldSkipReadyDocument(repo, kbId, existingReady.id, contentHash, existingReady)
  ) {
    return { outcome: 'skipped', path: filePath }
  }

  const docRow = ensureIngestDocument(
    repo,
    workspaceId,
    kbId,
    filePath,
    contentHash,
    sourceId,
    documentId,
  )

  try {
    assertIngestStillActive(repo, docRow.id, kbId)
    const embed = resolveEmbedConfig(workspaceId, kbId)

    await removeDocumentVectors(vectorsDir, kbId, docRow.id, embed.vectorBackend)

    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: docRow.id,
      stage: 'parsing',
    })
    assertIngestStillActive(repo, docRow.id, kbId)

    const result = await parseAndEmbedFile({
      repo,
      filePath,
      contentHash,
      workspaceId,
      kbId,
      documentId: docRow.id,
      vectorsDir,
    })

    assertIngestStillActive(repo, docRow.id, kbId)

    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: docRow.id,
      stage: 'indexing',
    })

    repo.replaceChunks(
      docRow.id,
      kbId,
      result.chunks.map((chunk) => ({
        ...chunk,
        documentId: docRow.id,
        kbId,
      })),
    )
    syncDocumentFts(
      docRow.id,
      kbId,
      result.chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })),
    )
    assertIngestStillActive(repo, docRow.id, kbId)
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: docRow.id,
      stage: 'ready',
      errorMessage: null,
      patch: {
        title: result.title,
        contentHash: result.contentHash,
        mimeType: result.mimeType,
      },
    })

    const stat = statSync(filePath)
    repo.upsertFileRegistry({
      workspaceId,
      absolutePath: filePath,
      contentHash: result.contentHash,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      documentId: docRow.id,
    })

    if (!skipP2pSync) {
      void maybeSyncSharedKnowledgeDocument(workspaceId, kbId, docRow.id)
    }

    refreshKbStats(workspaceId, kbId)
    return { outcome: 'ingested', path: filePath }
  } catch (error) {
    const message = toErrorMessage(error, '导入失败')
    if (message === '索引任务已取消') {
      const current = repo.findById(docRow.id, kbId)
      if (current?.status === 'failed') {
        return { outcome: 'failed', path: filePath, message }
      }
    }
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: docRow.id,
      stage: 'failed',
      errorMessage: message,
    })
    return { outcome: 'failed', path: filePath, message }
  } finally {
    clearIngestCancel(docRow.id)
  }
}

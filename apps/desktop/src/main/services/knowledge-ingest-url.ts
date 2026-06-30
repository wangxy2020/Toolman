import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toErrorMessage } from '@toolman/shared'
import {
  fetchUrlContent,
  hashText,
  ingestUrlContent,
  removeDocumentVectors,
  type IngestFileResult,
} from '@toolman/knowledge'
import type { KnowledgeDocument } from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveChunkConfig, resolveEmbedConfig } from './knowledge-embed.service'
import { assertKnowledgeBaseAcceptsUrls } from './knowledge-kb-kind-guard'
import { withTimeout } from '../utils/async-timeout'
import { resolveEmbedTimeoutMs } from './knowledge-ingest-timeouts'
import { findActiveDocumentByPath, shouldSkipReadyDocument } from './knowledge-document-lifecycle.util'
import {
  buildIngestProgressHandlers,
  emitIngestStage,
  refreshKbStats,
  updateDocumentStage,
} from './knowledge-ingest-shared'
import { appendDocumentFts, removeDocumentFts } from './knowledge-fts.service'

export async function ingestUrlDocument(options: {
  workspaceId: string
  kbId: string
  url: string
  sourceId?: string | null
}): Promise<{ outcome: 'ingested' | 'skipped' | 'failed'; documentId?: string; message?: string }> {
  const { workspaceId, kbId, url, sourceId } = options
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (kb) {
    try {
      assertKnowledgeBaseAcceptsUrls(kb)
    } catch (error) {
      const message = toErrorMessage(error, 'URL 导入失败')
      return { outcome: 'failed', message }
    }
  }

  const repo = getDocumentRepository()
  const vectorsDir = join(getWorkspaceKnowledgeDir(workspaceId), 'vectors')

  try {
    const fetched = await fetchUrlContent(url)
    const contentHash = hashText(fetched.plainText)
    const canonicalUrl = fetched.url

    const existing = findActiveDocumentByPath(repo, kbId, canonicalUrl)

    if (existing && shouldSkipReadyDocument(repo, kbId, existing.id, contentHash, existing)) {
      return { outcome: 'skipped', documentId: existing.id }
    }

    const embed = resolveEmbedConfig(workspaceId, kbId)
    const chunkConfig = resolveChunkConfig(kbId, workspaceId)
    const progressCtx = { workspaceId, kbId, documentId: '' as string }

    let docRow: KnowledgeDocument
    if (existing) {
      await removeDocumentVectors(vectorsDir, kbId, existing.id, embed.vectorBackend)
      progressCtx.documentId = existing.id
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: existing.id,
        stage: 'embedding',
        errorMessage: null,
        patch: { contentHash },
      })
      docRow = existing
    } else {
      docRow = repo.create({
        kbId,
        sourceId: sourceId ?? null,
        title: fetched.title,
        contentHash,
        status: 'embedding',
        absolutePath: canonicalUrl,
        mimeType: fetched.mimeType,
      })
      progressCtx.documentId = docRow.id
      emitIngestStage({
        workspaceId,
        kbId,
        documentId: docRow.id,
        stage: 'embedding',
      })
    }

    const { onEmbedProgress } = buildIngestProgressHandlers(repo, progressCtx)
    const embedTimeoutMs = resolveEmbedTimeoutMs(fetched.plainText.length)

    const snapshotPath = join(
      getWorkspaceKnowledgeDir(workspaceId),
      'snapshots',
      `${contentHash.slice(0, 16)}.html`,
    )
    writeFileSync(snapshotPath, fetched.html, 'utf8')

    removeDocumentFts(docRow.id)

    const result: IngestFileResult = await withTimeout(
      ingestUrlContent({
        url: canonicalUrl,
        title: fetched.title,
        plainText: fetched.plainText,
        mimeType: fetched.mimeType,
        contentHash,
        kbId,
        documentId: docRow.id,
        chunkConfig,
        embedOptions: embed.embedOptions,
        embedModel: embed.embedModel,
        vectorsDir,
        vectorBackend: embed.vectorBackend,
        onEmbedProgress,
        onIndexedChunkBatch: async (chunks) => {
          await appendDocumentFts(
            docRow.id,
            kbId,
            chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })),
          )
        },
      }),
      embedTimeoutMs,
      '向量化超时，请检查嵌入模型服务是否可用',
    )

    repo.replaceChunks(
      docRow.id,
      kbId,
      result.chunks.map((chunk) => ({
        ...chunk,
        documentId: docRow.id,
        kbId,
      })),
    )
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
        metadataJson: JSON.stringify({ snapshotPath }),
      },
    })

    refreshKbStats(workspaceId, kbId)
    return { outcome: 'ingested', documentId: docRow.id }
  } catch (error) {
    const message = toErrorMessage(error, 'URL 导入失败')
    const existing = findActiveDocumentByPath(repo, kbId, url.trim())
    if (existing) {
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: existing.id,
        stage: 'failed',
        errorMessage: message,
      })
    }
    return { outcome: 'failed', message }
  }
}

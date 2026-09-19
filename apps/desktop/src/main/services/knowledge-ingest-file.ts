import { fireAndForget } from '../lib/fire-and-forget'
import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { knowledgeKindAcceptsLocalFiles, toErrorMessage } from '@toolman/shared'
import {
  hashFileStream,
  isIgnoredKnowledgeIngestFile,
  removeDocumentVectors,
  toPdfParseReportMetadata,
} from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveEmbedConfig } from './knowledge-embed.service'
import { knowledgeIngestSupportsFile } from './knowledge-parse-options.service'
import { maybeSyncSharedKnowledgeDocument } from './p2p/knowledge-sync.service'
import { clearIngestCancel, assertIngestStillActive, markIngestActive, markIngestInactive } from './knowledge-ingest-manager.service'
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
import { parseAndEmbedFile } from './knowledge-ingest-file-pipeline'
import { logStructured } from './structured-log.service'
import { resolveKnowledgeIndexFingerprint } from './knowledge-index-fingerprint'
import { resolveActiveIndexVersion } from './knowledge-index-version.service'
import { recordReadyDocumentRevision } from './knowledge-document-revision.service'

/** Same path can be queued by UI ingest and folder watcher copy — coalesce to one run. */
const ingestInflightByPath = new Map<string, Promise<IngestFileAtPathResult>>()

function mergeDocumentMetadataJson(
  existing: string | null | undefined,
  patch: Record<string, unknown>,
): string {
  let base: Record<string, unknown> = {}
  try {
    const parsed = existing ? JSON.parse(existing) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>
    }
  } catch {
    base = {}
  }
  return JSON.stringify({ ...base, ...patch })
}

function ingestCoalesceKey(workspaceId: string, kbId: string, filePath: string): string {
  return `${workspaceId}\0${kbId}\0${filePath}`
}

export async function ingestFileAtPath(
  options: IngestFileAtPathOptions,
): Promise<IngestFileAtPathResult> {
  const key = ingestCoalesceKey(options.workspaceId, options.kbId, options.filePath)
  const inflight = ingestInflightByPath.get(key)
  if (inflight) {
    logStructured(
      'knowledge-ingest',
      'info',
      `coalesce duplicate ingest for ${basename(options.filePath)} (UI + folder watcher)`,
    )
    return inflight
  }

  const promise = ingestFileAtPathOnce(options)
  ingestInflightByPath.set(key, promise)
  try {
    return await promise
  } finally {
    if (ingestInflightByPath.get(key) === promise) {
      ingestInflightByPath.delete(key)
    }
  }
}

async function ingestFileAtPathOnce(
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

  if (kb && !knowledgeKindAcceptsLocalFiles(kb.kind)) {
    const message =
      kb.kind === 'network' ? '网络知识库仅支持网页 URL，不能导入本地文件' : '共享知识库不支持直接导入本地文件'
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
    contentHash = await hashFileStream(filePath)
  } catch (error) {
    const message = toErrorMessage(error, '无法读取文件')
    recordIngestFailure(repo, workspaceId, kbId, filePath, message)
    return { outcome: 'failed', path: filePath, message }
  }

  const indexFingerprint = resolveKnowledgeIndexFingerprint(workspaceId, kbId)
  const indexVersion = options.indexVersion ?? resolveActiveIndexVersion(workspaceId, kbId)
  const existingReady = repo.findByPath(kbId, filePath)
  if (
    !options.force &&
    existingReady &&
    shouldSkipReadyDocument(
      repo,
      kbId,
      existingReady.id,
      contentHash,
      existingReady,
      indexFingerprint,
    )
  ) {
    return { outcome: 'skipped', path: filePath }
  }

  if (
    existingReady?.status === 'ready' &&
    existingReady.contentHash &&
    existingReady.contentHash !== contentHash
  ) {
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: existingReady.id,
      stage: 'stale',
      errorMessage: null,
    })
  }

  const previewId = documentId ?? existingReady?.id
  if (previewId) markIngestActive(previewId)

  const docRow = ensureIngestDocument(
    repo,
    workspaceId,
    kbId,
    filePath,
    contentHash,
    sourceId,
    documentId,
  )
  if (docRow.id !== previewId) {
    if (previewId) markIngestInactive(previewId)
    markIngestActive(docRow.id)
  }

  try {
    assertIngestStillActive(repo, docRow.id, kbId)
    const embed = resolveEmbedConfig(workspaceId, kbId)

    await removeDocumentVectors(vectorsDir, kbId, docRow.id, embed.vectorBackend, indexVersion)

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
      indexVersion,
    })

    assertIngestStillActive(repo, docRow.id, kbId)

    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: docRow.id,
      stage: 'indexing',
    })

    const revisionId = recordReadyDocumentRevision({
      documentId: docRow.id,
      kbId,
      contentHash: result.contentHash,
      parsedHash: result.parsedHash ?? null,
      indexFingerprint,
      indexVersion,
    })

    repo.replaceChunks(
      docRow.id,
      kbId,
      result.chunks.map((chunk) => ({
        ...chunk,
        documentId: docRow.id,
        kbId,
        revisionId,
        indexVersion,
      })),
    )
    assertIngestStillActive(repo, docRow.id, kbId)
    const parseReport = 'parseReport' in result ? result.parseReport : undefined
    const deferredCount = parseReport?.deferredPages?.length ?? parseReport?.skippedPages?.length ?? 0
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: docRow.id,
      stage: deferredCount > 0 ? 'failed' : 'ready',
      errorMessage: parseReport?.warning ?? null,
      patch: {
        title: result.title,
        contentHash: result.contentHash,
        parsedHash: result.parsedHash ?? null,
        mimeType: result.mimeType,
        indexFingerprint,
        indexVersion,
        currentRevisionId: revisionId,
        ...(parseReport
          ? {
              metadataJson: mergeDocumentMetadataJson(docRow.metadataJson, {
                pdfParse: toPdfParseReportMetadata(parseReport),
              }),
            }
          : {}),
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
      fireAndForget('p2p', maybeSyncSharedKnowledgeDocument(workspaceId, kbId, docRow.id))
    }

    refreshKbStats(workspaceId, kbId)
    if (deferredCount > 0) {
      return {
        outcome: 'failed',
        path: filePath,
        message: parseReport?.warning ?? '部分页面尚未完成 OCR',
      }
    }
    return { outcome: 'ingested', path: filePath }
  } catch (error) {
    const message = toErrorMessage(error, '导入失败')
    logStructured(
      'knowledge-ingest',
      'error',
      `ingest failed for ${basename(filePath)}: ${message}`,
      { error },
    )
    if (message === '索引任务已取消') {
      const current = repo.findById(docRow.id, kbId)
      if (current?.status === 'cancelled' || current?.status === 'failed') {
        if (current.status !== 'cancelled') {
          updateDocumentStage(repo, {
            workspaceId,
            kbId,
            documentId: docRow.id,
            stage: 'cancelled',
            errorMessage: null,
          })
        }
        return { outcome: 'failed', path: filePath, message }
      }
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: docRow.id,
        stage: 'cancelled',
        errorMessage: null,
      })
      return { outcome: 'failed', path: filePath, message }
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
    markIngestInactive(docRow.id)
    clearIngestCancel(docRow.id)
  }
}

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
    contentHash = await hashFileStream(filePath)
  } catch (error) {
    const message = toErrorMessage(error, '无法读取文件')
    recordIngestFailure(repo, workspaceId, kbId, filePath, message)
    return { outcome: 'failed', path: filePath, message }
  }

  const existing =
    findActiveDocumentByPath(repo, kbId, filePath) ??
    (documentId ? findActiveDocumentById(repo, kbId, documentId) : undefined)

  if (
    !options.force &&
    existing?.contentHash === contentHash &&
    shouldSkipReadyDocument(repo, kbId, existing.id, contentHash, existing)
  ) {
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

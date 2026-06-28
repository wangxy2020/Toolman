import { statSync, writeFileSync } from 'node:fs'
import { logStructured } from './structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { join } from 'node:path'
import {
  fetchUrlContent,
  hashFileBytes,
  hashText,
  ingestContent,
  ingestUrlContent,
  isIgnoredKnowledgeIngestFile,
  parseFile,
  removeDocumentVectors,
  type IngestFileResult,
} from '@toolman/knowledge'
import type { DocumentRepository } from '@toolman/db'
import type { KnowledgeDocument } from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveChunkConfig, resolveEmbedConfig } from './knowledge-embed.service'
import { buildKnowledgeParseOptions, knowledgeIngestSupportsFile } from './knowledge-parse-options.service'
import { assertKnowledgeBaseAcceptsUrls } from './knowledge-kb-kind-guard'
import { broadcastKnowledgeIngestEvent } from './knowledge-ingest-broadcast'
import { removeDocumentFts, syncDocumentFts } from './knowledge-fts.service'
import { maybeSyncSharedKnowledgeDocument } from './p2p/knowledge-sync.service'
import { clearIngestCancel, isIngestCancelled, assertIngestStillActive } from './knowledge-ingest-manager.service'
import { parseFileInWorker, shouldParseInWorker } from './parse-file-worker.service'
import { withTimeout } from '../utils/async-timeout'
import {
  resolveEmbedTimeoutMs,
  resolveParseTimeoutMs,
  STALE_INGEST_MS,
} from './knowledge-ingest-timeouts'
import {
  findActiveDocumentById,
  findActiveDocumentByPath,
} from './knowledge-document-lifecycle.util'

const MAX_CONCURRENT_INGEST_JOBS = 2

const ACTIVE_INGEST_STAGES = new Set([
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
])

const IN_FLIGHT_INGEST_STAGES = new Set(['parsing', 'chunking', 'embedding', 'indexing'])

let activeIngestJobs = 0
const ingestJobWaiters: Array<() => void> = []

async function acquireIngestJobSlot(): Promise<void> {
  if (activeIngestJobs < MAX_CONCURRENT_INGEST_JOBS) {
    activeIngestJobs += 1
    return
  }
  await new Promise<void>((resolve) => {
    ingestJobWaiters.push(resolve)
  })
  activeIngestJobs += 1
}

function releaseIngestJobSlot(): void {
  activeIngestJobs = Math.max(0, activeIngestJobs - 1)
  const next = ingestJobWaiters.shift()
  if (next) next()
}

const STAGE_PROGRESS: Record<string, number> = {
  queued: 5,
  parsing: 20,
  chunking: 40,
  embedding: 65,
  indexing: 85,
  ready: 100,
  failed: 0,
}

export interface IngestFileAtPathOptions {
  workspaceId: string
  kbId: string
  filePath: string
  sourceId?: string | null
  documentId?: string
  skipP2pSync?: boolean
}

export interface IngestFileAtPathResult {
  outcome: 'ingested' | 'skipped' | 'failed'
  path: string
  message?: string
}

function buildDocumentTitle(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

function emitIngestStage(options: {
  workspaceId: string
  kbId: string
  documentId: string
  stage: KnowledgeDocument['status']
  progress?: number
  errorMessage?: string | null
}) {
  broadcastKnowledgeIngestEvent({
    type: 'document.stage',
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress,
    ...(options.errorMessage !== undefined ? { errorMessage: options.errorMessage } : {}),
  })
}

function updateDocumentStage(
  repo: DocumentRepository,
  options: {
    workspaceId: string
    kbId: string
    documentId: string
    stage: KnowledgeDocument['status']
    errorMessage?: string | null
    progress?: number
    patch?: Parameters<DocumentRepository['update']>[2]
  },
) {
  if (isIngestCancelled(options.documentId) && options.stage !== 'failed') {
    return
  }
  if (options.stage !== 'failed') {
    const current = repo.findById(options.documentId, options.kbId)
    if (current?.status === 'failed') {
      const restarting =
        options.stage === 'parsing' || options.errorMessage === null
      if (!restarting) {
        return
      }
    }
  }

  repo.update(options.documentId, options.kbId, {
    ...options.patch,
    status: options.stage,
    ...(options.errorMessage !== undefined
      ? { errorJson: options.errorMessage ? JSON.stringify({ message: options.errorMessage }) : null }
      : {}),
  })
  repo.upsertIngestJob({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress ?? STAGE_PROGRESS[options.stage] ?? 0,
    errorJson:
      options.errorMessage !== undefined
        ? options.errorMessage
          ? JSON.stringify({ message: options.errorMessage })
          : null
        : undefined,
  })
  emitIngestStage({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress ?? STAGE_PROGRESS[options.stage] ?? 0,
    errorMessage: options.errorMessage,
  })
}

function buildIngestProgressHandlers(
  repo: DocumentRepository,
  ctx: { workspaceId: string; kbId: string; documentId: string },
) {
  return {
    onOcrProgress: (currentPage: number, totalPages: number) => {
      if (totalPages <= 0) return
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'parsing',
        progress: 20 + Math.floor((currentPage / totalPages) * 19),
      })
    },
    onEmbedProgress: (completed: number, total: number) => {
      if (total <= 0) return
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'embedding',
        progress: 65 + Math.floor((completed / total) * 19),
      })
    },
  }
}

function recordIngestFailure(
  repo: DocumentRepository,
  workspaceId: string,
  kbId: string,
  filePath: string,
  message: string,
) {
  if (isIgnoredKnowledgeIngestFile(filePath)) return

  const title = buildDocumentTitle(filePath)

  const existing = findActiveDocumentByPath(repo, kbId, filePath)
  if (existing) {
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: existing.id,
      stage: 'failed',
      errorMessage: message,
      patch: { title },
    })
    return
  }

  const created = repo.create({
    kbId,
    sourceId: null,
    title,
    contentHash: null,
    status: 'failed',
    absolutePath: filePath,
  })
  updateDocumentStage(repo, {
    workspaceId,
    kbId,
    documentId: created.id,
    stage: 'failed',
    errorMessage: message,
  })
}

function ensureIngestDocument(
  repo: DocumentRepository,
  workspaceId: string,
  kbId: string,
  filePath: string,
  contentHash: string,
  sourceId?: string | null,
  documentId?: string,
) {
  const title = buildDocumentTitle(filePath)

  if (documentId) {
    const existing = findActiveDocumentById(repo, kbId, documentId)
    if (existing) {
      clearIngestCancel(existing.id)
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: existing.id,
        stage: 'parsing',
        errorMessage: null,
        patch: { title, contentHash, absolutePath: filePath },
      })
      return existing
    }

    const created = repo.create({
      id: documentId,
      kbId,
      sourceId: sourceId ?? null,
      title,
      contentHash,
      status: 'parsing',
      absolutePath: filePath,
    })
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: created.id,
      stage: 'parsing',
      errorMessage: null,
    })
    return created
  }

  const existing = findActiveDocumentByPath(repo, kbId, filePath)
  if (existing) {
    clearIngestCancel(existing.id)
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: existing.id,
      stage: 'parsing',
      errorMessage: null,
      patch: { title, contentHash },
    })
    return existing
  }

  const created = repo.create({
    kbId,
    sourceId: sourceId ?? null,
    title,
    contentHash,
    status: 'parsing',
    absolutePath: filePath,
  })
  updateDocumentStage(repo, {
    workspaceId,
    kbId,
    documentId: created.id,
    stage: 'parsing',
    errorMessage: null,
  })
  return created
}

async function registerStorageOnlyFileAtPath(
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

  if (existing?.contentHash === contentHash && existing.status === 'ready') {
    return { outcome: 'skipped', path: filePath }
  }

  const title = buildDocumentTitle(filePath)
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

export async function reconcileStuckLocalFilesDocuments(
  workspaceId: string,
  kbId: string,
): Promise<number> {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (kb?.kind !== 'local_files') return 0

  const repo = getDocumentRepository()
  let fixed = 0

  for (const row of repo.listByKb(kbId)) {
    if (!row.absolutePath) continue
    if (row.status === 'ready' || row.status === 'failed') continue

    const result = await registerStorageOnlyFileAtPath({
      workspaceId,
      kbId,
      filePath: row.absolutePath,
      documentId: row.id,
    })
    if (result.outcome === 'ingested' || result.outcome === 'skipped') {
      fixed += 1
    }
  }

  if (fixed > 0) {
    refreshKbStats(workspaceId, kbId)
  }

  return fixed
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
  if (existingReady?.contentHash === contentHash && existingReady.status === 'ready') {
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
    const chunkConfig = resolveChunkConfig(kbId, workspaceId)
    const parseOptions = buildKnowledgeParseOptions(workspaceId, kbId)
    const progressCtx = { workspaceId, kbId, documentId: docRow.id }
    const { onOcrProgress, onEmbedProgress } = buildIngestProgressHandlers(repo, progressCtx)
    const parseOptionsWithProgress = { ...parseOptions, onOcrProgress }

    await removeDocumentVectors(vectorsDir, kbId, docRow.id, embed.vectorBackend)

    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: docRow.id,
      stage: 'parsing',
    })
    assertIngestStillActive(repo, docRow.id, kbId)

    let result: IngestFileResult
    const ocrEnabled = Boolean(parseOptions.ocr?.enabled)
    const fileSizeBytes = statSync(filePath).size
    const parseTimeoutMs = resolveParseTimeoutMs(fileSizeBytes)

    if (shouldParseInWorker(filePath, ocrEnabled)) {
      const parsed = await withTimeout(
        parseFileInWorker(filePath, parseOptionsWithProgress, parseTimeoutMs),
        parseTimeoutMs,
        '文件解析超时，请检查文件是否损坏或过大',
      )
      assertIngestStillActive(repo, docRow.id, kbId)
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: docRow.id,
        stage: 'chunking',
      })
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: docRow.id,
        stage: 'embedding',
      })
      const embedTimeoutMs = resolveEmbedTimeoutMs(parsed.plainText.length)
      result = await withTimeout(
        ingestContent({
          sourceKey: filePath,
          title: parsed.title,
          plainText: parsed.plainText,
          mimeType: parsed.mimeType,
          kind: parsed.kind,
          contentHash: parsed.contentHash,
          kbId,
          documentId: docRow.id,
          chunkConfig,
          embedOptions: embed.embedOptions,
          embedModel: embed.embedModel,
          vectorsDir,
          vectorBackend: embed.vectorBackend,
          onEmbedProgress,
        }),
        embedTimeoutMs,
        '向量化超时，请检查嵌入模型服务是否可用',
      )
    } else {
      const parsed = await withTimeout(
        parseFile(filePath, parseOptionsWithProgress),
        parseTimeoutMs,
        '文件解析超时，可能是加密 PDF 或扫描件 OCR 耗时过长',
      )
      assertIngestStillActive(repo, docRow.id, kbId)
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: docRow.id,
        stage: 'chunking',
      })
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: docRow.id,
        stage: 'embedding',
      })
      const embedTimeoutMs = resolveEmbedTimeoutMs(parsed.plainText.length)
      result = await withTimeout(
        ingestContent({
          sourceKey: filePath,
          title: parsed.title,
          plainText: parsed.plainText,
          mimeType: parsed.mimeType,
          kind: parsed.kind,
          contentHash,
          kbId,
          documentId: docRow.id,
          chunkConfig,
          embedOptions: embed.embedOptions,
          embedModel: embed.embedModel,
          vectorsDir,
          vectorBackend: embed.vectorBackend,
          onEmbedProgress,
        }),
        embedTimeoutMs,
        '向量化超时，请检查嵌入模型服务是否可用',
      )
    }

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

    if (existing?.contentHash === contentHash && existing.status === 'ready') {
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
    syncDocumentFts(
      docRow.id,
      kbId,
      result.chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })),
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

export function prepareIngestQueue(options: {
  workspaceId: string
  kbId: string
  filePaths: string[]
}) {
  const repo = getDocumentRepository()
  const kb = getKnowledgeBaseRepository().findRowById(options.kbId, options.workspaceId)
  const storageOnly = kb?.kind === 'local_files'
  const pending: string[] = []
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []

  if (kb?.kind === 'network') {
    const message = '网络知识库仅支持网页 URL，不能导入本地文件'
    for (const filePath of options.filePaths) {
      if (isIgnoredKnowledgeIngestFile(filePath)) {
        skipped += 1
        continue
      }
      recordIngestFailure(repo, options.workspaceId, options.kbId, filePath, message)
      failed.push({ path: filePath, message })
    }
    if (failed.length > 0) {
      refreshKbStats(options.workspaceId, options.kbId)
    }
    return { filePaths: pending, skipped, failed }
  }

  for (const filePath of options.filePaths) {
    if (isIgnoredKnowledgeIngestFile(filePath)) {
      skipped += 1
      continue
    }

    if (!storageOnly && !knowledgeIngestSupportsFile(filePath)) {
      recordIngestFailure(repo, options.workspaceId, options.kbId, filePath, '不支持的文件类型')
      failed.push({ path: filePath, message: '不支持的文件类型' })
      continue
    }

    try {
      const contentHash = hashFileBytes(filePath)
      const existing = findActiveDocumentByPath(repo, options.kbId, filePath)

      if (existing?.contentHash === contentHash && existing.status === 'ready') {
        skipped += 1
        continue
      }

      const title = buildDocumentTitle(filePath)
      if (existing) {
        updateDocumentStage(repo, {
          workspaceId: options.workspaceId,
          kbId: options.kbId,
          documentId: existing.id,
          stage: 'queued',
          errorMessage: null,
          patch: { title },
        })
      } else {
        const created = repo.create({
          kbId: options.kbId,
          sourceId: null,
          title,
          contentHash: null,
          status: 'queued',
          absolutePath: filePath,
        })
        updateDocumentStage(repo, {
          workspaceId: options.workspaceId,
          kbId: options.kbId,
          documentId: created.id,
          stage: 'queued',
          errorMessage: null,
        })
      }

      pending.push(filePath)
    } catch (error) {
      const message = toErrorMessage(error, '无法读取文件')
      recordIngestFailure(repo, options.workspaceId, options.kbId, filePath, message)
      failed.push({ path: filePath, message })
    }
  }

  if (pending.length > 0) {
    refreshKbStats(options.workspaceId, options.kbId, { status: 'indexing' })
  } else if (failed.length > 0) {
    refreshKbStats(options.workspaceId, options.kbId)
  }

  return { filePaths: pending, skipped, failed }
}

export function startIngestFilePathsInBackground(options: {
  workspaceId: string
  kbId: string
  filePaths: string[]
}) {
  if (options.filePaths.length === 0) return

  void ingestFilePaths({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    filePaths: options.filePaths,
  }).catch((error) => {
    logStructured('knowledge', 'error', `background ingest failed`, { detail: error })
    refreshKbStats(options.workspaceId, options.kbId, { status: 'error' })
  })
}

export async function ingestFilePaths(options: {
  workspaceId: string
  kbId: string
  filePaths: string[]
  sourceId?: string | null
}) {
  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'indexing',
  })

  let ingested = 0
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []
  const repo = getDocumentRepository()

  const ingestOne = async (filePath: string) => {
    const existing = repo.findByPath(options.kbId, filePath)
    if (existing && isIngestCancelled(existing.id)) {
      return { outcome: 'skipped' as const, path: filePath }
    }

    await acquireIngestJobSlot()
    try {
      return await ingestFileAtPath({
        workspaceId: options.workspaceId,
        kbId: options.kbId,
        filePath,
        sourceId: options.sourceId,
        documentId: existing?.id,
      })
    } finally {
      releaseIngestJobSlot()
    }
  }

  const results = await Promise.all(options.filePaths.map((filePath) => ingestOne(filePath)))
  for (const result of results) {
    if (result.outcome === 'ingested') ingested++
    else if (result.outcome === 'skipped') skipped++
    else failed.push({ path: result.path, message: result.message ?? '导入失败' })
  }

  refreshKbStats(options.workspaceId, options.kbId, {
    status: failed.length > 0 && ingested === 0 ? 'error' : 'idle',
  })

  return { ingested, skipped, failed }
}

export function recoverInterruptedIngestJobsOnStartup(): number {
  const repo = getDocumentRepository()
  const pending = repo.listResumableDocuments()
  let recovered = 0
  const message =
    '应用已退出，索引任务中断。请在设置 → 索引任务中点击重试，或点击文件旁的重新向量化。'

  for (const { job, document } of pending) {
    if (!IN_FLIGHT_INGEST_STAGES.has(job.stage)) continue

    updateDocumentStage(repo, {
      workspaceId: job.workspaceId,
      kbId: job.kbId,
      documentId: document.id,
      stage: 'failed',
      errorMessage: message,
    })
    recovered += 1
  }

  if (recovered > 0) {
    logStructured('knowledge', 'info', `recovered ${recovered} interrupted ingest jobs on startup`)
  }

  return recovered
}

export function reconcileProcessingDocumentsWithoutIngestJob(): number {
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()
  let fixed = 0
  const message = '索引任务状态异常，请重新向量化'

  for (const kb of kbRepo.listAllActive()) {
    for (const doc of docRepo.listByKb(kb.id)) {
      if (!doc.status || !ACTIVE_INGEST_STAGES.has(doc.status)) continue
      if (docRepo.findIngestJobByDocumentId(doc.id)) continue

      updateDocumentStage(docRepo, {
        workspaceId: kb.workspaceId,
        kbId: kb.id,
        documentId: doc.id,
        stage: 'failed',
        errorMessage: message,
      })
      fixed += 1
    }
  }

  if (fixed > 0) {
    logStructured('knowledge', 'warn', `reconciled ${fixed} processing documents without ingest jobs`)
  }

  return fixed
}

export function recoverStaleIngestJobs(): number {
  const repo = getDocumentRepository()
  const pending = repo.listResumableDocuments()
  let recovered = 0

  for (const { job, document } of pending) {
    const startedAt = job.startedAt?.getTime() ?? job.createdAt.getTime()
    if (Date.now() - startedAt < STALE_INGEST_MS) continue
    if (!document.absolutePath) continue

    recordIngestFailure(
      repo,
      job.workspaceId,
      job.kbId,
      document.absolutePath,
      '索引任务超时或中断，请重新导入或点击重建索引',
    )
    recovered += 1
  }

  if (recovered > 0) {
    logStructured('knowledge', 'warn', `marked ${recovered} stale ingest jobs as failed`)
  }

  return recovered
}

export function purgeIgnoredKnowledgeDocuments(workspaceId: string, kbId: string): number {
  const repo = getDocumentRepository()
  let removed = 0

  for (const row of repo.listByKb(kbId)) {
    const path = row.absolutePath ?? row.title
    if (!isIgnoredKnowledgeIngestFile(path)) continue
    repo.softDelete(row.id, kbId)
    removed += 1
  }

  if (removed > 0) {
    refreshKbStats(workspaceId, kbId)
  }

  return removed
}

export function refreshKbStats(
  workspaceId: string,
  kbId: string,
  patch?: { status?: 'idle' | 'indexing' | 'reindexing' | 'error' },
) {
  const repo = getDocumentRepository()
  getKnowledgeBaseRepository().update({
    id: kbId,
    workspaceId,
    documentCount: repo.countByKb(kbId),
    chunkCount: repo.countChunksByKb(kbId),
    status: patch?.status,
  })
}

export async function handleRemovedFile(options: {
  workspaceId: string
  kbId: string
  filePath: string
}) {
  const repo = getDocumentRepository()
  const doc = repo.findByPath(options.kbId, options.filePath)
  if (!doc) return

  const embed = resolveEmbedConfig(options.workspaceId, options.kbId)
  await removeDocumentVectors(
    join(getWorkspaceKnowledgeDir(options.workspaceId), 'vectors'),
    options.kbId,
    doc.id,
    embed.vectorBackend,
  )
  removeDocumentFts(doc.id)
  repo.softDelete(doc.id, options.kbId)
  refreshKbStats(options.workspaceId, options.kbId)
}

export async function reindexDocument(options: {
  workspaceId: string
  kbId: string
  documentId: string
}) {
  const repo = getDocumentRepository()
  const doc = repo.findById(options.documentId, options.kbId)
  if (!doc?.absolutePath) {
    throw new Error('文档不存在或缺少来源路径')
  }

  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'reindexing',
  })

  const path = doc.absolutePath
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const result = await ingestUrlDocument({
      workspaceId: options.workspaceId,
      kbId: options.kbId,
      url: path,
      sourceId: doc.sourceId,
    })
    refreshKbStats(options.workspaceId, options.kbId, {
      status: result.outcome === 'failed' ? 'error' : 'idle',
    })
    return {
      outcome: result.outcome,
      path,
      message: result.message,
    }
  }

  const result = await ingestFileAtPath({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    filePath: path,
    sourceId: doc.sourceId,
    documentId: options.documentId,
  })

  refreshKbStats(options.workspaceId, options.kbId, {
    status: result.outcome === 'failed' ? 'error' : 'idle',
  })

  return result
}

export async function reindexKnowledgeBase(options: {
  workspaceId: string
  kbId: string
}) {
  const repo = getDocumentRepository()
  const docs = repo.listByKb(options.kbId)

  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'reindexing',
  })

  let ingested = 0
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []

  for (const doc of docs) {
    if (!doc.absolutePath) continue
    try {
      const result = await reindexDocument({
        workspaceId: options.workspaceId,
        kbId: options.kbId,
        documentId: doc.id,
      })
      if (result.outcome === 'ingested') ingested++
      else if (result.outcome === 'skipped') skipped++
      else failed.push({ path: doc.absolutePath, message: result.message ?? '重建失败' })
    } catch (error) {
      failed.push({
        path: doc.absolutePath,
        message: toErrorMessage(error, '重建失败'),
      })
    }
  }

  refreshKbStats(options.workspaceId, options.kbId, {
    status: failed.length > 0 && ingested === 0 ? 'error' : 'idle',
  })

  return { ingested, skipped, failed, total: docs.length }
}

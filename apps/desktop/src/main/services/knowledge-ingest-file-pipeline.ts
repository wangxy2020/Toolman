import { statSync } from 'node:fs'
import {
  ingestContent,
  parseFile,
  type IngestFileResult,
} from '@toolman/knowledge'
import type { DocumentRepository } from '@toolman/db'
import { resolveChunkConfig, resolveEmbedConfig } from './knowledge-embed.service'
import { buildKnowledgeParseOptions } from './knowledge-parse-options.service'
import { assertIngestStillActive } from './knowledge-ingest-manager.service'
import { parseFileInWorker, shouldParseInWorker } from './parse-file-worker.service'
import { withTimeout } from '../utils/async-timeout'
import { resolveEmbedTimeoutMs, resolveParseTimeoutMs } from './knowledge-ingest-timeouts'
import { buildIngestProgressHandlers, updateDocumentStage } from './knowledge-ingest-shared'
import { appendDocumentFts, removeDocumentFts } from './knowledge-fts.service'

async function runIngestContent(options: {
  repo: DocumentRepository
  filePath: string
  contentHash: string
  workspaceId: string
  kbId: string
  documentId: string
  vectorsDir: string
  parsed: {
    title: string
    plainText: string
    mimeType: string
    kind: string
    contentHash?: string
  }
}): Promise<IngestFileResult> {
  const { repo, filePath, workspaceId, kbId, documentId, vectorsDir, parsed } = options
  const contentHash = parsed.contentHash ?? options.contentHash
  const embed = resolveEmbedConfig(workspaceId, kbId)
  const chunkConfig = resolveChunkConfig(kbId, workspaceId)
  const progressCtx = { workspaceId, kbId, documentId }
  const { onEmbedProgress } = buildIngestProgressHandlers(repo, progressCtx)
  const embedTimeoutMs = resolveEmbedTimeoutMs(parsed.plainText.length)

  removeDocumentFts(documentId)

  return withTimeout(
    ingestContent({
      sourceKey: filePath,
      title: parsed.title,
      plainText: parsed.plainText,
      mimeType: parsed.mimeType,
      kind: parsed.kind,
      contentHash,
      kbId,
      documentId,
      chunkConfig,
      embedOptions: embed.embedOptions,
      embedModel: embed.embedModel,
      vectorsDir,
      vectorBackend: embed.vectorBackend,
      onEmbedProgress,
      onIndexedChunkBatch: async (chunks) => {
        assertIngestStillActive(repo, documentId, kbId)
        await appendDocumentFts(
          documentId,
          kbId,
          chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })),
        )
      },
    }),
    embedTimeoutMs,
    '向量化超时，请检查嵌入模型服务是否可用',
  )
}

export async function parseAndEmbedFile(options: {
  repo: DocumentRepository
  filePath: string
  contentHash: string
  workspaceId: string
  kbId: string
  documentId: string
  vectorsDir: string
}): Promise<IngestFileResult> {
  const { repo, filePath, contentHash, workspaceId, kbId, documentId, vectorsDir } = options
  const parseOptions = buildKnowledgeParseOptions(workspaceId, kbId)
  const progressCtx = { workspaceId, kbId, documentId }
  const { onOcrProgress } = buildIngestProgressHandlers(repo, progressCtx)
  const parseOptionsWithProgress = { ...parseOptions, onOcrProgress }
  const ocrEnabled = Boolean(parseOptions.ocr?.enabled)
  const fileSizeBytes = statSync(filePath).size
  const parseTimeoutMs = resolveParseTimeoutMs(fileSizeBytes)

  if (shouldParseInWorker(filePath, ocrEnabled)) {
    const parsed = await withTimeout(
      parseFileInWorker(filePath, parseOptionsWithProgress, parseTimeoutMs),
      parseTimeoutMs,
      '文件解析超时，请检查文件是否损坏或过大',
    )
    assertIngestStillActive(repo, documentId, kbId)
    updateDocumentStage(repo, { ...progressCtx, stage: 'chunking' })
    updateDocumentStage(repo, { ...progressCtx, stage: 'embedding' })
    return runIngestContent({
      repo,
      filePath,
      contentHash,
      workspaceId,
      kbId,
      documentId,
      vectorsDir,
      parsed,
    })
  }

  const parsed = await withTimeout(
    parseFile(filePath, parseOptionsWithProgress),
    parseTimeoutMs,
    '文件解析超时，可能是加密 PDF 或扫描件 OCR 耗时过长',
  )
  assertIngestStillActive(repo, documentId, kbId)
  updateDocumentStage(repo, { ...progressCtx, stage: 'chunking' })
  updateDocumentStage(repo, { ...progressCtx, stage: 'embedding' })
  return runIngestContent({
    repo,
    filePath,
    contentHash,
    workspaceId,
    kbId,
    documentId,
    vectorsDir,
    parsed,
  })
}

import { statSync } from 'node:fs'
import {
  ingestContent,
  type IngestFileResult,
} from '@toolman/knowledge'
import type { DocumentRepository } from '@toolman/db'
import { resolveChunkConfig, resolveEmbedConfig } from './knowledge-embed.service'
import { buildKnowledgeParseOptions } from './knowledge-parse-options.service'
import { parseIngestDocumentFile, tryParseIngestWithOdl, isPdfFilePath } from './document-parser.service'
import { assertIngestStillActive } from './knowledge-ingest-manager.service'
import { parseFileInWorker, shouldParseInWorker } from './parse-file-worker.service'
import { withTimeout } from '../utils/async-timeout'
import { resolveEmbedTimeoutMs, resolveParseTimeoutMs } from './knowledge-ingest-timeouts'
import { buildIngestProgressHandlers, createParsingProgressPulse, updateDocumentStage } from './knowledge-ingest-shared'
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

  let parsed: {
    title: string
    plainText: string
    mimeType: string
    kind: string
  }

  const stopParsingPulse = createParsingProgressPulse(repo, progressCtx)
  try {
    const odlParsed = isPdfFilePath(filePath)
      ? await withTimeout(
          tryParseIngestWithOdl({
            filePath,
            workspaceId,
            kbId,
            parseTimeoutMs,
          }),
          parseTimeoutMs,
          '文件解析超时，请检查文件是否损坏或过大',
        )
      : null

    if (odlParsed) {
      parsed = odlParsed
    } else if (shouldParseInWorker(filePath, ocrEnabled)) {
      console.info(
        `[knowledge-ingest] vision OCR via worker for ${filePath.split(/[/\\]/).pop() ?? filePath}`,
      )
      const workerResult = await withTimeout(
        parseFileInWorker(filePath, parseOptionsWithProgress, parseTimeoutMs),
        parseTimeoutMs,
        '文件解析超时，请检查文件是否损坏或过大',
      )
      parsed = {
        title: workerResult.title,
        plainText: workerResult.plainText,
        mimeType: workerResult.mimeType,
        kind: workerResult.kind,
      }
    } else {
      const result = await withTimeout(
        parseIngestDocumentFile({
          filePath,
          workspaceId,
          kbId,
          parseOptions: parseOptionsWithProgress,
          parseTimeoutMs,
        }),
        parseTimeoutMs,
        '文件解析超时，可能是加密 PDF 或扫描件 OCR 耗时过长',
      )
      parsed = result
    }
  } finally {
    stopParsingPulse()
  }

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

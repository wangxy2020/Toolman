import { existsSync, unlinkSync } from 'node:fs'
import { parseFile } from '../parsers/parse-file.js'
import { isSupportedKnowledgeFile } from '../parsers/file-type.js'
import { hashFileBytes } from '../utils/file-hash.js'
import { openKbVectorStore } from '../vector/create-vector-store.js'
import type { VectorBackend } from '../vector/types.js'
import { getKbVectorStorePath } from '../vector/file-vector-store.js'
import type { ChunkConfig } from '../chunking/text-chunker.js'
import type { EmbedOptions, EmbedProgressCallback } from '../embedding/ollama-embedder.js'
import type { ParseFileOptions } from '../parsers/parse-file.js'
import { ingestContent } from './content-ingest.js'

export interface IngestFileInput {
  filePath: string
  kbId: string
  documentId: string
  chunkConfig: ChunkConfig
  embedOptions: EmbedOptions
  embedModel: string
  vectorsDir: string
  parseOptions?: ParseFileOptions
  vectorBackend?: VectorBackend
}

export interface IngestFileResult {
  title: string
  contentHash: string
  mimeType: string
  chunks: Array<{
    id: string
    chunkIndex: number
    text: string
    tokenCount: number
    metadataJson: string
  }>
  chunkCount: number
}

export async function ingestFile(input: IngestFileInput): Promise<IngestFileResult> {
  if (!isSupportedKnowledgeFile(input.filePath)) {
    throw new Error(`暂不支持该文件类型: ${input.filePath}`)
  }

  const contentHash = hashFileBytes(input.filePath)
  const parsed = await parseFile(input.filePath, input.parseOptions)

  return ingestContent({
    sourceKey: input.filePath,
    title: parsed.title,
    plainText: parsed.plainText,
    mimeType: parsed.mimeType,
    kind: parsed.kind,
    contentHash,
    kbId: input.kbId,
    documentId: input.documentId,
    chunkConfig: input.chunkConfig,
    embedOptions: input.embedOptions,
    embedModel: input.embedModel,
    vectorsDir: input.vectorsDir,
    vectorBackend: input.vectorBackend,
  })
}

export async function removeDocumentVectors(
  vectorsDir: string,
  kbId: string,
  documentId: string,
  vectorBackend?: VectorBackend,
): Promise<void> {
  const store = await openKbVectorStore({ vectorsDir, kbId, backend: vectorBackend })
  await store.deleteByDocumentId(documentId)
}

export async function removeKbVectors(
  vectorsDir: string,
  kbId: string,
  vectorBackend?: VectorBackend,
): Promise<void> {
  const store = await openKbVectorStore({ vectorsDir, kbId, backend: vectorBackend })
  await store.deleteByKbId()
  const jsonPath = getKbVectorStorePath(vectorsDir, kbId)
  if (existsSync(jsonPath)) {
    unlinkSync(jsonPath)
  }
}

export { ingestContent, type IngestContentInput, type IngestContentResult } from './content-ingest.js'

export async function ingestUrlContent(input: {
  url: string
  title: string
  plainText: string
  mimeType: string
  contentHash: string
  kbId: string
  documentId: string
  chunkConfig: ChunkConfig
  embedOptions: EmbedOptions
  embedModel: string
  vectorsDir: string
  vectorBackend?: VectorBackend
  onEmbedProgress?: EmbedProgressCallback
}): Promise<IngestFileResult> {
  return ingestContent({
    sourceKey: input.url,
    title: input.title,
    plainText: input.plainText,
    mimeType: input.mimeType,
    kind: 'url',
    contentHash: input.contentHash,
    kbId: input.kbId,
    documentId: input.documentId,
    chunkConfig: input.chunkConfig,
    embedOptions: input.embedOptions,
    embedModel: input.embedModel,
    vectorsDir: input.vectorsDir,
    vectorBackend: input.vectorBackend,
    onEmbedProgress: input.onEmbedProgress,
  })
}

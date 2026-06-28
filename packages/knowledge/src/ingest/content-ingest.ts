import { chunkText, chunkTextAsync, approxTokenCount, type ChunkConfig, type TextChunk } from '../chunking/text-chunker.js'
import {
  EMBED_CHUNK_TOKEN_HARD_CAP,
  isEmbedContextLengthError,
  resolveEmbedTokenBudget,
  splitTextForEmbedding,
} from '../chunking/embed-limits.js'
import {
  embedTexts,
  type EmbedOptions,
  type EmbedProgressCallback,
} from '../embedding/ollama-embedder.js'
import { openKbVectorStore } from '../vector/create-vector-store.js'
import type { VectorBackend } from '../vector/types.js'
import type { VectorRecord } from '../vector/cosine.js'

export interface IngestContentInput {
  sourceKey: string
  title: string
  plainText: string
  mimeType: string
  kind: string
  contentHash: string
  kbId: string
  documentId: string
  chunkConfig: ChunkConfig
  embedOptions: EmbedOptions
  embedModel: string
  vectorsDir: string
  vectorBackend?: VectorBackend
  onEmbedProgress?: EmbedProgressCallback
}

export interface IngestContentResult {
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

const LARGE_TEXT_CHAR_THRESHOLD = 2_000_000

function resolveChunkConfigForText(plainText: string, chunkConfig: ChunkConfig): ChunkConfig {
  let strategy = chunkConfig.strategy
  if (plainText.length >= LARGE_TEXT_CHAR_THRESHOLD && strategy === 'semantic') {
    strategy = 'fixed'
  }

  return {
    ...chunkConfig,
    strategy,
    chunkSize: Math.min(chunkConfig.chunkSize, EMBED_CHUNK_TOKEN_HARD_CAP),
    chunkOverlap: Math.min(chunkConfig.chunkOverlap, 128),
  }
}

function normalizeChunksForEmbedding(
  chunks: TextChunk[],
  chunkConfig: ChunkConfig,
  embedModel: string,
): TextChunk[] {
  const embedTokenBudget = resolveEmbedTokenBudget(chunkConfig.chunkSize)
  const overlapBudget = Math.min(chunkConfig.chunkOverlap, 64)
  const normalized: TextChunk[] = []
  let index = 0

  for (const chunk of chunks) {
    const parts = splitTextForEmbedding(
      chunk.text,
      embedTokenBudget,
      overlapBudget,
      embedModel,
    )
    for (const part of parts) {
      normalized.push({
        index: index++,
        text: part,
        tokenCount: approxTokenCount(part),
        metadata: {
          ...(chunk.metadata ?? {}),
          ...(parts.length > 1 ? { splitFromOversized: true } : {}),
        },
      })
    }
  }

  return normalized
}

async function embedChunksWithRetry(
  embedOptions: IngestContentInput['embedOptions'],
  embedModel: string,
  rawChunks: TextChunk[],
  chunkConfig: ChunkConfig,
  onEmbedProgress?: IngestContentInput['onEmbedProgress'],
): Promise<{ chunks: TextChunk[]; vectors: number[][] }> {
  let embedTokenBudget = resolveEmbedTokenBudget(chunkConfig.chunkSize)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const chunks = normalizeChunksForEmbedding(
      rawChunks,
      {
        ...chunkConfig,
        chunkSize: embedTokenBudget,
        chunkOverlap: Math.min(
          chunkConfig.chunkOverlap,
          Math.max(16, Math.floor(embedTokenBudget / 8)),
        ),
      },
      embedModel,
    )

    try {
      const vectors = await embedTexts(
        embedOptions,
        chunks.map((chunk) => chunk.text),
        onEmbedProgress,
      )
      return { chunks, vectors }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!isEmbedContextLengthError(message) || embedTokenBudget <= 128) {
        throw error
      }
      embedTokenBudget = Math.max(128, Math.floor(embedTokenBudget / 2))
    }
  }

  throw new Error(
    'Embedding API 400: 文本分段过长，超过嵌入模型上下文限制。请减小知识库「分段大小」后重建索引。',
  )
}

export async function ingestContent(input: IngestContentInput): Promise<IngestContentResult> {
  const plainText = input.plainText.trim()
  if (!plainText) {
    throw new Error('内容为空，无法索引')
  }

  const chunkConfig = resolveChunkConfigForText(plainText, input.chunkConfig)

  const rawChunks =
    chunkConfig.strategy === 'semantic'
      ? await chunkTextAsync(plainText, chunkConfig, (texts) => {
          const budget = resolveEmbedTokenBudget(chunkConfig.chunkSize)
          const safeTexts = texts.map(
            (text) => splitTextForEmbedding(text, budget, 0, input.embedModel)[0] ?? text,
          )
          return embedTexts(input.embedOptions, safeTexts)
        })
      : chunkText(plainText, chunkConfig)
  if (rawChunks.length === 0) {
    throw new Error('内容为空，无法索引')
  }

  const { chunks, vectors } = await embedChunksWithRetry(
    input.embedOptions,
    input.embedModel,
    rawChunks,
    chunkConfig,
    input.onEmbedProgress,
  )

  const chunkRows = chunks.map((chunk) => ({
    id: `${input.documentId}:${chunk.index}`,
    chunkIndex: chunk.index,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
    metadataJson: JSON.stringify({
      sourceKey: input.sourceKey,
      kind: input.kind,
      ...(chunk.metadata ?? {}),
    }),
  }))

  const vectorRecords: VectorRecord[] = chunkRows.map((row, index) => ({
    chunkId: row.id,
    documentId: input.documentId,
    kbId: input.kbId,
    vector: vectors[index]!,
    metadata: {
      filePath: input.sourceKey,
      title: input.title,
    },
  }))

  const store = await openKbVectorStore({
    vectorsDir: input.vectorsDir,
    kbId: input.kbId,
    backend: input.vectorBackend,
  })
  await store.upsert(vectorRecords, {
    dimension: vectors[0]?.length ?? 0,
    model: input.embedModel,
  })

  return {
    title: input.title,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    chunks: chunkRows,
    chunkCount: chunkRows.length,
  }
}

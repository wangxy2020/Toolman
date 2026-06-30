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

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

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
  onIndexedChunkBatch?: (
    chunks: IngestContentResult['chunks'],
  ) => void | Promise<void>
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
const EMBED_UPSERT_BATCH_SIZE = 32

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

async function normalizeChunksWithRetry(
  embedOptions: IngestContentInput['embedOptions'],
  embedModel: string,
  rawChunks: TextChunk[],
  chunkConfig: ChunkConfig,
): Promise<TextChunk[]> {
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
      await embedTexts(embedOptions, chunks.slice(0, 1).map((chunk) => chunk.text))
      return chunks
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

function toChunkRows(
  input: IngestContentInput,
  chunks: TextChunk[],
): IngestContentResult['chunks'] {
  return chunks.map((chunk) => ({
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
}

function toVectorRecords(
  input: IngestContentInput,
  chunkRows: IngestContentResult['chunks'],
  vectors: number[][],
): VectorRecord[] {
  return chunkRows.map((row, index) => ({
    chunkId: row.id,
    documentId: input.documentId,
    kbId: input.kbId,
    vector: vectors[index]!,
    metadata: {
      filePath: input.sourceKey,
      title: input.title,
    },
  }))
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

  const normalizedChunks = await normalizeChunksWithRetry(
    input.embedOptions,
    input.embedModel,
    rawChunks,
    chunkConfig,
  )

  const store = await openKbVectorStore({
    vectorsDir: input.vectorsDir,
    kbId: input.kbId,
    backend: input.vectorBackend,
  })

  const allChunkRows: IngestContentResult['chunks'] = []
  let completed = 0

  for (let offset = 0; offset < normalizedChunks.length; offset += EMBED_UPSERT_BATCH_SIZE) {
    const batchChunks = normalizedChunks.slice(offset, offset + EMBED_UPSERT_BATCH_SIZE)
    const vectors = await embedTexts(
      input.embedOptions,
      batchChunks.map((chunk) => chunk.text),
    )
    const chunkRows = toChunkRows(input, batchChunks)
    const vectorRecords = toVectorRecords(input, chunkRows, vectors)

    await store.upsert(vectorRecords, {
      dimension: vectors[0]?.length ?? 0,
      model: input.embedModel,
    })

    if (input.onIndexedChunkBatch) {
      await input.onIndexedChunkBatch(chunkRows)
    }

    allChunkRows.push(...chunkRows)
    completed += batchChunks.length
    input.onEmbedProgress?.(completed, normalizedChunks.length)
    await yieldToEventLoop()
  }

  return {
    title: input.title,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    chunks: allChunkRows,
    chunkCount: allChunkRows.length,
  }
}

import { chunkText, chunkTextAsync, type ChunkConfig } from '../chunking/text-chunker.js'
import { embedTexts, type EmbedOptions } from '../embedding/ollama-embedder.js'
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

export async function ingestContent(input: IngestContentInput): Promise<IngestContentResult> {
  const plainText = input.plainText.trim()
  if (!plainText) {
    throw new Error('内容为空，无法索引')
  }

  const chunks =
    input.chunkConfig.strategy === 'semantic'
      ? await chunkTextAsync(input.plainText, input.chunkConfig, (texts) =>
          embedTexts(input.embedOptions, texts),
        )
      : chunkText(plainText, input.chunkConfig)
  if (chunks.length === 0) {
    throw new Error('内容为空，无法索引')
  }

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

  const vectors = await embedTexts(input.embedOptions, chunks.map((chunk) => chunk.text))
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

import {
  buildKnowledgeIndexFingerprint,
  KnowledgeChunkConfigSchema,
  KnowledgeEmbedConfigSchema,
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_EMBED_CONFIG,
} from '@toolman/shared'
import { getKnowledgeBaseRepository } from '../db/repos'
import { resolveChunkConfig, resolveEmbedConfig } from './knowledge-embed.service'

function parseJson<T>(value: string, schema: { parse: (input: unknown) => T }, fallback: T): T {
  try {
    return schema.parse(JSON.parse(value))
  } catch {
    return fallback
  }
}

export function buildIndexFingerprintFromKbJson(
  chunkConfigJson: string,
  embedConfigJson: string,
): string {
  const chunk = parseJson(chunkConfigJson, KnowledgeChunkConfigSchema, DEFAULT_KNOWLEDGE_CHUNK_CONFIG)
  const embed = parseJson(embedConfigJson, KnowledgeEmbedConfigSchema, DEFAULT_KNOWLEDGE_EMBED_CONFIG)
  return buildKnowledgeIndexFingerprint({
    chunkStrategy: chunk.strategy,
    chunkSize: chunk.chunkSize,
    chunkOverlap: chunk.chunkOverlap,
    embeddingModel: embed.embedModelId,
    embeddingDimension: embed.embedDimension,
    vectorBackend: embed.vectorBackend,
    reranker: embed.rerankModelId,
  })
}

export function resolveKnowledgeIndexFingerprint(workspaceId: string, kbId: string): string {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (!kb) {
    const embed = resolveEmbedConfig(workspaceId, kbId)
    const chunk = resolveChunkConfig(kbId, workspaceId)
    return buildKnowledgeIndexFingerprint({
      chunkStrategy: chunk.strategy,
      chunkSize: chunk.chunkSize,
      chunkOverlap: chunk.chunkOverlap,
      embeddingModel: embed.embedModel,
      embeddingDimension: embed.embedDimension,
      vectorBackend: embed.vectorBackend,
    })
  }
  return buildIndexFingerprintFromKbJson(kb.chunkConfigJson, kb.embedConfigJson)
}

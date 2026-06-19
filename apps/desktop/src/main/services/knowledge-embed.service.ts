import {
  KnowledgeChunkConfigSchema,
  KnowledgeEmbedConfigSchema,
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_EMBED_CONFIG,
} from '@toolman/shared'
import { providers } from '@toolman/db'
import { and, eq, isNull } from 'drizzle-orm'
import type { EmbedOptions, RerankOptions } from '@toolman/knowledge'
import { getDatabase } from '../bootstrap/database'
import { getKnowledgeBaseRepository } from '../db/repos'
import { getProviderConfig } from './provider.service'

export interface ResolvedEmbedConfig {
  embedOptions: EmbedOptions
  embedModel: string
  embedDimension: number
  vectorBackend: 'file' | 'lance'
}

const LEGACY_EMBED_MODEL_IDS = new Set(['nomic-embed-text'])

function parseJson<T>(value: string, schema: { parse: (input: unknown) => T }, fallback: T): T {
  try {
    return schema.parse(JSON.parse(value))
  } catch {
    return fallback
  }
}

export function normalizeEmbedModelId(modelId: string): string {
  if (LEGACY_EMBED_MODEL_IDS.has(modelId)) {
    return DEFAULT_KNOWLEDGE_EMBED_CONFIG.embedModelId
  }
  return modelId
}

export function normalizeEmbedDimension(modelId: string, dimension: number): number {
  if (modelId === 'bge-m3:latest' && dimension === 768) {
    return DEFAULT_KNOWLEDGE_EMBED_CONFIG.embedDimension
  }
  return dimension
}

export interface ResolvedRerankConfig {
  rerankOptions: RerankOptions
  rerankModel: string
}

export function resolveWorkspaceProvider(
  workspaceId: string,
  preferredProviderId?: string | null,
) {
  const db = getDatabase()

  if (preferredProviderId) {
    const preferred = db.select().from(providers).where(eq(providers.id, preferredProviderId)).get()
    if (
      preferred &&
      !preferred.deletedAt &&
      preferred.workspaceId === workspaceId &&
      preferred.isEnabled
    ) {
      return preferred
    }
  }

  return (
    db
      .select()
      .from(providers)
      .where(
        and(
          eq(providers.workspaceId, workspaceId),
          eq(providers.type, 'ollama'),
          eq(providers.isEnabled, true),
          isNull(providers.deletedAt),
        ),
      )
      .all()[0] ?? null
  )
}

function buildResolvedEmbedConfig(
  embedConfig: ReturnType<typeof KnowledgeEmbedConfigSchema.parse>,
  providerRow: NonNullable<ReturnType<typeof resolveWorkspaceProvider>>,
): ResolvedEmbedConfig {
  const embedModelId = normalizeEmbedModelId(embedConfig.embedModelId)
  const embedDimension = normalizeEmbedDimension(embedModelId, embedConfig.embedDimension)
  const providerConfig = getProviderConfig(providerRow.id)
  const baseUrl = (providerRow.baseUrl ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '')

  return {
    embedOptions: {
      baseUrl,
      model: embedModelId,
      apiKey: providerConfig?.apiKey ?? null,
    },
    embedModel: embedModelId,
    embedDimension,
    vectorBackend: embedConfig.vectorBackend ?? 'file',
  }
}

function maybeMigrateLegacyEmbedConfig(
  workspaceId: string,
  kbId: string,
  embedConfig: ReturnType<typeof KnowledgeEmbedConfigSchema.parse>,
): ReturnType<typeof KnowledgeEmbedConfigSchema.parse> {
  const embedModelId = normalizeEmbedModelId(embedConfig.embedModelId)
  const embedDimension = normalizeEmbedDimension(embedModelId, embedConfig.embedDimension)

  if (embedModelId === embedConfig.embedModelId && embedDimension === embedConfig.embedDimension) {
    return embedConfig
  }

  const nextConfig = {
    ...embedConfig,
    embedModelId,
    embedDimension,
  }

  getKnowledgeBaseRepository().update({
    id: kbId,
    workspaceId,
    embedConfigJson: JSON.stringify(nextConfig),
  })

  return nextConfig
}

export function resolveWorkspaceEmbedConfig(workspaceId: string): ResolvedEmbedConfig {
  const providerRow = resolveWorkspaceProvider(
    workspaceId,
    DEFAULT_KNOWLEDGE_EMBED_CONFIG.embedProviderId,
  )
  if (!providerRow) {
    throw new Error('未找到可用的嵌入模型 Provider，请先在设置中配置并启用对应服务')
  }

  return buildResolvedEmbedConfig(DEFAULT_KNOWLEDGE_EMBED_CONFIG, providerRow)
}

export function resolveEmbedConfig(workspaceId: string, kbId: string): ResolvedEmbedConfig {
  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(kbId, workspaceId) ?? kbRepo.findRowByIdOnly(kbId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  const embedConfig = maybeMigrateLegacyEmbedConfig(
    kb.workspaceId,
    kbId,
    parseJson(kb.embedConfigJson, KnowledgeEmbedConfigSchema, DEFAULT_KNOWLEDGE_EMBED_CONFIG),
  )

  const providerRow = resolveWorkspaceProvider(kb.workspaceId, embedConfig.embedProviderId)
  if (!providerRow) {
    throw new Error('未找到可用的嵌入模型 Provider，请先在设置中配置并启用对应服务')
  }

  return buildResolvedEmbedConfig(embedConfig, providerRow)
}

export function resolveChunkConfig(kbId: string, workspaceId: string) {
  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(kbId, workspaceId) ?? kbRepo.findRowByIdOnly(kbId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  return parseJson(kb.chunkConfigJson, KnowledgeChunkConfigSchema, DEFAULT_KNOWLEDGE_CHUNK_CONFIG)
}

export const DEFAULT_KB_SCORE_THRESHOLD = 0.3

export function resolveKbScoreThreshold(
  embedConfigJson: string,
  globalOverride?: number,
): number {
  if (globalOverride !== undefined) return globalOverride

  const embedConfig = parseJson(
    embedConfigJson,
    KnowledgeEmbedConfigSchema,
    DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  )
  return embedConfig.scoreThreshold ?? DEFAULT_KB_SCORE_THRESHOLD
}

export function resolveRerankConfig(workspaceId: string, kbId: string): ResolvedRerankConfig | null {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (!kb) return null

  const embedConfig = parseJson(
    kb.embedConfigJson,
    KnowledgeEmbedConfigSchema,
    DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  )

  if (!embedConfig.rerankProviderId || !embedConfig.rerankModelId) {
    return null
  }

  const providerRow = resolveWorkspaceProvider(workspaceId, embedConfig.rerankProviderId)
  if (!providerRow) return null

  const providerConfig = getProviderConfig(providerRow.id)
  const baseUrl = (providerRow.baseUrl ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '')

  return {
    rerankOptions: {
      baseUrl,
      model: embedConfig.rerankModelId,
      apiKey: providerConfig?.apiKey ?? null,
    },
    rerankModel: embedConfig.rerankModelId,
  }
}

export interface ResolvedDocProcessorConfig {
  enhanced: boolean
}

export function resolveDocProcessorConfig(
  workspaceId: string,
  kbId: string,
): ResolvedDocProcessorConfig {
  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (!kb) return { enhanced: false }

  const embedConfig = parseJson(
    kb.embedConfigJson,
    KnowledgeEmbedConfigSchema,
    DEFAULT_KNOWLEDGE_EMBED_CONFIG,
  )

  if (!embedConfig.docProcessorProviderId) {
    return { enhanced: false }
  }

  const providerRow = resolveWorkspaceProvider(workspaceId, embedConfig.docProcessorProviderId)
  return { enhanced: Boolean(providerRow) }
}

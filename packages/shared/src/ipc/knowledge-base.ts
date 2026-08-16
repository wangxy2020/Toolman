import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  buildDefaultKnowledgeWatchExcludePatterns,
  buildDefaultKnowledgeWatchIncludePatterns,
} from '../knowledge-watch-config.js'

export const KnowledgeBaseStatusSchema = z.enum(['idle', 'indexing', 'reindexing', 'error'])

export const KnowledgeBaseKindSchema = z.enum(['local', 'network', 'local_files', 'shared', 'sync'])
export type KnowledgeBaseKind = z.infer<typeof KnowledgeBaseKindSchema>

export const KnowledgeEmbedConfigSchema = z.object({
  embedProviderId: z.string().nullable().optional(),
  embedModelId: z.string().default('bge-m3:latest'),
  embedDimension: z.number().int().positive().default(1024),
  rerankProviderId: z.string().nullable().optional(),
  rerankModelId: z.string().nullable().optional(),
  docProcessorProviderId: z.string().nullable().optional(),
  scoreThreshold: z.number().min(0).max(1).optional(),
  /** 向量存储后端：file=JSON 文件，lance=LanceDB */
  vectorBackend: z.enum(['file', 'lance']).default('file'),
})

export const KnowledgeChunkConfigSchema = z.object({
  chunkSize: z.number().int().positive().default(512),
  chunkOverlap: z.number().int().nonnegative().default(64),
  strategy: z.enum(['fixed', 'markdown', 'semantic']).default('markdown'),
})

export const KnowledgeWatchConfigSchema = z.object({
  paths: z.array(z.string()).default([]),
  include: z.array(z.string()).default(buildDefaultKnowledgeWatchIncludePatterns),
  exclude: z.array(z.string()).default(buildDefaultKnowledgeWatchExcludePatterns),
  debounceMs: z.number().int().positive().default(2000),
  /** 网络知识库：定时刷新已索引网页的间隔（小时），0 表示关闭 */
  urlRefreshIntervalHours: z.number().int().nonnegative().default(0),
  /** 上次批量刷新网页的时间戳（毫秒） */
  lastUrlRefreshAt: z.number().int().nonnegative().optional(),
})

export const KnowledgeBaseSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  name: z.string(),
  description: z.string().nullable().optional(),
  kind: KnowledgeBaseKindSchema.default('local'),
  embedConfig: KnowledgeEmbedConfigSchema,
  chunkConfig: KnowledgeChunkConfigSchema,
  watchConfig: KnowledgeWatchConfigSchema,
  status: KnowledgeBaseStatusSchema,
  documentCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>

export const KnowledgeBaseListInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const KnowledgeBaseListOutputSchema = z.object({
  items: z.array(KnowledgeBaseSchema),
})

export const KnowledgeBaseGetInputSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
})

export const KnowledgeBaseCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  kind: KnowledgeBaseKindSchema.optional(),
  embedConfig: KnowledgeEmbedConfigSchema.partial().optional(),
  chunkConfig: KnowledgeChunkConfigSchema.partial().optional(),
  watchConfig: KnowledgeWatchConfigSchema.partial().optional(),
})

export const KnowledgeBaseUpdateInputSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(512).nullable().optional(),
  embedConfig: KnowledgeEmbedConfigSchema.partial().optional(),
  chunkConfig: KnowledgeChunkConfigSchema.partial().optional(),
  watchConfig: KnowledgeWatchConfigSchema.partial().optional(),
})

export const KnowledgeBaseDeleteInputSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
})

export const KnowledgeBaseDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})

export const BlobMetaSchema = z.object({
  hash: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  originalName: z.string().nullable().optional(),
  createdAt: TimestampSchema,
})

export type BlobMeta = z.infer<typeof BlobMetaSchema>

export const BlobUploadInputSchema = z.object({
  sourcePath: z.string().min(1).max(4096),
})

export const BlobGetMetaInputSchema = z.object({
  hash: z.string().min(1).max(128),
})

export const DEFAULT_KNOWLEDGE_EMBED_CONFIG = KnowledgeEmbedConfigSchema.parse({})
export const DEFAULT_KNOWLEDGE_CHUNK_CONFIG = KnowledgeChunkConfigSchema.parse({})
export const DEFAULT_KNOWLEDGE_WATCH_CONFIG = KnowledgeWatchConfigSchema.parse({})

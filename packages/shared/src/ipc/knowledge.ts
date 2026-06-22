import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  buildDefaultKnowledgeWatchExcludePatterns,
  buildDefaultKnowledgeWatchIncludePatterns,
} from '../knowledge-watch-config.js'

export const KnowledgeBaseStatusSchema = z.enum(['idle', 'indexing', 'reindexing', 'error'])

export const KnowledgeBaseKindSchema = z.enum(['local', 'network', 'local_files', 'shared'])
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

export const KnowledgeDocumentStatusSchema = z.enum([
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
  'ready',
  'failed',
])

export const KnowledgeDocumentSourceKindSchema = z.enum(['file', 'url'])

export const KnowledgeDocumentSchema = z.object({
  id: UuidSchema,
  kbId: UuidSchema,
  title: z.string(),
  contentHash: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  status: KnowledgeDocumentStatusSchema,
  absolutePath: z.string().nullable().optional(),
  sourceKind: KnowledgeDocumentSourceKindSchema.default('file'),
  chunkCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>

export const KnowledgeDocumentListInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
})

export const KnowledgeDocumentListOutputSchema = z.object({
  items: z.array(KnowledgeDocumentSchema),
})

export const KnowledgeDocumentIngestInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  filePaths: z.array(z.string().min(1).max(4096)).min(1).max(50),
})

export const KnowledgeDocumentIngestOutputSchema = z.object({
  ingested: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative().optional(),
  failed: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    }),
  ),
})

export const KnowledgeDocumentDeleteInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  documentId: UuidSchema,
})

export const KnowledgeDocumentDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})

export const KnowledgeDocumentReindexInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  documentId: UuidSchema,
})

export const KnowledgeDocumentReindexOutputSchema = z.object({
  outcome: z.enum(['ingested', 'skipped', 'failed']),
  path: z.string().optional(),
  message: z.string().optional(),
})

export const KnowledgeKbReindexInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
})

export const KnowledgeKbReindexOutputSchema = z.object({
  ingested: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
})

export const KnowledgeFtsRebuildInputSchema = z.object({
  workspaceId: UuidSchema.optional(),
})

export const KnowledgeFtsRebuildOutputSchema = z.object({
  indexed: z.number().int().nonnegative(),
})

export const KnowledgeSearchInputSchema = z.object({
  workspaceId: UuidSchema,
  kbIds: z.array(UuidSchema).optional(),
  query: z.string().min(1).max(4096),
  topK: z.number().int().min(1).max(20).default(6),
  scoreThreshold: z.number().min(0).max(1).optional(),
  kbSettings: z
    .record(
      z.object({
        topK: z.number().int().min(1).max(20).optional(),
        scoreThreshold: z.number().min(0).max(1).optional(),
      }),
    )
    .optional(),
  hybridEnabled: z.boolean().default(true),
  vectorWeight: z.number().min(0).max(1).default(0.65),
  ftsWeight: z.number().min(0).max(1).default(0.35),
})

export const KnowledgeSearchResultSchema = z.object({
  chunkId: z.string(),
  documentId: UuidSchema,
  documentTitle: z.string(),
  kbId: UuidSchema,
  kbName: z.string(),
  score: z.number(),
  text: z.string(),
  sourcePath: z.string().nullable().optional(),
})

export type KnowledgeSearchResult = z.infer<typeof KnowledgeSearchResultSchema>

export const KnowledgeCitationSchema = KnowledgeSearchResultSchema.pick({
  documentTitle: true,
  kbName: true,
  score: true,
  text: true,
  sourcePath: true,
})

export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>

export const KnowledgeSearchOutputSchema = z.object({
  items: z.array(KnowledgeSearchResultSchema),
})

export const KnowledgeSourceTypeSchema = z.enum([
  'folder',
  'file',
  'url',
  'upload',
  'notion_export',
])

export const KnowledgeSourceSchema = z.object({
  id: UuidSchema,
  kbId: UuidSchema,
  type: KnowledgeSourceTypeSchema,
  uri: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>

export const KnowledgeSourceListInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
})

export const KnowledgeSourceListOutputSchema = z.object({
  items: z.array(KnowledgeSourceSchema),
})

export const KnowledgeSourceAddFolderInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  folderPath: z.string().min(1).max(4096),
})

export const KnowledgeSourceAddFolderOutputSchema = z.object({
  source: KnowledgeSourceSchema,
  initialScan: KnowledgeDocumentIngestOutputSchema,
})

export const KnowledgeSourceAddUrlInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  url: z.string().url().max(4096),
})

export const KnowledgeSourceAddUrlOutputSchema = z.object({
  source: KnowledgeSourceSchema,
  documentId: UuidSchema,
  outcome: z.enum(['ingested', 'skipped', 'failed']),
  message: z.string().optional(),
})

export const KnowledgeSourceAddSitemapInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  sitemapUrl: z.string().url().max(4096),
})

export const KnowledgeSourceAddSitemapOutputSchema = z.object({
  source: KnowledgeSourceSchema,
  urlsFound: z.number().int().nonnegative(),
  ingested: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.array(z.object({ path: z.string(), message: z.string() })),
})

export const KnowledgeIngestJobSchema = z.object({
  id: UuidSchema,
  documentId: UuidSchema,
  kbId: UuidSchema,
  workspaceId: UuidSchema,
  stage: z.enum(['queued', 'parsing', 'chunking', 'embedding', 'indexing', 'done', 'failed']),
  progress: z.number().int().nonnegative(),
  title: z.string(),
  absolutePath: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: TimestampSchema,
})

export const KnowledgeIngestJobListInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema.optional(),
  includeFailed: z.boolean().optional(),
})

export const KnowledgeIngestJobListOutputSchema = z.object({
  items: z.array(KnowledgeIngestJobSchema),
})

export const KnowledgeIngestJobCancelInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  documentId: UuidSchema,
})

export const KnowledgeIngestJobCancelOutputSchema = z.object({
  cancelled: z.boolean(),
})

export const KnowledgeIngestJobRetryInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  documentId: UuidSchema,
})

export const KnowledgeIngestJobRetryOutputSchema = z.object({
  retried: z.boolean(),
})

export const KnowledgeFileRegistryItemSchema = z.object({
  id: UuidSchema,
  absolutePath: z.string(),
  contentHash: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  mtimeMs: z.number(),
  documentId: UuidSchema.nullable().optional(),
  documentTitle: z.string().nullable().optional(),
  kbId: UuidSchema.nullable().optional(),
  kbName: z.string().nullable().optional(),
  updatedAt: TimestampSchema,
})

export const KnowledgeFileRegistryListInputSchema = z.object({
  workspaceId: UuidSchema,
  limit: z.number().int().positive().max(2000).optional(),
})

export const KnowledgeFileRegistryListOutputSchema = z.object({
  items: z.array(KnowledgeFileRegistryItemSchema),
})

export type KnowledgeFileRegistryItem = z.infer<typeof KnowledgeFileRegistryItemSchema>

export const KnowledgeSourceAddNotionExportInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  folderPath: z.string().min(1).max(4096),
})

export const KnowledgeSourceAddNotionExportOutputSchema = z.object({
  source: KnowledgeSourceSchema,
  initialScan: KnowledgeDocumentIngestOutputSchema,
})

export const KnowledgeSourceRemoveInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  sourceId: UuidSchema,
})

export const KnowledgeSourceRemoveOutputSchema = z.object({
  removed: z.boolean(),
})

export const KnowledgeWatchStatusItemSchema = z.object({
  key: z.string(),
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  folderPath: z.string(),
  watching: z.boolean(),
})

export const KnowledgeWatchStatusInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
})

export const KnowledgeWatchStatusOutputSchema = z.object({
  items: z.array(KnowledgeWatchStatusItemSchema),
})

export const KnowledgeFolderEnsureInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const KnowledgeFolderEnsureOutputSchema = z.object({
  path: z.string(),
})

export const KnowledgeFolderGetInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const KnowledgeFolderGetOutputSchema = z.object({
  path: z.string().nullable(),
})

export const KnowledgeNetworkFolderEnsureInputSchema = KnowledgeFolderEnsureInputSchema
export const KnowledgeNetworkFolderEnsureOutputSchema = KnowledgeFolderEnsureOutputSchema
export const KnowledgeNetworkFolderGetInputSchema = KnowledgeFolderGetInputSchema
export const KnowledgeNetworkFolderGetOutputSchema = KnowledgeFolderGetOutputSchema

export const KnowledgeBaseStorageEnsureInputSchema = z.object({
  path: z.string().min(1),
})

export const KnowledgeBaseStorageEnsureOutputSchema = z.object({
  path: z.string(),
})

export const KnowledgeFileTypeCountSchema = z.object({
  type: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
})

export const KnowledgeFolderScanPreviewInputSchema = z.object({
  folderPath: z.string().min(1),
})

export const KnowledgeFolderScanPreviewOutputSchema = z.object({
  total: z.number().int().nonnegative(),
  counts: z.array(KnowledgeFileTypeCountSchema),
})

export const KnowledgeFolderListFilesInputSchema = z.object({
  folderPath: z.string().min(1),
})

export const KnowledgeFolderFileItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  updatedAt: TimestampSchema,
})

export type KnowledgeFolderFileItem = z.infer<typeof KnowledgeFolderFileItemSchema>

export const KnowledgeFolderListFilesOutputSchema = z.object({
  items: z.array(KnowledgeFolderFileItemSchema),
})

export const KnowledgeFolderImportFilesInputSchema = z.object({
  folderPath: z.string().min(1),
  filePaths: z.array(z.string().min(1).max(4096)).min(1).max(50),
})

export const KnowledgeFolderImportFilesOutputSchema = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    }),
  ),
})

export const KnowledgeFolderDeleteFileInputSchema = z.object({
  folderPath: z.string().min(1),
  filePath: z.string().min(1),
})

export const KnowledgeFolderDeleteFileOutputSchema = z.object({
  deleted: z.boolean(),
})

export const KnowledgeDefaultFolderEnsureKbInputSchema = z.object({
  workspaceId: UuidSchema,
  kind: z.enum(['local', 'network', 'local_files']),
})

export const KnowledgeDefaultFolderEnsureKbOutputSchema = z.object({
  kb: KnowledgeBaseSchema,
  folderPath: z.string(),
})

export const KnowledgeFileDedupScanInputSchema = z.object({
  workspaceId: UuidSchema,
  folderPath: z.string().min(1).max(4096),
})

export const KnowledgeFileDedupGroupSchema = z.object({
  contentHash: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  files: z.array(
    z.object({
      path: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      mtimeMs: z.number().int().nonnegative().optional(),
    }),
  ),
})

export const KnowledgeFileDedupScanOutputSchema = z.object({
  groups: z.array(KnowledgeFileDedupGroupSchema),
  scannedCount: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  savableBytes: z.number().int().nonnegative(),
})

export const KnowledgeFileDedupScanCancelInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const KnowledgeFileDedupScanCancelOutputSchema = z.object({
  cancelled: z.boolean(),
})

export const KnowledgeFileDedupStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    workspaceId: UuidSchema,
    phase: z.enum(['listing', 'hashing']),
    scanned: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    currentPath: z.string().optional(),
  }),
  z.object({
    type: z.literal('done'),
    workspaceId: UuidSchema,
    result: KnowledgeFileDedupScanOutputSchema,
  }),
  z.object({
    type: z.literal('error'),
    workspaceId: UuidSchema,
    message: z.string(),
  }),
  z.object({
    type: z.literal('cancelled'),
    workspaceId: UuidSchema,
  }),
])

export type KnowledgeFileDedupStreamEvent = z.infer<typeof KnowledgeFileDedupStreamEventSchema>

export const KnowledgeFileDedupDeleteInputSchema = z.object({
  workspaceId: UuidSchema,
  filePaths: z.array(z.string().min(1).max(4096)).min(1).max(200),
})

export const KnowledgeFileDedupDeleteOutputSchema = z.object({
  deleted: z.number().int().nonnegative(),
  failed: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    }),
  ),
})

export const KnowledgeIngestStreamEventSchema = z.object({
  type: z.literal('document.stage'),
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  documentId: UuidSchema,
  stage: KnowledgeDocumentStatusSchema,
  errorMessage: z.string().nullable().optional(),
})

export type KnowledgeIngestStreamEvent = z.infer<typeof KnowledgeIngestStreamEventSchema>
export type KnowledgeIngestJob = z.infer<typeof KnowledgeIngestJobSchema>
export type KnowledgeDocumentSourceKind = z.infer<typeof KnowledgeDocumentSourceKindSchema>

export const MemoryEntrySchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  assistantId: UuidSchema.nullable().optional(),
  content: z.string(),
  source: z.enum(['conversation', 'manual', 'import']),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const MemoryEntryListInputSchema = z.object({
  workspaceId: UuidSchema,
  limit: z.number().int().positive().max(200).optional(),
})

export const MemoryEntryListOutputSchema = z.object({
  items: z.array(MemoryEntrySchema),
})

export const MemoryEntryDeleteInputSchema = z.object({
  workspaceId: UuidSchema,
  entryId: UuidSchema,
})

export const MemoryEntryDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>


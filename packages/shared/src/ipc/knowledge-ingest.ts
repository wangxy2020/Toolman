import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { KnowledgeDocumentIngestOutputSchema } from './knowledge-document.js'

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

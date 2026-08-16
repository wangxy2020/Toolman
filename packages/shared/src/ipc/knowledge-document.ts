import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'

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
export type KnowledgeDocumentSourceKind = z.infer<typeof KnowledgeDocumentSourceKindSchema>

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

export const KnowledgeCourseOutlineEntrySchema = z.object({
  id: z.string().min(1),
  documentId: UuidSchema,
  title: z.string().min(1),
  label: z.string().min(1),
  level: z.number().int().min(1).max(3).default(1),
})

export const KnowledgeCourseOutlineInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
})

export const KnowledgeCourseOutlineOutputSchema = z.object({
  items: z.array(KnowledgeCourseOutlineEntrySchema),
  /** True when outline came from PDF bookmarks / text headings (not bare filenames). */
  fromContent: z.boolean(),
})

export type KnowledgeCourseOutlineEntry = z.infer<typeof KnowledgeCourseOutlineEntrySchema>

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

export const KnowledgeDocumentRelocateInputSchema = z.object({
  workspaceId: UuidSchema,
  sourceKbId: UuidSchema,
  destKbId: UuidSchema,
  items: z
    .array(
      z.object({
        documentId: UuidSchema,
        destPath: z.string().min(1).max(4096),
      }),
    )
    .min(1)
    .max(50),
})

export const KnowledgeDocumentRelocateOutputSchema = z.object({
  moved: z.number().int().nonnegative(),
  ingested: z.number().int().nonnegative(),
  failed: z.array(
    z.object({
      documentId: z.string(),
      path: z.string(),
      message: z.string(),
    }),
  ),
})


import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { KnowledgeBaseSchema } from './knowledge-base.js'
import { KnowledgeDocumentStatusSchema } from './knowledge-document.js'
import { KnowledgeIngestJobSchema } from './knowledge-ingest.js'

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
  kind: z.enum(['local', 'network', 'local_files', 'sync']),
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

export const KnowledgeIngestProgressDetailSchema = z.object({
  unit: z.enum(['page', 'chunk']),
  current: z.number().int().nonnegative(),
  total: z.number().int().positive(),
})

export const KnowledgeIngestStreamEventSchema = z.object({
  type: z.literal('document.stage'),
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  documentId: UuidSchema,
  stage: KnowledgeDocumentStatusSchema,
  progress: z.number().int().min(0).max(100).optional(),
  /** Page/chunk counters for status-bar copy (optional). */
  progressDetail: KnowledgeIngestProgressDetailSchema.nullable().optional(),
  errorMessage: z.string().nullable().optional(),
})

export type KnowledgeIngestProgressDetail = z.infer<typeof KnowledgeIngestProgressDetailSchema>
export type KnowledgeIngestStreamEvent = z.infer<typeof KnowledgeIngestStreamEventSchema>
export type KnowledgeIngestJob = z.infer<typeof KnowledgeIngestJobSchema>

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


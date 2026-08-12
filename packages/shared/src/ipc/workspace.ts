import { z } from 'zod'
import { UuidSchema } from './base.js'

export const WorkspaceSettingsSchema = z
  .object({
    theme: z.string().optional(),
    defaultLocale: z.string().optional(),
    folderPath: z.string().optional(),
    knowledgeFolderPath: z.string().optional(),
    networkKnowledgeFolderPath: z.string().optional(),
    sharedKnowledgeFolderPath: z.string().optional(),
    syncKnowledgeFolderPath: z.string().optional(),
    localFilesFolderPath: z.string().optional(),
    codeEditor: z.string().optional(),
  })
  .passthrough()

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>

export const WorkspaceGetInputSchema = z.object({
  id: UuidSchema,
})

export const WorkspaceUpdateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100).optional(),
  settings: WorkspaceSettingsSchema.partial().optional(),
})

export const DialogSelectFolderInputSchema = z.object({
  defaultPath: z.string().optional(),
})

export const DialogSelectFolderOutputSchema = z.object({
  path: z.string().nullable(),
})

export const DialogSelectFilesInputSchema = z.object({
  defaultPath: z.string().optional(),
  multiple: z.boolean().optional(),
  title: z.string().optional(),
  buttonLabel: z.string().optional(),
  filters: z
    .array(
      z.object({
        name: z.string(),
        extensions: z.array(z.string()),
      }),
    )
    .optional(),
})

export const DialogSelectFilesOutputSchema = z.object({
  paths: z.array(z.string()),
})

export const DialogSelectFilesOrFoldersInputSchema = z.object({
  defaultPath: z.string().optional(),
})

export const DialogSelectFilesOrFoldersItemSchema = z.object({
  path: z.string(),
  isDirectory: z.boolean(),
})

export const DialogSelectFilesOrFoldersOutputSchema = z.object({
  items: z.array(DialogSelectFilesOrFoldersItemSchema),
})

export const DialogSaveFileInputSchema = z.object({
  sourcePath: z.string().min(1),
  defaultFileName: z.string().optional(),
  defaultPath: z.string().optional(),
})

export const DialogSaveFileOutputSchema = z.object({
  saved: z.boolean(),
  path: z.string().nullable(),
})

export const FileReadForChatInputSchema = z.object({
  paths: z.array(z.string()).min(1),
  maxBytesPerFile: z.number().int().positive().optional(),
  workspaceId: z.string().optional(),
  documentOcrEnabled: z.boolean().optional(),
})

export const FileReadForChatOutputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      content: z.string(),
      mimeType: z.string(),
      truncated: z.boolean().optional(),
    }),
  ),
  images: z
    .array(
      z.object({
        path: z.string(),
        name: z.string(),
        blobHash: z.string(),
        mimeType: z.string(),
      }),
    )
    .default([]),
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
})

export const FileReadBinaryInputSchema = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().positive().optional(),
})

export const FileReadBinaryOutputSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string(),
  byteLength: z.number().int().nonnegative(),
})

export const TranslationDocumentParsePagesInputSchema = z.object({
  path: z.string().min(1),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  workspaceId: z.string().uuid().optional(),
  /** When true, return page count and dimensions only (no text extraction / OCR). */
  metadataOnly: z.boolean().optional(),
  /** Translation settings override; app document-processing setting is used as fallback. */
  pdfParserBackend: z.enum(['builtin', 'opendataloader']).optional(),
  /** OpenDataLoader text preview only — no OCR or pdf.js fallback. */
  odlPreviewOnly: z.boolean().optional(),
  /** Parse the full PDF with one ODL JVM run; slice pages from the cached document. */
  fullDocument: z.boolean().optional(),
  /** OCR backfill only — read ODL cache, run vision OCR on empty pages in range. */
  ocrBackfillOnly: z.boolean().optional(),
  /** Full-document ODL via hybrid server when local ODL produced no markdown (scanned PDFs). */
  odlHybridBackfill: z.boolean().optional(),
  /** Local ODL warm only — no Hybrid (fast scan detection). */
  odlWarmOnly: z.boolean().optional(),
  /** Clear cached ODL document before parse (parse button first batch). */
  odlPreviewReset: z.boolean().optional(),
  /**
   * Hybrid OCR for the requested page range only — merge into session cache.
   * Used for progressive parse preview (IMA-style first pages in seconds).
   */
  odlProgressiveBatch: z.boolean().optional(),
  /** Skip local JVM warm on later progressive batches (scan already detected). */
  odlSkipLocalWarm: z.boolean().optional(),
  /** Renderer-side IPC timeout budget for this request. */
  timeoutMs: z.number().int().positive().optional(),
})

export const TranslationDocumentPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
  markdown: z.string().optional(),
})

export const TranslationDocumentParsePagesOutputSchema = z.object({
  totalPages: z.number().int().nonnegative(),
  pages: z.array(TranslationDocumentPageSchema),
  kind: z.enum(['pdf', 'word', 'excel', 'unknown']),
  /** PDF page size in points (page 1); used to align FitH preview slots. */
  pageWidth: z.number().nonnegative().optional(),
  pageHeight: z.number().nonnegative().optional(),
  /** Hybrid OCR enabled in settings but local hybrid server is not reachable. */
  hybridUnavailable: z.boolean().optional(),
  hybridUnavailableUrl: z.string().optional(),
  /** Local ODL had no text — Hybrid OCR was used or will be used for this PDF. */
  odlScanDetected: z.boolean().optional(),
})

export const TranslationDocumentRenderPageInputSchema = z.object({
  path: z.string().min(1),
  pageNumber: z.number().int().positive(),
  /** CSS pixel width of the preview column. */
  targetWidth: z.number().positive(),
})

export const TranslationDocumentRenderPageOutputSchema = z.object({
  totalPages: z.number().int().nonnegative(),
  pageNumber: z.number().int().positive(),
  base64: z.string(),
  mimeType: z.enum(['image/png', 'image/jpeg']),
  width: z.number().positive(),
  height: z.number().positive(),
})

export const ChatStageAttachmentBlobInputSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().min(1),
  name: z.string().optional(),
})

export const ChatStageAttachmentsInputSchema = z
  .object({
    paths: z.array(z.string()).default([]),
    blobs: z.array(ChatStageAttachmentBlobInputSchema).default([]),
  })
  .refine((data) => data.paths.length > 0 || data.blobs.length > 0, {
    message: 'paths or blobs required',
  })

export const ChatStageAttachmentsItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  blobHash: z.string(),
  mimeType: z.string(),
  kind: z.enum(['file', 'image']),
})

export const ChatStageAttachmentsOutputSchema = z.object({
  items: z.array(ChatStageAttachmentsItemSchema),
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
})

export const BlobGetDataUrlInputSchema = z.object({
  hash: z.string().min(1),
})

export const BlobGetDataUrlOutputSchema = z.object({
  dataUrl: z.string(),
})

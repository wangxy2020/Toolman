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
})

export const TranslationDocumentPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
})

export const TranslationDocumentParsePagesOutputSchema = z.object({
  totalPages: z.number().int().nonnegative(),
  pages: z.array(TranslationDocumentPageSchema),
  kind: z.enum(['pdf', 'word', 'excel', 'unknown']),
  /** PDF page size in points (page 1); used to align FitH preview slots. */
  pageWidth: z.number().nonnegative().optional(),
  pageHeight: z.number().nonnegative().optional(),
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

export const ChatStageAttachmentsInputSchema = z.object({
  paths: z.array(z.string()).min(1),
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

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

import { z } from 'zod'
import { UuidSchema } from './base.js'

/** App note ids use `note-<uuid>`; not a bare RFC-4122 string. */
export const NoteIdSchema = z.string().min(1).max(200)

export const NotesAttachmentImportInputSchema = z.object({
  noteId: NoteIdSchema,
  sourcePath: z.string(),
})

export const NotesAttachmentImportOutputSchema = z.object({
  relativePath: z.string(),
  absolutePath: z.string(),
  name: z.string(),
})

export const NotesSyncExportInputSchema = z.object({
  folderPath: z.string(),
  dataJson: z.string(),
})

export const NotesSyncExportOutputSchema = z.object({
  filePath: z.string(),
})

export const NotesDataSyncInputSchema = z.object({
  dataJson: z.string(),
})

export const NotesDataSyncOutputSchema = z.object({
  synced: z.boolean(),
})

export const NotesDataLoadInputSchema = z.object({})

export const NotesDataLoadOutputSchema = z.object({
  dataJson: z.string(),
})

export const NotesGetByIdInputSchema = z.object({
  noteId: NoteIdSchema,
})

export const NotesGetByIdOutputSchema = z.object({
  noteJson: z.string().nullable(),
})

export const NotesIngestToKbInputSchema = z.object({
  workspaceId: UuidSchema,
  kbId: UuidSchema,
  noteIds: z.array(z.string()).optional(),
  notebookId: z.string().optional(),
})

export const NotesIngestToKbOutputSchema = z.object({
  queued: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  noteCount: z.number().int().nonnegative(),
})

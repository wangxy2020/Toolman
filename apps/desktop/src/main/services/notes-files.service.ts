import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import {
  NotesAttachmentImportInputSchema,
  NotesAttachmentImportOutputSchema,
  NotesSyncExportInputSchema,
  NotesSyncExportOutputSchema,
  ipcOk,
} from '@toolman/shared'

function getNotesAttachmentsDir(noteId: string): string {
  const dir = join(app.getPath('userData'), 'notes-attachments', noteId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function importNotesAttachment(input: unknown) {
  const data = NotesAttachmentImportInputSchema.parse(input)
  const dir = getNotesAttachmentsDir(data.noteId)
  const name = basename(data.sourcePath)
  const fileName = `${Date.now()}-${name}`
  const dest = join(dir, fileName)
  copyFileSync(data.sourcePath, dest)
  return ipcOk(
    NotesAttachmentImportOutputSchema.parse({
      relativePath: join('notes-attachments', data.noteId, fileName),
      absolutePath: dest,
      name,
    }),
  )
}

export function exportNotesSyncFile(input: unknown) {
  const data = NotesSyncExportInputSchema.parse(input)
  if (!existsSync(data.folderPath)) mkdirSync(data.folderPath, { recursive: true })
  const filePath = join(data.folderPath, 'toolman-notes-sync.json')
  writeFileSync(filePath, data.dataJson, 'utf8')
  return ipcOk(NotesSyncExportOutputSchema.parse({ filePath }))
}

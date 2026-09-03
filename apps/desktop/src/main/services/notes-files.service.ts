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
import { assertUserAccessiblePath } from './path-sandbox.service'

function getNotesAttachmentsDir(noteId: string): string {
  const dir = join(app.getPath('userData'), 'notes-attachments', noteId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function importNotesAttachment(input: unknown) {
  const data = NotesAttachmentImportInputSchema.parse(input)
  const sourcePath = assertUserAccessiblePath(data.sourcePath)
  const dir = getNotesAttachmentsDir(data.noteId)
  const name = basename(sourcePath)
  const fileName = `${Date.now()}-${name}`
  const dest = join(dir, fileName)
  copyFileSync(sourcePath, dest)
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
  const folderPath = assertUserAccessiblePath(data.folderPath)
  if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true })
  const filePath = join(folderPath, 'toolman-notes-sync.json')
  writeFileSync(filePath, data.dataJson, 'utf8')
  return ipcOk(NotesSyncExportOutputSchema.parse({ filePath }))
}

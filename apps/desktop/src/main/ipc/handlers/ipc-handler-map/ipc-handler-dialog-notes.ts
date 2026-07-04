import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import { saveFile, selectFiles, selectFilesOrFolders, selectFolder } from '../../dialog'
import { readFileBinary } from '../../../services/file-read-binary.service'
import { readFilesForChat } from '../../../services/file-read.service'
import { parseTranslationDocumentPages } from '../../../services/translation-document-parse.service'
import { renderTranslationDocumentPage } from '../../../services/translation-document-render.service'
import { stageChatAttachments } from '../../../services/chat-attachment-stage.service'
import { exportNotesSyncFile, importNotesAttachment } from '../../../services/notes-files.service'
import { ingestNotesToKnowledgeBase, getNoteById, getNotesDataJson, syncNotesData } from '../../../services/notes-data.service'
import { agentIpcHandlers } from '../../agent-ipc-handlers'
import { taskIpcHandlers } from '../../task-ipc-handlers'
import type { HandlerFn } from './types'

export const dialogNotesIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.DialogSelectFolder]: async (input) => selectFolder(input),
  [IpcChannel.DialogSelectFiles]: async (input) => selectFiles(input),
  [IpcChannel.DialogSelectFilesOrFolders]: async (input) => selectFilesOrFolders(input),
  [IpcChannel.DialogSaveFile]: async (input) => saveFile(input),
  [IpcChannel.FileReadForChat]: async (input) => readFilesForChat(input),
  [IpcChannel.FileReadBinary]: async (input) => readFileBinary(input),
  [IpcChannel.TranslationDocumentParsePages]: async (input) => parseTranslationDocumentPages(input),
  [IpcChannel.TranslationDocumentRenderPage]: async (input) => renderTranslationDocumentPage(input),
  [IpcChannel.ChatStageAttachments]: async (input) => stageChatAttachments(input),
  [IpcChannel.NotesAttachmentImport]: async (input) => importNotesAttachment(input),
  [IpcChannel.NotesSyncExport]: async (input) => exportNotesSyncFile(input),
  [IpcChannel.NotesDataSync]: async (input) => ipcOk(syncNotesData(input)),
  [IpcChannel.NotesDataLoad]: async () => ipcOk({ dataJson: getNotesDataJson() }),
  [IpcChannel.NotesGetById]: async (input) => {
    const noteId = typeof (input as { noteId?: unknown }).noteId === 'string'
      ? (input as { noteId: string }).noteId
      : ''
    const note = noteId ? getNoteById(noteId) : null
    return ipcOk({ noteJson: note ? JSON.stringify(note) : null })
  },
  [IpcChannel.NotesIngestToKb]: async (input) => {
    try {
      return ipcOk(await ingestNotesToKnowledgeBase(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Ingest notes failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  ...agentIpcHandlers,
  ...taskIpcHandlers,
}

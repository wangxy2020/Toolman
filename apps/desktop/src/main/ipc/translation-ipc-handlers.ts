import { IpcChannel } from '@toolman/shared'
import { readFileBinary } from '../services/file-read-binary.service'
import { parseTranslationDocumentPages } from '../services/translation-document-parse.service'
import { renderTranslationDocumentPage } from '../services/translation-document-render.service'
import type { HandlerFn } from './handlers/ipc-handler-map/types'

/** Document-translation IPC only. Contrast translation uses MessageTranslate. */
export const translationIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.FileReadBinary]: async (input) => readFileBinary(input),
  [IpcChannel.TranslationDocumentParsePages]: async (input) => parseTranslationDocumentPages(input),
  [IpcChannel.TranslationDocumentRenderPage]: async (input) => renderTranslationDocumentPage(input),
}

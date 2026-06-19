import { type ParseFileOptions } from '@toolman/knowledge'
import { buildChatPdfOcrOptions } from './knowledge-parse-options.service'

export interface BuildChatParseOptionsInput {
  documentOcrEnabled?: boolean
  onStatus?: (message: string) => void
}

export function buildChatParseOptions(
  workspaceId: string,
  input?: BuildChatParseOptionsInput,
): ParseFileOptions {
  const options: ParseFileOptions = {
    enhanced: true,
    pdfTextQuality: 'strict',
  }

  if (input?.documentOcrEnabled !== false) {
    const ocr = buildChatPdfOcrOptions(workspaceId)
    if (ocr) {
      options.ocr = ocr
    }
  }

  return options
}

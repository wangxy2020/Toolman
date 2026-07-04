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
  const ocrDisabled = input?.documentOcrEnabled === false
  const options: ParseFileOptions = {
    enhanced: true,
    // When OCR is off (e.g. translation preview), return best-effort text instead of failing.
    pdfTextQuality: ocrDisabled ? 'lenient' : 'strict',
  }

  if (!ocrDisabled) {
    const ocr = buildChatPdfOcrOptions(workspaceId)
    if (ocr) {
      options.ocr = ocr
    }
  }

  return options
}

import { isSupportedKnowledgeFile, type ParseFileOptions } from '@toolman/knowledge'
import {
  CHAT_OCR_MAX_PAGES,
  MAX_OCR_PAGES,
  createPdfOcrRecognizer,
  ocrImageBuffer,
} from './document-ocr.service'
import { resolveDocProcessorConfig } from './knowledge-embed.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'

export function buildKnowledgeParseOptions(
  workspaceId: string,
  kbId: string,
): ParseFileOptions {
  const docProcessor = resolveDocProcessorConfig(workspaceId, kbId)
  const options: ParseFileOptions = {
    enhanced: docProcessor.enhanced,
    pdfTextQuality: 'prefer-extracted',
  }

  if (!isDocumentOcrEnabled()) {
    return options
  }

  options.ocr = {
    enabled: true,
    maxPdfPages: MAX_OCR_PAGES,
    recognizePage: createPdfOcrRecognizer(workspaceId, { kbId }),
    recognizeImage: async ({ buffer, mimeType }) =>
      ocrImageBuffer(buffer, mimeType, workspaceId, kbId),
  }

  return options
}

export function knowledgeIngestSupportsFile(filePath: string): boolean {
  return isSupportedKnowledgeFile(filePath, { ocrEnabled: isDocumentOcrEnabled() })
}

export function buildChatPdfOcrOptions(workspaceId: string): ParseFileOptions['ocr'] | undefined {
  if (!isDocumentOcrEnabled()) return undefined

  return {
    enabled: true,
    maxPdfPages: CHAT_OCR_MAX_PAGES,
    recognizePage: createPdfOcrRecognizer(workspaceId, { chat: true }),
    recognizeImage: async ({ buffer, mimeType }) =>
      ocrImageBuffer(buffer, mimeType, workspaceId),
  }
}

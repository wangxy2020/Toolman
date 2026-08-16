import {
  isPdfExtractedTextInsufficient,
  type ParseFileOptions,
} from '@toolman/knowledge'
import type {
  DocumentParseProfile,
  DocumentParseRequest,
  DocumentParseResult,
} from '@toolman/opendataloader'
import type { PdfParserBackend } from '@toolman/shared'
import { resolvePdfParserBackend } from './runtime-app-settings.service'
import {
  DEFAULT_ODL_TIMEOUT_MS,
} from './document-parser-odl-cache'
import { parseOdlWithOptionalHybridRetry } from './document-parser-ingest'
import { parsePdfDocumentOdlPreview } from './document-parser-odl-preview'
import { parsePdfDocumentTranslation } from './document-parser-translation'
import { parsePdfDocumentBuiltin } from './document-parser-chat'

export type { DocumentParseProfile, DocumentParseRequest, DocumentParseResult }

export interface PdfDocumentParseRequest extends DocumentParseRequest {
  workspaceId?: string | null
  kbId?: string
  onOcrProgress?: ParseFileOptions['onOcrProgress']
  documentOcrEnabled?: boolean
  timeoutMs?: number
  /** Primary PDF backend from translation settings (translation profile only). */
  pdfParserBackend?: PdfParserBackend
  /** OpenDataLoader raw text preview — no OCR or pdf.js fallback. */
  odlPreviewOnly?: boolean
  /** One JVM run for the whole PDF; pageRange selects the slice returned. */
  fullDocument?: boolean
  /** Vision OCR for empty pages only (phase 3 — after ODL warm). */
  ocrBackfillOnly?: boolean
  /** Drop cached ODL document before warm (parse button). */
  odlPreviewReset?: boolean
  /** Local JVM only — detect scans in ~300ms without Hybrid OCR. */
  odlWarmOnly?: boolean
  /** Re-run full-document ODL through hybrid server (after local warm had no markdown). */
  odlHybridBackfill?: boolean
  /** Hybrid OCR for pageRange only; merge into preview cache (progressive parse). */
  odlProgressiveBatch?: boolean
  /** Skip local JVM on later progressive batches after scan detection. */
  odlSkipLocalWarm?: boolean
}

export interface OdlPreviewParseMeta {
  hybridUnavailable?: boolean
  hybridUnavailableUrl?: string
  odlScanDetected?: boolean
}

export async function parsePdfDocument(
  request: PdfDocumentParseRequest,
  backend: PdfParserBackend = resolvePdfParserBackend(),
): Promise<DocumentParseResult> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_ODL_TIMEOUT_MS
  if (request.profile === 'metadata') return parsePdfDocumentBuiltin(request)
  if (request.profile === 'translation') {
    if (request.odlPreviewOnly) return parsePdfDocumentOdlPreview(request, timeoutMs)
    const primary = request.pdfParserBackend ?? backend
    const fallback = resolvePdfParserBackend()
    return parsePdfDocumentTranslation(request, primary, fallback, timeoutMs)
  }
  if (backend === 'opendataloader') {
    try {
      return await parseOdlWithOptionalHybridRetry(
        {
          filePath: request.filePath,
          profile: request.profile,
          password: request.password,
          pageRange: request.pageRange,
          convertOverrides: request.convertOverrides,
        },
        timeoutMs,
      )
    } catch {
      return parsePdfDocumentBuiltin(request)
    }
  }
  return parsePdfDocumentBuiltin(request)
}

export {
  clearOdlPreviewCache,
  isPdfFilePath,
  mergeOdlPreviewBatchIntoCache,
  peekOdlPreviewDocumentCache,
  renormalizeOdlPageRangeResult,
  shouldUseOpenDataLoaderForPdf,
  sliceOdlDocumentResult,
} from './document-parser-odl-cache'

export { parseIngestDocumentFile, tryParseIngestWithOdl } from './document-parser-ingest'
export { parseChatPdfAttachment } from './document-parser-chat'
export { isPdfExtractedTextInsufficient }

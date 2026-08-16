import {
  extractPdfDocumentInfo,
  extractPdfPageTexts,
  extractPdfPlainText,
  splitPdfPagesByMarkers,
  type PdfPageText,
} from '@toolman/knowledge'
import type { DocumentParseResult } from '@toolman/opendataloader'
import type { PdfParserBackend } from '@toolman/shared'
import { stripOcrCollapsedContent } from '@toolman/shared'
import { withTimeout } from '../utils/async-timeout'
import { buildChatParseOptions } from './chat-parse-options.service'
import { buildChatPdfOcrOptions, buildKnowledgeParseOptions } from './knowledge-parse-options.service'
import { isDocumentOcrEnabled, resolveOdlHybridSettings } from './runtime-app-settings.service'
import type { PdfDocumentParseRequest } from './document-parser.service'
import { parsePdfDocumentTranslation } from './document-parser-translation'
import {
  hybridUnreachableBackfillLogged,
  isHybridServerAvailable,
  markHybridUnreachableBackfillLogged,
  shouldUseOpenDataLoaderForPdf,
} from './document-parser-odl-cache'
import { parseOdlWithOptionalHybridRetry } from './document-parser-ingest'

const CHAT_PDF_TIMEOUT_MS = 3 * 60 * 1000
/** Parallel vision-OCR pages per backfill wave (Ollama glm-ocr). */
const ODL_PREVIEW_OCR_CONCURRENCY = 2

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let nextIndex = 0
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (true) {
        const index = nextIndex++
        if (index >= items.length) break
        await worker(items[index]!, index)
      }
    },
  )
  await Promise.all(runners)
}

function shouldAllowVisionOcrFallback(): boolean {
  return isDocumentOcrEnabled()
}

export function buildDocumentParseResultFromPlainText(
  plainText: string,
  totalPages: number,
  backend: PdfParserBackend,
  dimensions?: { pageWidth?: number; pageHeight?: number },
): DocumentParseResult {
  const markerPages = splitPdfPagesByMarkers(plainText)
  const pages =
    markerPages.length > 0
      ? markerPages.map((page) => ({ pageNumber: page.pageNumber, text: page.text }))
      : []
  return {
    backend,
    totalPages: totalPages || pages.length || 1,
    plainText,
    markdown: plainText,
    pages,
    pageWidth: dimensions?.pageWidth,
    pageHeight: dimensions?.pageHeight,
  }
}

export async function backfillOdlPreviewPages(
  request: PdfDocumentParseRequest,
  pages: PdfPageText[],
  needsBackfill: number[],
  fallbackBackend: PdfParserBackend,
  timeoutMs: number,
): Promise<void> {
  if (needsBackfill.length === 0) return
  const start = needsBackfill[0]!
  const end = needsBackfill[needsBackfill.length - 1]!
  try {
    const extracted = await extractPdfPageTexts(request.filePath, start, end)
    for (const row of extracted.pages) {
      const text = row.text.trim()
      if (!text) continue
      const page = pages.find((item) => item.pageNumber === row.pageNumber)
      if (!page || page.text.trim()) continue
      page.text = text
      page.markdown = text
    }
  } catch {
    // pdf.js may throw when the document has no text layer — OCR below.
  }

  const stillNeed = needsBackfill.filter((pageNumber) => {
    const page = pages.find((item) => item.pageNumber === pageNumber)
    return !page?.text.trim()
  })
  if (stillNeed.length === 0) return

  const hybridSettings = resolveOdlHybridSettings()
  const hybridUrl = hybridSettings.url.trim()
  const hybridReachable =
    hybridSettings.enabled && hybridUrl ? await isHybridServerAvailable(hybridUrl) : false
  if (stillNeed.length > 0 && hybridSettings.enabled && !hybridReachable) {
    if (!hybridUnreachableBackfillLogged) markHybridUnreachableBackfillLogged()
  }

  const chatOcr =
    request.workspaceId && shouldAllowVisionOcrFallback()
      ? buildChatPdfOcrOptions(request.workspaceId)
      : undefined
  if (chatOcr?.recognizePage) {
    const perPageTimeout = Math.min(
      3 * 60 * 1000,
      Math.max(120_000, Math.floor(timeoutMs / Math.max(1, stillNeed.length))),
    )
    await mapWithConcurrency(stillNeed, ODL_PREVIEW_OCR_CONCURRENCY, async (pageNumber) => {
      try {
        const ocrExtracted = await withTimeout(
          extractPdfPageTexts(request.filePath, pageNumber, pageNumber, {
            ocr: { recognizePage: chatOcr.recognizePage },
          }),
          perPageTimeout,
          `OCR 第 ${pageNumber} 页超时`,
        )
        const row = ocrExtracted.pages.find((item) => item.pageNumber === pageNumber)
        const text = stripOcrCollapsedContent(row?.text.trim() ?? '')
        if (!text) return
        const page = pages.find((item) => item.pageNumber === pageNumber)
        if (!page) return
        page.text = text
        page.markdown = text
      } catch {
        // OCR failed for this page — continue with remaining pages.
      }
    })
    return
  }

  const backfill = await parsePdfDocumentTranslation(
    {
      ...request,
      odlPreviewOnly: false,
      documentOcrEnabled: request.documentOcrEnabled ?? isDocumentOcrEnabled(),
      pdfParserBackend: 'builtin',
      pageRange: { start: stillNeed[0]!, end: stillNeed[stillNeed.length - 1]! },
    },
    'builtin',
    fallbackBackend,
    timeoutMs,
  )
  for (const row of backfill.pages) {
    const fallbackText = row.text.trim()
    if (!fallbackText) continue
    const page = pages.find((item) => item.pageNumber === row.pageNumber)
    if (!page) continue
    if (!page.text.trim()) page.text = fallbackText
    if (!page.markdown?.trim()) page.markdown = fallbackText
  }
}

export async function parsePdfDocumentBuiltin(
  request: PdfDocumentParseRequest,
): Promise<DocumentParseResult> {
  const { filePath, profile, pageRange, workspaceId, kbId, onOcrProgress, documentOcrEnabled } =
    request
  if (profile === 'metadata') {
    const info = await extractPdfDocumentInfo(filePath)
    return {
      backend: 'builtin',
      totalPages: info.totalPages,
      plainText: '',
      markdown: '',
      pages: [],
      pageWidth: info.pageWidth,
      pageHeight: info.pageHeight,
    }
  }
  if (profile === 'knowledge') {
    if (!workspaceId || !kbId) throw new Error('知识库 PDF 解析需要 workspaceId 与 kbId')
    const parseOptions = buildKnowledgeParseOptions(workspaceId, kbId)
    const plainText = await extractPdfPlainText(filePath, {
      preferPdfJs: Boolean(parseOptions.enhanced),
      textQuality: parseOptions.pdfTextQuality,
      ocr:
        parseOptions.ocr?.enabled && parseOptions.ocr.recognizePage
          ? {
              recognizePage: parseOptions.ocr.recognizePage,
              maxPages: parseOptions.ocr.maxPdfPages,
              onProgress: onOcrProgress ?? parseOptions.onOcrProgress,
            }
          : undefined,
    })
    const markerPages = splitPdfPagesByMarkers(plainText)
    const totalPages =
      markerPages.length > 0 ? Math.max(...markerPages.map((page) => page.pageNumber)) : 1
    return buildDocumentParseResultFromPlainText(plainText, totalPages, 'builtin')
  }
  if (profile === 'chat') {
    if (!workspaceId) throw new Error('聊天 PDF 解析需要 workspaceId')
    const parseOptions = buildChatParseOptions(workspaceId, { documentOcrEnabled })
    const plainText = await extractPdfPlainText(filePath, {
      preferPdfJs: true,
      textQuality: parseOptions.pdfTextQuality,
      ocr:
        parseOptions.ocr?.enabled && parseOptions.ocr.recognizePage
          ? { recognizePage: parseOptions.ocr.recognizePage, maxPages: parseOptions.ocr.maxPdfPages }
          : undefined,
    })
    const markerPages = splitPdfPagesByMarkers(plainText)
    const totalPages =
      markerPages.length > 0 ? Math.max(...markerPages.map((page) => page.pageNumber)) : 1
    return buildDocumentParseResultFromPlainText(plainText, totalPages, 'builtin')
  }

  const startPage = pageRange?.start ?? 1
  const endPage = pageRange?.end ?? startPage
  const chatOcr =
    workspaceId && (documentOcrEnabled ?? isDocumentOcrEnabled())
      ? buildChatPdfOcrOptions(workspaceId)
      : undefined
  const extracted = await extractPdfPageTexts(filePath, startPage, endPage, {
    ocr: chatOcr?.recognizePage ? { recognizePage: chatOcr.recognizePage } : undefined,
  })
  const pages = extracted.pages.map((page: PdfPageText) => ({
    pageNumber: page.pageNumber,
    text: page.text,
  }))
  return {
    backend: 'builtin',
    totalPages: extracted.totalPages,
    plainText: pages.map((page) => page.text).join('\n\n').trim(),
    markdown: pages.map((page) => page.text).join('\n\n').trim(),
    pages,
    pageWidth: extracted.pageWidth,
    pageHeight: extracted.pageHeight,
  }
}

export async function parseChatPdfAttachment(options: {
  filePath: string
  workspaceId: string
  documentOcrEnabled?: boolean
  timeoutMs?: number
}): Promise<{ plainText: string; totalPages: number; backend: PdfParserBackend }> {
  const { filePath, workspaceId, documentOcrEnabled, timeoutMs = CHAT_PDF_TIMEOUT_MS } = options
  if (shouldUseOpenDataLoaderForPdf(filePath)) {
    try {
      const result = await parseOdlWithOptionalHybridRetry({ filePath, profile: 'chat' }, timeoutMs)
      return {
        plainText: result.plainText,
        totalPages: Math.max(1, result.totalPages),
        backend: result.backend,
      }
    } catch {
      const result = await parsePdfDocumentBuiltin({
        filePath,
        profile: 'chat',
        workspaceId,
        documentOcrEnabled,
      })
      return {
        plainText: result.plainText,
        totalPages: Math.max(1, result.totalPages),
        backend: 'builtin',
      }
    }
  }
  const result = await parsePdfDocumentBuiltin({
    filePath,
    profile: 'chat',
    workspaceId,
    documentOcrEnabled,
  })
  return {
    plainText: result.plainText,
    totalPages: Math.max(1, result.totalPages),
    backend: 'builtin',
  }
}

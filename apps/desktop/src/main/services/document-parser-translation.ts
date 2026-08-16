import {
  extractPdfPageTexts,
  isPdfExtractedTextInsufficient,
  isPdfPageMarkerOnly,
} from '@toolman/knowledge'
import type { DocumentParseResult } from '@toolman/opendataloader'
import type { PdfParserBackend } from '@toolman/shared'
import { buildChatPdfOcrOptions } from './knowledge-parse-options.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'
import type { PdfDocumentParseRequest } from './document-parser.service'
import {
  odlPreviewDocumentCache,
  odlPreviewDocumentKey,
  pdfMetadataCache,
  resolveOdlPreviewParseTimeoutMs,
  resolvePdfTotalPages,
  shouldUseOpenDataLoaderForPdf,
} from './document-parser-odl-cache'

/** Plain text for LLM translation — strips markers and HTML noise. */
export function htmlToPlainText(raw: string): string {
  if (!/<[a-z][\s\S]*>/i.test(raw)) return raw
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function odlPageBodyDisplayable(text: string, markdown: string): boolean {
  const plain = text.trim() || htmlToPlainText(markdown).trim()
  const body = plain || markdown.trim()
  if (!body || isPdfPageMarkerOnly(body)) return false
  if (/<[a-z][\s\S]*>/i.test(markdown) && markdown.trim().length >= 24) return true
  return !isPdfExtractedTextInsufficient(body, 1)
}

export function odlPageBodyPreviewable(text: string, markdown: string): boolean {
  if (odlPageBodyDisplayable(text, markdown)) return true
  const md = markdown.trim()
  const plain = text.trim() || htmlToPlainText(md).trim()
  if (md && !isPdfPageMarkerOnly(md)) return true
  if (plain && !isPdfPageMarkerOnly(plain)) return true
  return false
}

interface TranslationPageCacheEntry {
  text: string
  totalPages: number
  pageWidth?: number
  pageHeight?: number
}

/** Per-page translation parse cache (main process, session-scoped). */
const translationPageCache = new Map<string, TranslationPageCacheEntry>()
const TRANSLATION_PAGE_CACHE_LIMIT = 500

function translationPageCacheKey(
  filePath: string,
  pageNumber: number,
  primaryBackend: PdfParserBackend,
  workspaceId?: string | null,
): string {
  return `${filePath}::${pageNumber}::${primaryBackend}::${workspaceId ?? ''}`
}

function getCachedTranslationPage(
  filePath: string,
  pageNumber: number,
  primaryBackend: PdfParserBackend,
  workspaceId?: string | null,
): TranslationPageCacheEntry | null {
  return translationPageCache.get(translationPageCacheKey(filePath, pageNumber, primaryBackend, workspaceId)) ?? null
}

function setCachedTranslationPage(
  filePath: string,
  pageNumber: number,
  primaryBackend: PdfParserBackend,
  workspaceId: string | null | undefined,
  entry: TranslationPageCacheEntry,
): void {
  const key = translationPageCacheKey(filePath, pageNumber, primaryBackend, workspaceId)
  translationPageCache.delete(key)
  translationPageCache.set(key, entry)
  while (translationPageCache.size > TRANSLATION_PAGE_CACHE_LIMIT) {
    const oldest = translationPageCache.keys().next().value
    if (!oldest) break
    translationPageCache.delete(oldest)
  }
}

function isUsableTranslationPageText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return !isPdfExtractedTextInsufficient(trimmed, 1)
}

function listPagesMissingUsableText(
  startPage: number,
  endPage: number,
  texts: Map<number, string>,
): number[] {
  const missing: number[] = []
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    const text = texts.get(pageNumber)?.trim() ?? ''
    if (!isUsableTranslationPageText(text)) missing.push(pageNumber)
  }
  return missing
}

async function extractBackendPageTexts(
  backend: PdfParserBackend,
  request: PdfDocumentParseRequest,
  timeoutMs: number,
): Promise<{
  texts: Map<number, string>
  totalPages: number
  pageWidth?: number
  pageHeight?: number
}> {
  const startPage = request.pageRange?.start ?? 1
  const endPage = request.pageRange?.end ?? startPage
  const texts = new Map<number, string>()
  if (backend === 'opendataloader') {
    try {
      const { getOdlPreviewRange, resolveOdlPreviewPageContent } = await import(
        './document-parser-odl-preview'
      )
      const [odl, totalPages] = await Promise.all([
        getOdlPreviewRange(request, startPage, endPage, timeoutMs),
        resolvePdfTotalPages(request.filePath),
      ])
      for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
        const resolved = resolveOdlPreviewPageContent(pageNumber, odl, startPage, endPage)
        const text = htmlToPlainText(resolved.text)
        if (text) texts.set(pageNumber, text)
      }
      const pdfMeta = pdfMetadataCache.get(request.filePath)
      return {
        texts,
        totalPages,
        pageWidth: pdfMeta?.pageWidth ?? odl.pageWidth,
        pageHeight: pdfMeta?.pageHeight ?? odl.pageHeight,
      }
    } catch {
      const totalPages = await resolvePdfTotalPages(request.filePath, 0).catch(() => 0)
      return { texts, totalPages }
    }
  }
  const extracted = await extractPdfPageTexts(request.filePath, startPage, endPage)
  for (const page of extracted.pages) texts.set(page.pageNumber, page.text)
  return {
    texts,
    totalPages: extracted.totalPages,
    pageWidth: extracted.pageWidth,
    pageHeight: extracted.pageHeight,
  }
}

/**
 * Translation profile: translation-settings backend → app document-processing backend → OCR.
 */
export async function parsePdfDocumentTranslation(
  request: PdfDocumentParseRequest,
  primaryBackend: PdfParserBackend,
  fallbackBackend: PdfParserBackend,
  timeoutMs: number,
): Promise<DocumentParseResult> {
  const startPage = request.pageRange?.start ?? 1
  const endPage = request.pageRange?.end ?? startPage
  const { filePath, workspaceId, documentOcrEnabled } = request
  const mergedTexts = new Map<number, string>()
  let totalPages = 0
  let pageWidth: number | undefined
  let pageHeight: number | undefined
  let resultBackend: PdfParserBackend = primaryBackend

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    const cached = getCachedTranslationPage(filePath, pageNumber, primaryBackend, workspaceId)
    if (!cached) continue
    if (cached.totalPages > 0) totalPages = cached.totalPages
    pageWidth ??= cached.pageWidth
    pageHeight ??= cached.pageHeight
    if (isUsableTranslationPageText(cached.text)) mergedTexts.set(pageNumber, cached.text.trim())
  }

  const uncachedStart = listPagesMissingUsableText(startPage, endPage, mergedTexts)[0]
  const needsFetch = uncachedStart !== undefined
  const fetchStart = needsFetch ? uncachedStart : startPage
  const fetchEnd = needsFetch
    ? (listPagesMissingUsableText(fetchStart, endPage, mergedTexts).at(-1) ?? fetchStart)
    : endPage

  const mergeExtract = (extract: Awaited<ReturnType<typeof extractBackendPageTexts>>) => {
    if (extract.totalPages > 0) totalPages = extract.totalPages
    pageWidth ??= extract.pageWidth
    pageHeight ??= extract.pageHeight
    for (const [pageNumber, text] of extract.texts) {
      if (isUsableTranslationPageText(text)) mergedTexts.set(pageNumber, text.trim())
    }
  }

  if (needsFetch) {
    mergeExtract(
      await extractBackendPageTexts(
        primaryBackend,
        { ...request, pageRange: { start: fetchStart, end: fetchEnd } },
        timeoutMs,
      ),
    )
  }

  let missing = listPagesMissingUsableText(startPage, endPage, mergedTexts)
  if (
    missing.length > 0 &&
    shouldUseOpenDataLoaderForPdf(filePath, primaryBackend) &&
    !odlPreviewDocumentCache.get(odlPreviewDocumentKey(filePath))
  ) {
    mergeExtract(
      await extractBackendPageTexts(
        'opendataloader',
        {
          ...request,
          profile: 'translation',
          pageRange: { start: missing[0]!, end: missing[missing.length - 1]! },
        },
        resolveOdlPreviewParseTimeoutMs(timeoutMs),
      ),
    )
    missing = listPagesMissingUsableText(startPage, endPage, mergedTexts)
  }

  if (missing.length > 0 && fallbackBackend !== primaryBackend) {
    mergeExtract(
      await extractBackendPageTexts(
        fallbackBackend,
        { ...request, pageRange: { start: missing[0]!, end: missing[missing.length - 1]! } },
        timeoutMs,
      ),
    )
    if (mergedTexts.size > 0) resultBackend = fallbackBackend
    missing = listPagesMissingUsableText(startPage, endPage, mergedTexts)
  }

  const ocrByPage = new Map<number, string>()
  if (missing.length > 0) {
    const chatOcr =
      workspaceId && (documentOcrEnabled ?? isDocumentOcrEnabled())
        ? buildChatPdfOcrOptions(workspaceId)
        : undefined
    if (chatOcr?.recognizePage) {
      const extracted = await extractPdfPageTexts(filePath, missing[0]!, missing[missing.length - 1]!, {
        ocr: { recognizePage: chatOcr.recognizePage },
      })
      if (extracted.totalPages > 0) totalPages = extracted.totalPages
      pageWidth ??= extracted.pageWidth
      pageHeight ??= extracted.pageHeight
      for (const page of extracted.pages) ocrByPage.set(page.pageNumber, page.text)
    }
  }

  const pdfTotalPages = await resolvePdfTotalPages(filePath, totalPages || 1)
  totalPages = Math.max(totalPages, pdfTotalPages)
  const pages = []
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    const mergedText = mergedTexts.get(pageNumber)?.trim() ?? ''
    const ocrText = ocrByPage.get(pageNumber)?.trim() ?? ''
    const finalText = isUsableTranslationPageText(mergedText) ? mergedText : ocrText
    pages.push({ pageNumber, text: finalText })
    setCachedTranslationPage(filePath, pageNumber, primaryBackend, workspaceId, {
      text: finalText,
      totalPages,
      pageWidth,
      pageHeight,
    })
  }
  const plainText = pages.map((page) => page.text).join('\n\n').trim()
  return { backend: resultBackend, totalPages, plainText, markdown: plainText, pages, pageWidth, pageHeight }
}

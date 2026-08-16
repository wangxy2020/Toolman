import { pickLongestUsableOdlBody, resolveOdlPageContent, type PdfPageText } from '@toolman/knowledge'
import type { DocumentParseResult } from '@toolman/opendataloader'
import { resolveOdlHybridSettings, resolvePdfParserBackend } from './runtime-app-settings.service'
import type { OdlPreviewParseMeta, PdfDocumentParseRequest } from './document-parser.service'
import { emptyOdlResult, parseOdlWithOptionalHybridRetry, runOdlHybridParseWithFallback } from './document-parser-ingest'
import { backfillOdlPreviewPages } from './document-parser-chat'
import { htmlToPlainText, odlPageBodyPreviewable } from './document-parser-translation'
import {
  getPdfMetadata,
  isHybridServerAvailable,
  mergeOdlPreviewBatchIntoCache,
  normalizeOdlDocumentChannels,
  odlPreviewDocumentCache,
  odlPreviewDocumentInflight,
  odlPreviewDocumentKey,
  odlPreviewScanDetected,
  parseOdlFullDocument,
  renormalizeOdlPageRangeResult,
  resolveOdlPreviewParseTimeoutMs,
  resolvePdfTotalPages,
  sliceOdlDocumentResult,
} from './document-parser-odl-cache'

export function resolveOdlPreviewPageContent(
  pageNumber: number,
  odl: DocumentParseResult,
  startPage: number,
  endPage: number,
) {
  const resolved = resolveOdlPageContent(pageNumber, odl)
  if (resolved.text.trim()) return resolved
  const row = odl.pages.find((page) => page.pageNumber === pageNumber)
  const rowBody = row?.markdown?.trim() || row?.text?.trim() || ''
  if (rowBody) {
    return { ...resolved, text: rowBody, markdown: row?.markdown?.trim() || rowBody }
  }
  if (startPage === endPage && pageNumber === startPage) {
    const blob = pickLongestUsableOdlBody(odl.plainText, odl.markdown)
    if (blob) return { ...resolved, text: blob, markdown: blob, isBlankOrNoise: false }
  }
  return resolved
}

/** Skip OCR backfill only when anomaly interceptor intentionally cleared known noise. */
function shouldSkipOdlPreviewBackfill(resolved: {
  isBlankOrNoise?: boolean
  anomalyReasons?: string[]
}): boolean {
  return Boolean(resolved.isBlankOrNoise && (resolved.anomalyReasons?.length ?? 0) > 0)
}

type HybridBackfillAttempt =
  | { kind: 'ok'; result: DocumentParseResult }
  | { kind: 'unreachable'; url: string }
  | { kind: 'disabled' }

/** Full-document ODL via hybrid server — produces markdown for scanned PDFs when the server is up. */
async function tryHybridOdlDocumentBackfill(
  request: PdfDocumentParseRequest,
  timeoutMs: number,
): Promise<HybridBackfillAttempt> {
  const hybridSettings = resolveOdlHybridSettings()
  if (!hybridSettings.enabled) return { kind: 'disabled' }
  const url = hybridSettings.url.trim()
  if (!(await isHybridServerAvailable(url))) return { kind: 'unreachable', url }
  const hybrid = await runOdlHybridParseWithFallback(
    { filePath: request.filePath, profile: 'translation' },
    timeoutMs,
    hybridSettings,
  )
  if (!hybrid) return { kind: 'disabled' }
  odlPreviewDocumentCache.set(odlPreviewDocumentKey(request.filePath), hybrid)
  return { kind: 'ok', result: hybrid }
}

function buildOdlPreviewPagesFromDocument(
  odl: DocumentParseResult,
  startPage: number,
  endPage: number,
): { pages: PdfPageText[]; needsBackfill: number[] } {
  const pages: PdfPageText[] = []
  const needsBackfill: number[] = []
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    const resolved = resolveOdlPreviewPageContent(pageNumber, odl, startPage, endPage)
    const markdown = resolved.text
    const text = htmlToPlainText(resolved.text)
    if (!odlPageBodyPreviewable(text, markdown) && !shouldSkipOdlPreviewBackfill(resolved)) {
      needsBackfill.push(pageNumber)
    }
    pages.push({
      pageNumber,
      text,
      markdown: markdown || text,
      ...(resolved.isBlankOrNoise ? { isBlankOrNoise: true } : {}),
    })
  }
  return { pages, needsBackfill }
}

export async function getOdlPreviewDocument(
  request: PdfDocumentParseRequest,
  timeoutMs: number,
  forceRefresh = false,
): Promise<DocumentParseResult> {
  const cacheKey = odlPreviewDocumentKey(request.filePath)
  if (forceRefresh) odlPreviewDocumentCache.delete(cacheKey)
  const cached = odlPreviewDocumentCache.get(cacheKey)
  if (cached) return cached
  const inflight = odlPreviewDocumentInflight.get(cacheKey)
  if (inflight) return inflight
  const effectiveTimeout = resolveOdlPreviewParseTimeoutMs(timeoutMs)
  const hybridEnabled = resolveOdlHybridSettings().enabled
  const promise = (
    hybridEnabled
      ? parseOdlWithOptionalHybridRetry(
          { filePath: request.filePath, profile: 'translation', password: request.password },
          effectiveTimeout,
        )
      : parseOdlFullDocument(request, timeoutMs)
  )
    .then((result) => {
      const normalized = normalizeOdlDocumentChannels(result)
      odlPreviewDocumentCache.set(cacheKey, normalized)
      odlPreviewDocumentInflight.delete(cacheKey)
      return normalized
    })
    .catch((error) => {
      odlPreviewDocumentInflight.delete(cacheKey)
      throw error
    })
  odlPreviewDocumentInflight.set(cacheKey, promise)
  return promise
}

export async function getOdlPreviewRange(
  request: PdfDocumentParseRequest,
  startPage: number,
  endPage: number,
  timeoutMs: number,
): Promise<DocumentParseResult> {
  const cacheKey = odlPreviewDocumentKey(request.filePath)
  const cached = odlPreviewDocumentCache.get(cacheKey)
  if (cached) return sliceOdlDocumentResult(cached, startPage, endPage)
  const inflight = odlPreviewDocumentInflight.get(cacheKey)
  if (inflight) return sliceOdlDocumentResult(await inflight, startPage, endPage)
  return sliceOdlDocumentResult(await getOdlPreviewDocument(request, timeoutMs), startPage, endPage)
}

async function parseOdlPreviewProgressiveBatch(
  request: PdfDocumentParseRequest,
  startPage: number,
  endPage: number,
  totalPages: number,
  timeoutMs: number,
): Promise<{ odl: DocumentParseResult; meta: OdlPreviewParseMeta }> {
  const pageRange = { start: startPage, end: endPage }
  let rangeResult = normalizeOdlDocumentChannels(
    await parseOdlWithOptionalHybridRetry(
      { filePath: request.filePath, profile: 'translation', password: request.password, pageRange },
      resolveOdlPreviewParseTimeoutMs(timeoutMs),
      { skipLocalWarm: Boolean(request.odlSkipLocalWarm) },
    ),
  )
  rangeResult = renormalizeOdlPageRangeResult(rangeResult, pageRange, totalPages)
  mergeOdlPreviewBatchIntoCache(request.filePath, rangeResult, totalPages)
  return {
    odl: sliceOdlDocumentResult(rangeResult, startPage, endPage),
    meta: { odlScanDetected: odlPreviewScanDetected.has(request.filePath) },
  }
}

/**
 * Translation profile: OpenDataLoader markdown preview (parse button).
 *
 * Progressive (odlProgressiveBatch): Hybrid OCR per page range — merge into cache for IMA-style preview.
 * Full document (fullDocument): one ODL+Hybrid run, slice pages from cache.
 * Phase 2 (odlHybridBackfill): explicit hybrid retry when cache only has local shells.
 * Phase 3 (ocrBackfillOnly): glm-ocr only for pages ODL+Hybrid left empty.
 */
export async function parsePdfDocumentOdlPreview(
  request: PdfDocumentParseRequest,
  timeoutMs: number,
): Promise<DocumentParseResult & OdlPreviewParseMeta> {
  const startPage = request.pageRange?.start ?? 1
  const endPage = request.pageRange?.end ?? startPage
  const fallbackBackend = resolvePdfParserBackend()
  const { filePath } = request
  let meta: OdlPreviewParseMeta = {}
  const [totalPages, pdfMeta] = await Promise.all([
    resolvePdfTotalPages(filePath),
    getPdfMetadata(filePath).catch(() => null),
  ])

  let odl: DocumentParseResult
  if (request.odlHybridBackfill) {
    const attempt = await tryHybridOdlDocumentBackfill(request, timeoutMs)
    if (attempt.kind === 'unreachable') {
      meta = { hybridUnavailable: true, hybridUnavailableUrl: attempt.url }
      odl = { ...emptyOdlResult(), totalPages }
    } else if (attempt.kind === 'ok') {
      odl = request.fullDocument
        ? attempt.result
        : sliceOdlDocumentResult(attempt.result, startPage, endPage)
    } else {
      const cached = odlPreviewDocumentCache.get(odlPreviewDocumentKey(filePath))
      odl = cached
        ? request.fullDocument
          ? cached
          : sliceOdlDocumentResult(cached, startPage, endPage)
        : { ...emptyOdlResult(), totalPages }
    }
  } else if (request.ocrBackfillOnly) {
    const cached = odlPreviewDocumentCache.get(odlPreviewDocumentKey(filePath))
    odl = cached
      ? sliceOdlDocumentResult(cached, startPage, endPage)
      : { ...emptyOdlResult(), totalPages }
  } else if (request.odlWarmOnly) {
    const local = await parseOdlFullDocument(request, timeoutMs)
    odl = request.fullDocument ? local : sliceOdlDocumentResult(local, startPage, endPage)
  } else if (request.odlProgressiveBatch) {
    const progressive = await parseOdlPreviewProgressiveBatch(
      request,
      startPage,
      endPage,
      totalPages,
      timeoutMs,
    )
    odl = progressive.odl
    meta = { ...meta, ...progressive.meta }
  } else if (request.fullDocument) {
    odl = await getOdlPreviewDocument(request, timeoutMs, Boolean(request.odlPreviewReset))
  } else {
    odl = await getOdlPreviewRange(request, startPage, endPage, timeoutMs)
  }

  const { pages, needsBackfill } = buildOdlPreviewPagesFromDocument(odl, startPage, endPage)
  if (!request.odlHybridBackfill && request.ocrBackfillOnly && needsBackfill.length > 0) {
    await backfillOdlPreviewPages(request, pages, needsBackfill, fallbackBackend, timeoutMs)
  }
  return {
    backend: 'opendataloader',
    totalPages,
    plainText: pages.map((page) => page.text).join('\n\n').trim(),
    markdown: pages.map((page) => page.markdown ?? page.text).join('\n\n').trim(),
    pages,
    pageWidth: pdfMeta?.pageWidth,
    pageHeight: pdfMeta?.pageHeight,
    ...meta,
  }
}

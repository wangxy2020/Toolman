import { extname } from 'node:path'
import {
  extractPdfDocumentInfo,
  formatPdfPageMarker,
  guardOdlDocumentPages,
  splitPdfPagesByMarkers,
} from '@toolman/knowledge'
import {
  parsePdfWithOpenDataLoader,
  type DocumentParseRequest,
  type DocumentParseResult,
  type OdlHybridConfig,
} from '@toolman/opendataloader'
import type { PdfParserBackend } from '@toolman/shared'
import { withTimeout } from '../utils/async-timeout'
import { resolveOdlHybridSettings, resolvePdfParserBackend } from './runtime-app-settings.service'
import { isHybridServerReachable, clearHybridServerProbeCache } from './hybrid-server-probe'
import { ensureOdlHybridServerRunning } from './odl-hybrid-server-manager.service'
import type { PdfDocumentParseRequest } from './document-parser.service'

export const DEFAULT_ODL_TIMEOUT_MS = 5 * 60 * 1000
/** Full-document ODL + Hybrid OCR for scanned PDFs (translation preview). */
export const ODL_HYBRID_PARSE_TIMEOUT_MS = 45 * 60 * 1000

export type OdlParseRequest = Pick<
  DocumentParseRequest,
  'filePath' | 'profile' | 'password' | 'pageRange' | 'convertOverrides'
>

/** Full-document OpenDataLoader preview cache — one JVM per file per session. */
export const odlPreviewDocumentCache = new Map<string, DocumentParseResult>()
export const odlPreviewDocumentInflight = new Map<string, Promise<DocumentParseResult>>()
/** Scanned PDFs (no local text) — skip redundant local warm on progressive batches. */
export const odlPreviewScanDetected = new Set<string>()
/** pdf.js page count — authoritative for translation UI slot count. */
export const pdfMetadataCache = new Map<
  string,
  Awaited<ReturnType<typeof extractPdfDocumentInfo>>
>()

export let hybridUnreachableBackfillLogged = false

export function markHybridUnreachableBackfillLogged(): void {
  hybridUnreachableBackfillLogged = true
}

export function odlPreviewDocumentKey(filePath: string): string {
  return `${filePath}::v7::document`
}

export function peekOdlPreviewDocumentCache(filePath: string): DocumentParseResult | undefined {
  return odlPreviewDocumentCache.get(odlPreviewDocumentKey(filePath))
}

export function normalizeOdlDocumentChannels(result: DocumentParseResult): DocumentParseResult {
  if (result.plainText.trim() && (result.markdown?.trim() ?? result.plainText.trim())) {
    return result
  }
  const segments = result.pages
    .map((page) => {
      const body = page.markdown?.trim() || page.text?.trim() || ''
      if (!body) return ''
      return `${formatPdfPageMarker(page.pageNumber, result.totalPages)}\n${body}`
    })
    .filter(Boolean)
  if (segments.length === 0) return result
  const joined = segments.join('\n\n')
  return {
    ...result,
    plainText: result.plainText.trim() || joined,
    markdown: result.markdown?.trim() || joined,
  }
}

export function mergeOdlPreviewBatchIntoCache(
  filePath: string,
  batch: DocumentParseResult,
  totalPages: number,
): void {
  const key = odlPreviewDocumentKey(filePath)
  const normalized = normalizeOdlDocumentChannels({
    ...batch,
    totalPages: Math.max(batch.totalPages, totalPages),
  })
  const existing = odlPreviewDocumentCache.get(key)
  if (!existing) {
    odlPreviewDocumentCache.set(key, normalized)
    return
  }
  const pageByNumber = new Map(existing.pages.map((page) => [page.pageNumber, page]))
  for (const page of normalized.pages) {
    const text = page.text?.trim() ?? ''
    const markdown = page.markdown?.trim() ?? text
    if (text || markdown) pageByNumber.set(page.pageNumber, page)
  }
  const mergedPages = [...pageByNumber.values()].sort((left, right) => left.pageNumber - right.pageNumber)
  odlPreviewDocumentCache.set(key, {
    backend: 'opendataloader',
    totalPages: Math.max(existing.totalPages, normalized.totalPages, totalPages),
    pages: mergedPages,
    plainText: existing.plainText,
    markdown: existing.markdown,
  })
}

export function clearOdlPreviewCache(filePath?: string): void {
  hybridUnreachableBackfillLogged = false
  clearHybridServerProbeCache()
  if (!filePath) {
    odlPreviewDocumentCache.clear()
    odlPreviewDocumentInflight.clear()
    odlPreviewScanDetected.clear()
    pdfMetadataCache.clear()
    return
  }
  odlPreviewDocumentCache.delete(odlPreviewDocumentKey(filePath))
  odlPreviewScanDetected.delete(filePath)
  // Keep inflight — concurrent parse requests must coalesce on the same ODL+Hybrid run.
  pdfMetadataCache.delete(filePath)
}

export function sliceOdlDocumentResult(
  document: DocumentParseResult,
  startPage: number,
  endPage: number,
): DocumentParseResult {
  const totalPages = document.totalPages
  const pages = document.pages
    .filter((page) => page.pageNumber >= startPage && page.pageNumber <= endPage)
    .sort((left, right) => left.pageNumber - right.pageNumber)
  const plainParts = splitPdfPagesByMarkers(document.plainText).filter(
    (page) => page.pageNumber >= startPage && page.pageNumber <= endPage,
  )
  const markdownParts = splitPdfPagesByMarkers(document.markdown).filter(
    (page) => page.pageNumber >= startPage && page.pageNumber <= endPage,
  )
  const plainText =
    plainParts.length > 0
      ? plainParts
          .map((page) => `${formatPdfPageMarker(page.pageNumber, totalPages)}\n${page.text}`)
          .join('\n\n')
          .trim()
      : pages
          .map((page) => `${formatPdfPageMarker(page.pageNumber, totalPages)}\n${page.text}`)
          .join('\n\n')
          .trim()
  const markdown =
    markdownParts.length > 0
      ? markdownParts.map((page) => page.text).join('\n\n').trim()
      : pages.map((page) => page.markdown ?? page.text).join('\n\n').trim()
  return { ...document, pages, plainText, markdown, totalPages }
}

/**
 * ODL page-range extracts often emit markers 1..N for the slice — remap to absolute PDF page numbers.
 */
export function renormalizeOdlPageRangeResult(
  result: DocumentParseResult,
  pageRange: { start: number; end: number },
  pdfTotalPages: number,
): DocumentParseResult {
  const { start, end } = pageRange
  const span = end - start + 1
  if (result.pages.length === 0) return { ...result, totalPages: pdfTotalPages }
  const pageNumbers = result.pages.map((page) => page.pageNumber)
  const minPage = Math.min(...pageNumbers)
  const maxPage = Math.max(...pageNumbers)
  const inAbsoluteRange =
    minPage >= start && maxPage <= end && result.pages.every((page) => page.pageNumber >= start)
  if (inAbsoluteRange) return { ...result, totalPages: pdfTotalPages }
  if (maxPage <= span && minPage >= 1) {
    return normalizeOdlDocumentChannels({
      ...result,
      pages: result.pages.map((page) => ({ ...page, pageNumber: start + page.pageNumber - 1 })),
      totalPages: pdfTotalPages,
    })
  }
  return { ...result, totalPages: pdfTotalPages }
}

/** Apply OCR-noise guard synchronously — no per-page ODL re-parse (each re-parse spawns a JVM). */
export function applyOdlDocumentGuard(result: DocumentParseResult): DocumentParseResult {
  const guarded = guardOdlDocumentPages({
    pages: result.pages,
    plainText: result.plainText,
    markdown: result.markdown,
    totalPages: result.totalPages,
  })
  const guardedByPage = new Map(guarded.map((page) => [page.pageNumber, page]))
  const totalPages = Math.max(
    result.totalPages,
    ...guarded.map((page) => page.pageNumber),
    ...result.pages.map((page) => page.pageNumber),
    0,
  )
  const pageNumbers = new Set([
    ...result.pages.map((page) => page.pageNumber),
    ...guarded.map((page) => page.pageNumber),
  ])
  const pages = [...pageNumbers]
    .sort((left, right) => left - right)
    .map((pageNumber) => {
      const original = result.pages.find((page) => page.pageNumber === pageNumber)
      const resolved = guardedByPage.get(pageNumber)
      const guardedText = resolved?.text?.trim() ?? ''
      const originalText = original?.text?.trim() ?? ''
      const text = resolved?.isBlankOrNoise ? guardedText : guardedText || originalText
      const markdown = resolved?.isBlankOrNoise
        ? resolved.markdown?.trim() ?? guardedText
        : resolved?.markdown?.trim() || original?.markdown?.trim() || text
      if (!text) return null
      return { pageNumber, text, markdown: markdown || text }
    })
    .filter((page): page is { pageNumber: number; text: string; markdown: string } => page !== null)
  return { ...result, pages, plainText: result.plainText, markdown: result.markdown, totalPages }
}

export async function getPdfMetadata(filePath: string) {
  const cached = pdfMetadataCache.get(filePath)
  if (cached) return cached
  const info = await extractPdfDocumentInfo(filePath)
  pdfMetadataCache.set(filePath, info)
  return info
}

export async function resolvePdfTotalPages(filePath: string, fallback = 1): Promise<number> {
  try {
    const info = await getPdfMetadata(filePath)
    return Math.max(1, info.totalPages || fallback)
  } catch {
    return Math.max(1, fallback)
  }
}

export async function isHybridServerAvailable(url: string): Promise<boolean> {
  if (await isHybridServerReachable(url, undefined, { bypassCache: true })) return true
  if (!resolveOdlHybridSettings().enabled) return false
  return ensureOdlHybridServerRunning(url)
}

export function resolveOdlPreviewParseTimeoutMs(timeoutMs: number): number {
  if (!resolveOdlHybridSettings().enabled) return timeoutMs
  return Math.max(timeoutMs, ODL_HYBRID_PARSE_TIMEOUT_MS)
}

export async function runOdlParse(
  request: OdlParseRequest,
  timeoutMs: number,
  odlHybrid?: OdlHybridConfig,
): Promise<DocumentParseResult> {
  const result = await withTimeout(
    parsePdfWithOpenDataLoader({ ...request, odlHybrid }, { timeoutMs }),
    timeoutMs,
    'OpenDataLoader 解析超时',
  )
  return applyOdlDocumentGuard(result)
}

/** Full-document ODL warm — local JVM only when Hybrid OCR is off. */
export async function parseOdlFullDocument(
  request: PdfDocumentParseRequest,
  timeoutMs: number,
): Promise<DocumentParseResult> {
  return runOdlParse(
    { filePath: request.filePath, profile: 'translation', password: request.password },
    timeoutMs,
  )
}

export function isPdfFilePath(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.pdf'
}

export function shouldUseOpenDataLoaderForPdf(
  filePath: string,
  backend: PdfParserBackend = resolvePdfParserBackend(),
): boolean {
  if (!isPdfFilePath(filePath)) return false
  if (backend === 'opendataloader') return true
  return resolveOdlHybridSettings().enabled
}

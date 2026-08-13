import { basename, extname } from 'node:path'
import {
  defaultTitle,
  extractPdfPlainText,
  extractPdfDocumentInfo,
  extractPdfPageTexts,
  formatPdfPageMarker,
  guardOdlDocumentPages,
  isPdfExtractedTextInsufficient,
  isPdfPageMarkerOnly,
  mimeTypeForKind,
  parseFile,
  pickLongestUsableOdlBody,
  resolveOdlPageContent,
  splitPdfPagesByMarkers,
  type ParsedDocument,
  type ParseFileOptions,
  type PdfPageText,
} from '@toolman/knowledge'
import {
  parsePdfWithOpenDataLoader,
  type DocumentParseProfile,
  type DocumentParseRequest,
  type DocumentParseResult,
  type OdlHybridConfig,
} from '@toolman/opendataloader'
import type { OdlHybridBackend, OdlHybridSettings, PdfParserBackend } from '@toolman/shared'
import { stripOcrCollapsedContent } from '@toolman/shared'
import { buildChatParseOptions } from './chat-parse-options.service'
import { buildChatPdfOcrOptions, buildKnowledgeParseOptions } from './knowledge-parse-options.service'
import { isDocumentOcrEnabled, resolveOdlHybridSettings, resolvePdfParserBackend, toOdlHybridParseConfig } from './runtime-app-settings.service'
import { clearHybridServerProbeCache, isHybridServerReachable } from './hybrid-server-probe'
import { ensureOdlHybridServerRunning } from './odl-hybrid-server-manager.service'
import { assertIngestNotCancelled } from './knowledge-ingest-manager.service'
import { withTimeout } from '../utils/async-timeout'
import { logStructured } from './structured-log.service'

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

const DEFAULT_ODL_TIMEOUT_MS = 5 * 60 * 1000
/** Full-document ODL + Hybrid OCR for scanned PDFs (translation preview). */
const ODL_HYBRID_PARSE_TIMEOUT_MS = 45 * 60 * 1000
/** Knowledge ingest Hybrid OCR pages per JVM batch (progress + cancel granularity). */
const KNOWLEDGE_HYBRID_BATCH_SIZE = 16
/** Floor / ceiling for each knowledge Hybrid batch. */
const KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MIN_MS = 3 * 60 * 1000
const KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MAX_MS = 15 * 60 * 1000
/** Parallel vision-OCR pages per backfill wave (Ollama glm-ocr). */
const ODL_PREVIEW_OCR_CONCURRENCY = 2

async function isHybridServerAvailable(url: string): Promise<boolean> {
  if (await isHybridServerReachable(url, undefined, { bypassCache: true })) {
    return true
  }
  if (!resolveOdlHybridSettings().enabled) return false
  return ensureOdlHybridServerRunning(url)
}

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

/** Apply OCR-noise guard synchronously — no per-page ODL re-parse (each re-parse spawns a JVM). */
function applyOdlDocumentGuard(result: DocumentParseResult): DocumentParseResult {
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

  // Keep original plainText/markdown channels — resolveOdlPageContent reads all sources.
  // Rebuilding from guarded pages alone drops bodies when intercept clears a page.
  return {
    ...result,
    pages,
    plainText: result.plainText,
    markdown: result.markdown,
    totalPages,
  }
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

  return {
    ...document,
    pages,
    plainText,
    markdown,
    totalPages,
  }
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
  if (result.pages.length === 0) {
    return { ...result, totalPages: pdfTotalPages }
  }

  const pageNumbers = result.pages.map((page) => page.pageNumber)
  const minPage = Math.min(...pageNumbers)
  const maxPage = Math.max(...pageNumbers)
  const inAbsoluteRange =
    minPage >= start && maxPage <= end && result.pages.every((page) => page.pageNumber >= start)

  if (inAbsoluteRange) {
    return { ...result, totalPages: pdfTotalPages }
  }

  if (maxPage <= span && minPage >= 1) {
    const pages = result.pages.map((page) => ({
      ...page,
      pageNumber: start + page.pageNumber - 1,
    }))
    return normalizeOdlDocumentChannels({
      ...result,
      pages,
      totalPages: pdfTotalPages,
    })
  }

  return { ...result, totalPages: pdfTotalPages }
}

function resolveOdlPreviewParseTimeoutMs(timeoutMs: number): number {
  if (!resolveOdlHybridSettings().enabled) return timeoutMs
  return Math.max(timeoutMs, ODL_HYBRID_PARSE_TIMEOUT_MS)
}

/** Full-document ODL warm — local JVM only when Hybrid OCR is off. */
async function parseOdlFullDocument(
  request: PdfDocumentParseRequest,
  timeoutMs: number,
): Promise<DocumentParseResult> {
  return runOdlParse(
    {
      filePath: request.filePath,
      profile: 'translation',
      password: request.password,
    },
    timeoutMs,
  )
}

type OdlParseRequest = Pick<
  DocumentParseRequest,
  'filePath' | 'profile' | 'password' | 'pageRange' | 'convertOverrides'
>

async function runOdlParse(
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

function hybridBackendAttempts(settings: OdlHybridSettings): OdlHybridBackend[] {
  const ordered: OdlHybridBackend[] = ['docling-fast']
  if (settings.backend !== 'docling-fast') {
    ordered.push(settings.backend)
  }
  return ordered
}

/** Try configured hybrid backend, then docling-fast when hancom-ai fails (common local setup). */
async function runOdlHybridParseWithFallback(
  request: OdlParseRequest,
  timeoutMs: number,
  settings: OdlHybridSettings,
): Promise<DocumentParseResult | null> {
  for (const backend of hybridBackendAttempts(settings)) {
    try {
      const hybrid = normalizeOdlDocumentChannels(
        await runOdlParse(
          request,
          timeoutMs,
          {
            ...toOdlHybridParseConfig({ ...settings, backend }),
            timeoutMs,
          },
        ),
      )
      const rawNonEmpty = hybrid.pages.filter(
        (page) => page.text?.trim() || page.markdown?.trim(),
      ).length
      if (!isOdlIngestResultInsufficient(hybrid) || rawNonEmpty > 0) {
        let accepted = hybrid
        if (request.pageRange && rawNonEmpty > 0) {
          const pdfTotal = await resolvePdfTotalPages(request.filePath, hybrid.totalPages)
          accepted = renormalizeOdlPageRangeResult(hybrid, request.pageRange, pdfTotal)
        }
        return accepted
      }
    } catch {
      // Try the next hybrid backend.
    }
  }
  return null
}

/**
 * Local ODL first (fast). When hybrid is enabled and text is insufficient, retry via hybrid server.
 * Returns the best result; caller may still fall back to vision OCR.
 */
async function parseOdlWithOptionalHybridRetry(
  request: OdlParseRequest,
  timeoutMs: number,
  options?: { skipLocalWarm?: boolean; skipHybrid?: boolean },
): Promise<DocumentParseResult> {
  let local: DocumentParseResult | null = null

  if (!options?.skipLocalWarm) {
    local = await runOdlParse(request, timeoutMs)
    if (!isOdlIngestResultInsufficient(local)) {
      return local
    }
    odlPreviewScanDetected.add(request.filePath)
  } else {
    odlPreviewScanDetected.add(request.filePath)
  }

  // Optional bypass for callers that want local JVM text only (not used by knowledge ingest).
  if (options?.skipHybrid) {
    return (
      local ?? {
        backend: 'opendataloader',
        totalPages: 1,
        plainText: '',
        markdown: '',
        pages: [],
      }
    )
  }

  const hybridSettings = resolveOdlHybridSettings()
  if (!hybridSettings.enabled) {
    return (
      local ?? {
        backend: 'opendataloader',
        totalPages: 1,
        plainText: '',
        markdown: '',
        pages: [],
      }
    )
  }

  const hybridUrl = hybridSettings.url.trim()
  if (!(await isHybridServerAvailable(hybridUrl))) {
    return (
      local ?? {
        backend: 'opendataloader',
        totalPages: 1,
        plainText: '',
        markdown: '',
        pages: [],
      }
    )
  }

  const hybrid = await runOdlHybridParseWithFallback(request, timeoutMs, hybridSettings)
  if (hybrid) {
    return hybrid
  }
  return (
    local ?? {
      backend: 'opendataloader',
      totalPages: 1,
      plainText: '',
      markdown: '',
      pages: [],
    }
  )
}

export function peekOdlPreviewDocumentCache(filePath: string): DocumentParseResult | undefined {
  return odlPreviewDocumentCache.get(odlPreviewDocumentKey(filePath))
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
    if (text || markdown) {
      pageByNumber.set(page.pageNumber, page)
    }
  }

  const mergedPages = [...pageByNumber.values()].sort((left, right) => left.pageNumber - right.pageNumber)
  const mergedTotal = Math.max(existing.totalPages, normalized.totalPages, totalPages)
  odlPreviewDocumentCache.set(key, {
    backend: 'opendataloader',
    totalPages: mergedTotal,
    pages: mergedPages,
    plainText: existing.plainText,
    markdown: existing.markdown,
  })
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
      {
        filePath: request.filePath,
        profile: 'translation',
        password: request.password,
        pageRange,
      },
      resolveOdlPreviewParseTimeoutMs(timeoutMs),
      { skipLocalWarm: Boolean(request.odlSkipLocalWarm) },
    ),
  )
  rangeResult = renormalizeOdlPageRangeResult(rangeResult, pageRange, totalPages)
  mergeOdlPreviewBatchIntoCache(request.filePath, rangeResult, totalPages)
  return {
    odl: sliceOdlDocumentResult(rangeResult, startPage, endPage),
    meta: {
      odlScanDetected: odlPreviewScanDetected.has(request.filePath),
    },
  }
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

/** Full-document OpenDataLoader preview cache — one JVM per file per session. */
const odlPreviewDocumentCache = new Map<string, DocumentParseResult>()
const odlPreviewDocumentInflight = new Map<string, Promise<DocumentParseResult>>()
/** Scanned PDFs (no local text) — skip redundant local warm on progressive batches. */
const odlPreviewScanDetected = new Set<string>()

/** pdf.js page count — authoritative for translation UI slot count. */
const pdfMetadataCache = new Map<
  string,
  Awaited<ReturnType<typeof extractPdfDocumentInfo>>
>()

function odlPreviewDocumentKey(filePath: string): string {
  return `${filePath}::v7::document`
}

function resolveOdlPreviewPageContent(
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
    return {
      ...resolved,
      text: rowBody,
      markdown: row?.markdown?.trim() || rowBody,
    }
  }

  if (startPage === endPage && pageNumber === startPage) {
    const blob = pickLongestUsableOdlBody(odl.plainText, odl.markdown)
    if (blob) {
      return {
        ...resolved,
        text: blob,
        markdown: blob,
        isBlankOrNoise: false,
      }
    }
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
  if (!(await isHybridServerAvailable(url))) {
    return { kind: 'unreachable', url }
  }

  const hybrid = await runOdlHybridParseWithFallback(
    {
      filePath: request.filePath,
      profile: 'translation',
    },
    timeoutMs,
    hybridSettings,
  )
  if (!hybrid) {
    return { kind: 'disabled' }
  }

  odlPreviewDocumentCache.set(odlPreviewDocumentKey(request.filePath), hybrid)
  return { kind: 'ok', result: hybrid }
}

function shouldAllowVisionOcrFallback(): boolean {
  return isDocumentOcrEnabled()
}

let hybridUnreachableBackfillLogged = false

async function backfillOdlPreviewPages(
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
    if (!hybridUnreachableBackfillLogged) {
      hybridUnreachableBackfillLogged = true
    }
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
        const rawText = row?.text.trim() ?? ''
        const text = stripOcrCollapsedContent(rawText)
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

async function getPdfMetadata(filePath: string) {
  const cached = pdfMetadataCache.get(filePath)
  if (cached) return cached
  const info = await extractPdfDocumentInfo(filePath)
  pdfMetadataCache.set(filePath, info)
  return info
}

async function resolvePdfTotalPages(filePath: string, fallback = 1): Promise<number> {
  try {
    const info = await getPdfMetadata(filePath)
    return Math.max(1, info.totalPages || fallback)
  } catch {
    return Math.max(1, fallback)
  }
}

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

export function isPdfFilePath(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.pdf'
}

export function shouldUseOpenDataLoaderForPdf(
  filePath: string,
  backend: PdfParserBackend = resolvePdfParserBackend(),
): boolean {
  if (!isPdfFilePath(filePath)) return false
  if (backend === 'opendataloader') return true
  // Hybrid OCR only runs through the OpenDataLoader pipeline (local JVM + hybrid server).
  return resolveOdlHybridSettings().enabled
}

export async function parsePdfDocument(
  request: PdfDocumentParseRequest,
  backend: PdfParserBackend = resolvePdfParserBackend(),
): Promise<DocumentParseResult> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_ODL_TIMEOUT_MS

  // Page count / dimensions: always use pdf.js metadata (ODL metadata profile only reads page 1).
  if (request.profile === 'metadata') {
    return parsePdfDocumentBuiltin(request)
  }

  if (request.profile === 'translation') {
    if (request.odlPreviewOnly) {
      return parsePdfDocumentOdlPreview(request, timeoutMs)
    }
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

export async function parseIngestDocumentFile(options: {
  filePath: string
  workspaceId: string
  kbId: string
  parseOptions: ParseFileOptions
  parseTimeoutMs: number
}): Promise<ParsedDocument> {
  const odl = await tryParseIngestWithOdl(options)
  if (odl) return odl
  return parseFile(options.filePath, options.parseOptions)
}

/**
 * Scanned knowledge PDFs: Hybrid OCR in page batches so UI progress moves and cancel works.
 * Digital PDFs never reach this path (local ODL already returned usable text).
 */
async function parseKnowledgeIngestHybridBatches(options: {
  filePath: string
  parseTimeoutMs: number
  documentId?: string
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
}): Promise<DocumentParseResult | null> {
  const { filePath, parseTimeoutMs, documentId, onParseProgress } = options
  const settings = resolveOdlHybridSettings()
  if (!settings.enabled) return null

  const hybridUrl = settings.url.trim()
  if (!(await isHybridServerAvailable(hybridUrl))) {
    logStructured(
      'knowledge-ingest',
      'warn',
      `ODL Hybrid server unavailable at ${hybridUrl || '(empty url)'}; skipping Hybrid`,
    )
    return null
  }

  const totalPages = await resolvePdfTotalPages(filePath)
  const batchCount = Math.max(1, Math.ceil(totalPages / KNOWLEDGE_HYBRID_BATCH_SIZE))
  const batchTimeoutMs = Math.min(
    KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MAX_MS,
    Math.max(
      KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MIN_MS,
      Math.floor(parseTimeoutMs / batchCount),
    ),
  )

  logStructured(
    'knowledge-ingest',
    'info',
    `ODL+Hybrid batch OCR for ${basename(filePath)} (${totalPages} pages, batch=${KNOWLEDGE_HYBRID_BATCH_SIZE})`,
  )
  onParseProgress?.(0, totalPages, true)

  const pageByNumber = new Map<number, DocumentParseResult['pages'][number]>()
  for (let start = 1; start <= totalPages; start += KNOWLEDGE_HYBRID_BATCH_SIZE) {
    if (documentId) assertIngestNotCancelled(documentId)
    const end = Math.min(totalPages, start + KNOWLEDGE_HYBRID_BATCH_SIZE - 1)
    onParseProgress?.(start - 1, totalPages, true)

    const batch = await runOdlHybridParseWithFallback(
      {
        filePath,
        profile: 'knowledge',
        pageRange: { start, end },
      },
      batchTimeoutMs,
      settings,
    )
    if (batch) {
      const normalized = renormalizeOdlPageRangeResult(batch, { start, end }, totalPages)
      for (const page of normalized.pages) {
        const text = page.text?.trim() ?? ''
        const markdown = page.markdown?.trim() ?? text
        if (text || markdown) {
          pageByNumber.set(page.pageNumber, page)
        }
      }
    } else {
      logStructured(
        'knowledge-ingest',
        'warn',
        `ODL+Hybrid batch ${start}-${end}/${totalPages} returned no usable text`,
      )
    }

    onParseProgress?.(end, totalPages, false)
    logStructured(
      'knowledge-ingest',
      'info',
      `ODL+Hybrid batch ${end}/${totalPages} for ${basename(filePath)} (${pageByNumber.size} pages with text)`,
    )
  }

  if (pageByNumber.size === 0) return null

  return normalizeOdlDocumentChannels({
    backend: 'opendataloader',
    totalPages,
    pages: [...pageByNumber.values()].sort((left, right) => left.pageNumber - right.pageNumber),
    plainText: '',
    markdown: '',
  })
}

/**
 * Knowledge ingest primary path: ODL local → ODL Hybrid batches (when enabled).
 * Returns null only when ODL/Hybrid is insufficient or failed — caller then uses
 * glm-ocr, and only after that other vision models.
 */
export async function tryParseIngestWithOdl(options: {
  filePath: string
  workspaceId: string
  kbId: string
  parseTimeoutMs: number
  documentId?: string
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
}): Promise<ParsedDocument | null> {
  const { filePath, parseTimeoutMs, documentId, onParseProgress } = options
  if (!shouldUseOpenDataLoaderForPdf(filePath)) return null

  const hybridEnabled = resolveOdlHybridSettings().enabled
  logStructured(
    'knowledge-ingest',
    'info',
    `ODL${hybridEnabled ? '+Hybrid' : ''} parsing ${basename(filePath)}`,
  )

  try {
    // Local JVM first — digital PDFs finish here without Hybrid.
    const local = await parseOdlWithOptionalHybridRetry(
      {
        filePath,
        profile: 'knowledge',
      },
      Math.min(parseTimeoutMs, DEFAULT_ODL_TIMEOUT_MS),
      { skipHybrid: true },
    )
    if (local.plainText.trim() && !isOdlIngestResultInsufficient(local)) {
      logStructured(
        'knowledge-ingest',
        'info',
        `ODL succeeded for ${basename(filePath)} (${local.totalPages} pages)`,
      )
      return toParsedDocument(filePath, local.plainText)
    }

    if (!hybridEnabled) {
      logStructured(
        'knowledge-ingest',
        'info',
        `ODL text insufficient for ${basename(filePath)}; falling back to glm-ocr`,
      )
      return null
    }

    const hybrid = await parseKnowledgeIngestHybridBatches({
      filePath,
      parseTimeoutMs,
      documentId,
      onParseProgress,
    })
    if (hybrid?.plainText.trim() && !isOdlIngestResultInsufficient(hybrid)) {
      logStructured(
        'knowledge-ingest',
        'info',
        `ODL+Hybrid succeeded for ${basename(filePath)} (${hybrid.totalPages} pages)`,
      )
      return toParsedDocument(filePath, hybrid.plainText)
    }
    logStructured(
      'knowledge-ingest',
      'info',
      `ODL+Hybrid text insufficient for ${basename(filePath)}; falling back to glm-ocr`,
    )
  } catch (error) {
    logStructured(
      'knowledge-ingest',
      'warn',
      `ODL${hybridEnabled ? '+Hybrid' : ''} failed for ${basename(filePath)}`,
      { error: error instanceof Error ? error.message : String(error) },
    )
  }
  return null
}

export async function parseChatPdfAttachment(options: {
  filePath: string
  workspaceId: string
  documentOcrEnabled?: boolean
  timeoutMs?: number
}): Promise<{ plainText: string; totalPages: number; backend: PdfParserBackend }> {
  const { filePath, workspaceId, documentOcrEnabled, timeoutMs = CHAT_PDF_TIMEOUT_MS } = options

  if (shouldUseOpenDataLoaderForPdf(filePath)) {
    const result = await parsePdfDocument(
      {
        filePath,
        profile: 'chat',
        workspaceId,
        documentOcrEnabled,
        timeoutMs,
      },
      'opendataloader',
    )
    return {
      plainText: result.plainText,
      totalPages: Math.max(1, result.totalPages),
      backend: result.backend,
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

const CHAT_PDF_TIMEOUT_MS = 3 * 60 * 1000

function toParsedDocument(filePath: string, plainText: string): ParsedDocument {
  return {
    title: defaultTitle(filePath),
    plainText,
    mimeType: mimeTypeForKind('pdf', filePath),
    kind: 'pdf',
  }
}

/** ODL may return page-marker shells for scanned PDFs — must not skip OCR backfill. */
function countUsableOdlPages(result: DocumentParseResult): number {
  return result.pages.filter((page) => {
    const text = page.text?.trim() ?? ''
    const markdown = page.markdown?.trim() ?? page.text?.trim() ?? ''
    return odlPageBodyDisplayable(text, markdown)
  }).length
}

function normalizeOdlDocumentChannels(result: DocumentParseResult): DocumentParseResult {
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

function isOdlIngestResultInsufficient(result: DocumentParseResult): boolean {
  if (countUsableOdlPages(result) > 0) return false

  const body = pickLongestUsableOdlBody(result.plainText, result.markdown)
  if (!body.trim()) return true
  const pageCount = Math.max(
    result.totalPages,
    result.pages.length,
    splitPdfPagesByMarkers(result.plainText).length,
    1,
  )
  return isPdfExtractedTextInsufficient(body, pageCount)
}

function buildDocumentParseResultFromPlainText(
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
  for (const page of extracted.pages) {
    texts.set(page.pageNumber, page.text)
  }
  return {
    texts,
    totalPages: extracted.totalPages,
    pageWidth: extracted.pageWidth,
    pageHeight: extracted.pageHeight,
  }
}

/** Plain text for LLM translation — strips markers and HTML noise. */
function htmlToPlainText(raw: string): string {
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

function odlPageBodyPreviewable(text: string, markdown: string): boolean {
  if (odlPageBodyDisplayable(text, markdown)) return true
  const md = markdown.trim()
  const plain = text.trim() || htmlToPlainText(md).trim()
  if (md && !isPdfPageMarkerOnly(md)) return true
  if (plain && !isPdfPageMarkerOnly(plain)) return true
  return false
}

function odlPageBodyDisplayable(text: string, markdown: string): boolean {
  const plain = text.trim() || htmlToPlainText(markdown).trim()
  const body = plain || markdown.trim()
  if (!body || isPdfPageMarkerOnly(body)) return false
  if (/<[a-z][\s\S]*>/i.test(markdown) && markdown.trim().length >= 24) return true
  return !isPdfExtractedTextInsufficient(body, 1)
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
    if (
      !odlPageBodyPreviewable(text, markdown) &&
      !shouldSkipOdlPreviewBackfill(resolved)
    ) {
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

async function getOdlPreviewDocument(
  request: PdfDocumentParseRequest,
  timeoutMs: number,
  forceRefresh = false,
): Promise<DocumentParseResult> {
  const { filePath } = request
  const cacheKey = odlPreviewDocumentKey(filePath)

  if (forceRefresh) {
    odlPreviewDocumentCache.delete(cacheKey)
  }

  const cached = odlPreviewDocumentCache.get(cacheKey)
  if (cached) return cached

  const inflight = odlPreviewDocumentInflight.get(cacheKey)
  if (inflight) return inflight

  const effectiveTimeout = resolveOdlPreviewParseTimeoutMs(timeoutMs)
  const hybridEnabled = resolveOdlHybridSettings().enabled
  const promise = (
    hybridEnabled
      ? parseOdlWithOptionalHybridRetry(
          {
            filePath: request.filePath,
            profile: 'translation',
            password: request.password,
          },
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

async function getOdlPreviewRange(
  request: PdfDocumentParseRequest,
  startPage: number,
  endPage: number,
  timeoutMs: number,
): Promise<DocumentParseResult> {
  const cacheKey = odlPreviewDocumentKey(request.filePath)
  const cached = odlPreviewDocumentCache.get(cacheKey)
  if (cached) {
    return sliceOdlDocumentResult(cached, startPage, endPage)
  }

  const inflight = odlPreviewDocumentInflight.get(cacheKey)
  if (inflight) {
    const full = await inflight
    return sliceOdlDocumentResult(full, startPage, endPage)
  }

  const full = await getOdlPreviewDocument(request, timeoutMs)
  return sliceOdlDocumentResult(full, startPage, endPage)
}

/**
 * Translation profile: OpenDataLoader markdown preview (parse button).
 *
 * Progressive (odlProgressiveBatch): Hybrid OCR per page range — merge into cache for IMA-style preview.
 * Full document (fullDocument): one ODL+Hybrid run, slice pages from cache.
 * Phase 2 (odlHybridBackfill): explicit hybrid retry when cache only has local shells.
 * Phase 3 (ocrBackfillOnly): glm-ocr only for pages ODL+Hybrid left empty.
 */
async function parsePdfDocumentOdlPreview(
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
      odl = {
        backend: 'opendataloader',
        totalPages,
        plainText: '',
        markdown: '',
        pages: [],
      }
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
        : {
            backend: 'opendataloader',
            totalPages,
            plainText: '',
            markdown: '',
            pages: [],
          }
    }
  } else if (request.ocrBackfillOnly) {
    const cached = odlPreviewDocumentCache.get(odlPreviewDocumentKey(filePath))
    if (!cached) {
      odl = {
        backend: 'opendataloader',
        totalPages,
        plainText: '',
        markdown: '',
        pages: [],
      }
    } else {
      odl = sliceOdlDocumentResult(cached, startPage, endPage)
    }
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
    const full = await getOdlPreviewDocument(request, timeoutMs, Boolean(request.odlPreviewReset))
    odl = full
  } else {
    const ranged = await getOdlPreviewRange(request, startPage, endPage, timeoutMs)
    odl = ranged
  }

  const { pages, needsBackfill } = buildOdlPreviewPagesFromDocument(odl, startPage, endPage)

  if (!request.odlHybridBackfill && request.ocrBackfillOnly && needsBackfill.length > 0) {
    await backfillOdlPreviewPages(request, pages, needsBackfill, fallbackBackend, timeoutMs)
  }

  const plainText = pages.map((page) => page.text).join('\n\n').trim()
  const markdown = pages.map((page) => page.markdown ?? page.text).join('\n\n').trim()
  return {
    backend: 'opendataloader',
    totalPages,
    plainText,
    markdown,
    pages,
    pageWidth: pdfMeta?.pageWidth,
    pageHeight: pdfMeta?.pageHeight,
    ...meta,
  }
}

/**
 * Translation profile: translation-settings backend → app document-processing backend → OCR.
 */
async function parsePdfDocumentTranslation(
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
    if (isUsableTranslationPageText(cached.text)) {
      mergedTexts.set(pageNumber, cached.text.trim())
    }
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
      if (isUsableTranslationPageText(text)) {
        mergedTexts.set(pageNumber, text.trim())
      }
    }
  }

  if (needsFetch) {
    const fetchRequest: PdfDocumentParseRequest = {
      ...request,
      pageRange: { start: fetchStart, end: fetchEnd },
    }
    mergeExtract(await extractBackendPageTexts(primaryBackend, fetchRequest, timeoutMs))
  }

  let missing = listPagesMissingUsableText(startPage, endPage, mergedTexts)

  if (
    missing.length > 0 &&
    shouldUseOpenDataLoaderForPdf(filePath, primaryBackend) &&
    !odlPreviewDocumentCache.get(odlPreviewDocumentKey(filePath))
  ) {
    const odlRequest: PdfDocumentParseRequest = {
      ...request,
      profile: 'translation',
      pageRange: { start: missing[0]!, end: missing[missing.length - 1]! },
    }
    mergeExtract(
      await extractBackendPageTexts(
        'opendataloader',
        odlRequest,
        resolveOdlPreviewParseTimeoutMs(timeoutMs),
      ),
    )
    missing = listPagesMissingUsableText(startPage, endPage, mergedTexts)
  }

  if (missing.length > 0 && fallbackBackend !== primaryBackend) {
    const fallbackRequest: PdfDocumentParseRequest = {
      ...request,
      pageRange: { start: missing[0]!, end: missing[missing.length - 1]! },
    }
    mergeExtract(await extractBackendPageTexts(fallbackBackend, fallbackRequest, timeoutMs))
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
      for (const page of extracted.pages) {
        ocrByPage.set(page.pageNumber, page.text)
      }
    }
  }

  const pdfTotalPages = await resolvePdfTotalPages(filePath, totalPages || 1)
  totalPages = Math.max(totalPages, pdfTotalPages)

  const pages: PdfPageText[] = []
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

  return {
    backend: resultBackend,
    totalPages,
    plainText,
    markdown: plainText,
    pages,
    pageWidth,
    pageHeight,
  }
}

async function parsePdfDocumentBuiltin(request: PdfDocumentParseRequest): Promise<DocumentParseResult> {
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
    if (!workspaceId || !kbId) {
      throw new Error('知识库 PDF 解析需要 workspaceId 与 kbId')
    }
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
    if (!workspaceId) {
      throw new Error('聊天 PDF 解析需要 workspaceId')
    }
    const parseOptions = buildChatParseOptions(workspaceId, { documentOcrEnabled })
    const plainText = await extractPdfPlainText(filePath, {
      preferPdfJs: true,
      textQuality: parseOptions.pdfTextQuality,
      ocr:
        parseOptions.ocr?.enabled && parseOptions.ocr.recognizePage
          ? {
              recognizePage: parseOptions.ocr.recognizePage,
              maxPages: parseOptions.ocr.maxPdfPages,
            }
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

  const plainText = pages.map((page) => page.text).join('\n\n').trim()

  return {
    backend: 'builtin',
    totalPages: extracted.totalPages,
    plainText,
    markdown: plainText,
    pages,
    pageWidth: extracted.pageWidth,
    pageHeight: extracted.pageHeight,
  }
}

export { isPdfExtractedTextInsufficient }

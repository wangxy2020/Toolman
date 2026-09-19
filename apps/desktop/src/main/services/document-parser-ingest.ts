import { basename } from 'node:path'
import {
  collectPagesFromChannels,
  createPdfPageParseTracker,
  collapseSpacedCjkOcrText,
  cacheUsablePdfPage,
  loadUsableCachedPdfPages,
  defaultTitle,
  extractMarkdownHeading,
  extractPdfPageTexts,
  finalizeGlmOcrText,
  formatIngestPdfPage,
  groupPageNumbersIntoRanges,
  isPdfExtractedTextInsufficient,
  isPdfPageTextUsable,
  isSkippablePdfOcrPageError,
  listPagesNeedingOcr,
  mimeTypeForKind,
  parseFile,
  pickIngestPageBody,
  pickLongestUsableOdlBody,
  renderPdfPageForOcr,
  shouldRetryGlmOcrPage,
  shouldSendPageToGlmOcr,
  shouldSkipGlmOcrForBlankPage,
  splitPdfPagesByMarkers,
  type ParsedDocument,
  type ParseFileOptions,
  type PdfPageParseTracker,
  type CachedPdfPageEngine,
} from '@toolman/knowledge'
import type { DocumentPageText, DocumentParseResult } from '@toolman/opendataloader'
import type { OdlHybridBackend, OdlHybridSettings } from '@toolman/shared'
import { logStructured } from './structured-log.service'
import { assertIngestNotCancelled } from './knowledge-ingest-manager.service'
import { resolveOdlHybridSettings, toOdlHybridParseConfig } from './runtime-app-settings.service'
import {
  DEFAULT_ODL_TIMEOUT_MS,
  isHybridServerAvailable,
  isPdfFilePath,
  normalizeOdlDocumentChannels,
  odlPreviewScanDetected,
  renormalizeOdlPageRangeResult,
  resolvePdfTotalPages,
  runOdlParse,
  shouldUseOpenDataLoaderForPdf,
  type OdlParseRequest,
} from './document-parser-odl-cache'

export function emptyOdlResult(): DocumentParseResult {
  return { backend: 'opendataloader', totalPages: 1, plainText: '', markdown: '', pages: [] }
}

function joinOdlPageBodies(result: DocumentParseResult): string {
  return result.pages
    .map((page) => page.markdown?.trim() || page.text?.trim() || '')
    .filter(Boolean)
    .join('\n\n')
}

/** Local ODL with a broken CJK text layer must not skip Hybrid OCR. */
export function isOdlIngestResultInsufficient(result: DocumentParseResult): boolean {
  const body = pickLongestUsableOdlBody(result.plainText, result.markdown) || joinOdlPageBodies(result)
  if (!body.trim()) return true
  const pageCount = Math.max(
    result.totalPages,
    result.pages.length,
    splitPdfPagesByMarkers(result.plainText).length,
    splitPdfPagesByMarkers(body).length,
    1,
  )
  return isPdfExtractedTextInsufficient(body, pageCount)
}

/** True when Hybrid/ODL produced any page body — not a quality gate. */
export function hybridIngestHasPageText(result: DocumentParseResult | null | undefined): boolean {
  if (!result) return false
  if (joinOdlPageBodies(result).trim() || result.plainText.trim() || result.markdown?.trim()) {
    return true
  }
  return false
}

function odlPageBodies(result: DocumentParseResult): Array<{ text?: string; markdown?: string }> {
  if (result.pages.length > 0) return result.pages
  return [...collectPagesFromChannels({
    pages: result.pages,
    plainText: result.plainText,
    markdown: result.markdown,
    totalPages: Math.max(result.totalPages, 1),
  }).values()]
}

/** Page-level quality gate: ISBN/header debris must not accept a Hybrid batch. */
export function hybridResultHasUsablePage(result: DocumentParseResult | null | undefined): boolean {
  if (!result) return false
  return odlPageBodies(result).some((page) =>
    isPdfPageTextUsable(collapseSpacedCjkOcrText(pickIngestPageBody(page))),
  )
}

function collapseHybridDocument(result: DocumentParseResult): DocumentParseResult {
  const pages = result.pages.map((page) => {
    const text = collapseSpacedCjkOcrText(page.text ?? '')
    const markdown = page.markdown ? collapseSpacedCjkOcrText(page.markdown) : text
    return { ...page, text, markdown: markdown || text }
  })
  return {
    ...result,
    pages,
    plainText: collapseSpacedCjkOcrText(result.plainText),
    markdown: result.markdown ? collapseSpacedCjkOcrText(result.markdown) : result.markdown,
  }
}

/** Knowledge ingest Hybrid OCR pages per JVM batch (progress + cancel granularity). */
const KNOWLEDGE_HYBRID_BATCH_SIZE = 16
/** One Hybrid batch at a time on unified-memory 16GB (JVM + OCR + Ollama). */
const KNOWLEDGE_HYBRID_BATCH_CONCURRENCY = 1
const KNOWLEDGE_GLM_OCR_CONCURRENCY = 1
const KNOWLEDGE_HYBRID_EMPTY_BATCH_ABORT = 2
const KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MIN_MS = 3 * 60 * 1000
const KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MAX_MS = 15 * 60 * 1000

export function hybridShouldAbortRemainingBatches(emptyBatchCount: number): boolean {
  return emptyBatchCount >= KNOWLEDGE_HYBRID_EMPTY_BATCH_ABORT
}

/** Page-level glm-ocr covers every leftover page. The old 200 cap was for whole-document OCR. */
export function resolveIngestGlmOcrMaxPages(leftoverPages: number): number {
  return Math.max(0, leftoverPages)
}

function hybridBackendAttempts(settings: OdlHybridSettings): OdlHybridBackend[] {
  const ordered: OdlHybridBackend[] = ['docling-fast']
  if (settings.backend !== 'docling-fast') ordered.push(settings.backend)
  return ordered
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) break
      await worker(items[index]!)
    }
  })
  await Promise.all(runners)
}

function persistParsedPage(options: {
  parsedDir?: string
  contentHash?: string
  documentId?: string
  pageNumber: number
  text: string
  markdown?: string
  engine: CachedPdfPageEngine | null
  qualityScore: string
}): void {
  if (!options.parsedDir || !options.contentHash) return
  cacheUsablePdfPage({
    parsedDir: options.parsedDir,
    contentHash: options.contentHash,
    pageNumber: options.pageNumber,
    text: options.text,
    markdown: options.markdown,
    engine: options.engine,
    qualityScore: options.qualityScore,
    documentId: options.documentId,
  })
}

function rememberPage(
  pageByNumber: Map<number, DocumentPageText>,
  page: DocumentPageText,
): boolean {
  const body = pickIngestPageBody(page)
  if (!isPdfPageTextUsable(body)) return false
  const existing = pageByNumber.get(page.pageNumber)
  if (!existing || body.length > pickIngestPageBody(existing).length) {
    pageByNumber.set(page.pageNumber, page)
  }
  return true
}

/** Try configured hybrid backend, then docling-fast when hancom-ai fails (common local setup). */
export async function runOdlHybridParseWithFallback(
  request: OdlParseRequest,
  timeoutMs: number,
  settings: OdlHybridSettings,
): Promise<DocumentParseResult | null> {
  for (const backend of hybridBackendAttempts(settings)) {
    try {
      const hybrid = collapseHybridDocument(
        normalizeOdlDocumentChannels(
          await runOdlParse(request, timeoutMs, {
            ...toOdlHybridParseConfig({ ...settings, backend }),
            timeoutMs,
          }),
        ),
      )
      const usable = hybridResultHasUsablePage(hybrid)
      if (request.pageRange) {
        if (usable || hybrid.pages.length > 0) {
          const pdfTotal = await resolvePdfTotalPages(request.filePath, hybrid.totalPages)
          return renormalizeOdlPageRangeResult(hybrid, request.pageRange, pdfTotal)
        }
      } else if (!isOdlIngestResultInsufficient(hybrid) || usable) {
        return hybrid
      }
      const range = request.pageRange ? `${request.pageRange.start}-${request.pageRange.end}` : 'all'
      logStructured(
        'knowledge-ingest',
        'warn',
        `ODL+Hybrid ${backend} ${range} produced no usable page text (pages=${hybrid.pages.length}, chars=${hybrid.plainText.length})`,
      )
      if (hybrid.pages.length > 0) break
    } catch (error) {
      const range = request.pageRange ? `${request.pageRange.start}-${request.pageRange.end}` : 'all'
      logStructured(
        'knowledge-ingest',
        'warn',
        `ODL+Hybrid ${backend} ${range} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return null
}

/**
 * Local ODL first (fast). When hybrid is enabled and text is insufficient, retry via hybrid server.
 * Returns the best result; caller may still fall back to vision OCR.
 */
export async function parseOdlWithOptionalHybridRetry(
  request: OdlParseRequest,
  timeoutMs: number,
  options?: { skipLocalWarm?: boolean; skipHybrid?: boolean },
): Promise<DocumentParseResult> {
  let local: DocumentParseResult | null = null
  if (!options?.skipLocalWarm) {
    local = await runOdlParse(request, timeoutMs)
    if (!isOdlIngestResultInsufficient(local)) return local
    odlPreviewScanDetected.add(request.filePath)
  } else {
    odlPreviewScanDetected.add(request.filePath)
  }
  if (options?.skipHybrid) return local ?? emptyOdlResult()
  const hybridSettings = resolveOdlHybridSettings()
  if (!hybridSettings.enabled) return local ?? emptyOdlResult()
  const hybridUrl = hybridSettings.url.trim()
  if (!(await isHybridServerAvailable(hybridUrl))) return local ?? emptyOdlResult()
  return (await runOdlHybridParseWithFallback(request, timeoutMs, hybridSettings)) ?? local ?? emptyOdlResult()
}

function toParsedDocument(filePath: string, plainText: string): ParsedDocument {
  return {
    title: defaultTitle(filePath),
    plainText,
    mimeType: mimeTypeForKind('pdf', filePath),
    kind: 'pdf',
  }
}

function toParsedDocumentFromPages(
  filePath: string,
  pageByNumber: Map<number, DocumentPageText>,
  totalPages: number,
  parseReport?: ParsedDocument['parseReport'],
): ParsedDocument | null {
  const parts: string[] = []
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = pageByNumber.get(pageNumber)
    if (!page) continue
    const body = pickIngestPageBody(page)
    if (!isPdfPageTextUsable(body)) continue
    parts.push(
      formatIngestPdfPage({
        pageNumber,
        totalPages,
        body,
        heading: extractMarkdownHeading(body),
      }),
    )
  }
  const plainText = parts.join('\n\n').trim()
  if (!plainText) return null
  return {
    ...toParsedDocument(filePath, plainText),
    ...(parseReport ? { parseReport } : {}),
  }
}

async function extractNativePdfJsResult(filePath: string): Promise<DocumentParseResult> {
  const extracted = await extractPdfPageTexts(filePath, 1, Number.MAX_SAFE_INTEGER)
  return {
    backend: 'builtin',
    totalPages: extracted.totalPages,
    plainText: extracted.pages.map((page) => page.text).join('\n\n'),
    markdown: '',
    pages: extracted.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
  }
}

async function runHybridBatchWithRetry(
  filePath: string,
  range: { start: number; end: number },
  timeoutMs: number,
  settings: OdlHybridSettings,
): Promise<DocumentParseResult | null> {
  const request: OdlParseRequest = { filePath, profile: 'knowledge', pageRange: range }
  const first = await runOdlHybridParseWithFallback(request, timeoutMs, settings)
  if (first) return first
  logStructured(
    'knowledge-ingest',
    'warn',
    `ODL+Hybrid batch ${range.start}-${range.end} retrying after empty/error`,
  )
  return runOdlHybridParseWithFallback(request, timeoutMs, settings)
}

/**
 * Hybrid OCR only for pages whose native text failed quality — never re-OCR good pages.
 */
async function parseKnowledgeIngestHybridPages(options: {
  filePath: string
  pageNumbers: number[]
  totalPages: number
  parseTimeoutMs: number
  documentId?: string
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
  completedPages: number
  tracker: PdfPageParseTracker
}): Promise<Map<number, DocumentPageText>> {
  const pageByNumber = new Map<number, DocumentPageText>()
  const { filePath, pageNumbers, totalPages, parseTimeoutMs, documentId, onParseProgress, tracker } =
    options
  if (pageNumbers.length === 0) return pageByNumber

  const settings = resolveOdlHybridSettings()
  if (!settings.enabled) return pageByNumber
  const hybridUrl = settings.url.trim()
  if (!(await isHybridServerAvailable(hybridUrl))) {
    logStructured(
      'knowledge-ingest',
      'warn',
      `ODL Hybrid server unavailable at ${hybridUrl || '(empty url)'}; skipping Hybrid`,
    )
    return pageByNumber
  }

  const ranges = groupPageNumbersIntoRanges(pageNumbers, KNOWLEDGE_HYBRID_BATCH_SIZE)
  const batchTimeoutMs = Math.min(
    KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MAX_MS,
    Math.max(
      KNOWLEDGE_HYBRID_BATCH_TIMEOUT_MIN_MS,
      Math.floor(parseTimeoutMs / Math.max(1, ranges.length)),
    ),
  )
  logStructured(
    'knowledge-ingest',
    'info',
    `ODL+Hybrid page OCR for ${basename(filePath)} (${pageNumbers.length}/${totalPages} pages need OCR, batches=${ranges.length})`,
  )

  let completed = options.completedPages
  let emptyBatches = 0
  let abortRemaining = false
  await mapWithConcurrency(ranges, KNOWLEDGE_HYBRID_BATCH_CONCURRENCY, async (range) => {
    if (abortRemaining) return
    if (documentId) assertIngestNotCancelled(documentId)
    onParseProgress?.(completed, totalPages, true)
    const started = Date.now()
    const batch = await runHybridBatchWithRetry(filePath, range, batchTimeoutMs, settings)
    const elapsed = Date.now() - started
    const perPageMs = elapsed / Math.max(1, range.end - range.start + 1)
    const normalized = batch ? renormalizeOdlPageRangeResult(batch, range, totalPages) : null
    const byNumber = new Map((normalized?.pages ?? []).map((page) => [page.pageNumber, page]))
    let keptInBatch = 0
    for (let pageNumber = range.start; pageNumber <= range.end; pageNumber += 1) {
      const page = byNumber.get(pageNumber)
      tracker.recordHybrid(pageNumber, page ? pickIngestPageBody(page) : '', perPageMs)
      if (page && rememberPage(pageByNumber, page)) keptInBatch += 1
    }
    if (!batch) {
      emptyBatches += 1
      logStructured(
        'knowledge-ingest',
        'warn',
        `ODL+Hybrid batch ${range.start}-${range.end}/${totalPages} returned no usable text`,
      )
      if (hybridShouldAbortRemainingBatches(emptyBatches)) {
        abortRemaining = true
        logStructured(
          'knowledge-ingest',
          'warn',
          `ODL+Hybrid aborting remaining batches after ${emptyBatches} empty results; falling through to page OCR`,
        )
      }
    } else {
      emptyBatches = 0
      completed += keptInBatch
    }
    onParseProgress?.(Math.min(completed, totalPages), totalPages, false)
  })

  return pageByNumber
}

async function backfillPagesWithGlmOcr(options: {
  filePath: string
  pageNumbers: number[]
  totalPages: number
  recognizePage: NonNullable<NonNullable<ParseFileOptions['ocr']>['recognizePage']>
  maxPages: number
  documentId?: string
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
  completedPages: number
  tracker: PdfPageParseTracker
}): Promise<Map<number, DocumentPageText>> {
  const pageByNumber = new Map<number, DocumentPageText>()
  if (options.pageNumbers.length === 0) return pageByNumber

  logStructured(
    'knowledge-ingest',
    'info',
    `glm-ocr page fallback for ${basename(options.filePath)} (${options.pageNumbers.length} pages, concurrency=${KNOWLEDGE_GLM_OCR_CONCURRENCY})`,
  )

  let completed = options.completedPages
  await mapWithConcurrency(options.pageNumbers, KNOWLEDGE_GLM_OCR_CONCURRENCY, async (pageNumber) => {
    if (options.documentId) assertIngestNotCancelled(options.documentId)
    options.onParseProgress?.(completed, options.totalPages, true)
    const started = Date.now()
    let kept = ''
    try {
      const { page: rendered } = await renderPdfPageForOcr(options.filePath, pageNumber)
      if (shouldSkipGlmOcrForBlankPage(rendered.inkRatio)) {
        logStructured(
          'knowledge-ingest',
          'info',
          `glm-ocr skip blank page ${pageNumber}/${options.totalPages} (inkRatio=${(rendered.inkRatio ?? 0).toFixed(4)})`,
        )
      } else {
        try {
          kept = finalizeGlmOcrText(
            await options.recognizePage({
              png: rendered.png,
              mimeType: rendered.mimeType,
              pageNumber,
              totalPages: options.totalPages,
            }),
          )
        } catch (error) {
          if (!isSkippablePdfOcrPageError(error)) throw error
          kept = ''
        }
        if (shouldRetryGlmOcrPage(kept, rendered.inkRatio)) {
          logStructured(
            'knowledge-ingest',
            'info',
            `glm-ocr retry page ${pageNumber}/${options.totalPages} with tighter decode`,
          )
          try {
            kept = finalizeGlmOcrText(
              await options.recognizePage({
                png: rendered.png,
                mimeType: rendered.mimeType,
                pageNumber,
                totalPages: options.totalPages,
                retry: true,
              }),
            )
          } catch (error) {
            if (!isSkippablePdfOcrPageError(error)) throw error
            kept = ''
          }
        }
      }
    } catch (error) {
      if (options.documentId) assertIngestNotCancelled(options.documentId)
      logStructured(
        'knowledge-ingest',
        'warn',
        `glm-ocr page ${pageNumber} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      kept = ''
    }
    const elapsed = Date.now() - started
    options.tracker.recordGlmOcr(pageNumber, kept, elapsed)
    const usable = isPdfPageTextUsable(kept)
    if (usable) {
      pageByNumber.set(pageNumber, { pageNumber, text: kept, markdown: kept })
    }
    logStructured(
      'knowledge-ingest',
      'info',
      `glm-ocr page ${pageNumber}/${options.totalPages} ${usable ? `${kept.length} chars` : 'no usable text'} ${(elapsed / 1000).toFixed(1)}s`,
    )
    completed += 1
    options.onParseProgress?.(Math.min(completed, options.totalPages), options.totalPages, false)
  })
  return pageByNumber
}

export async function parseIngestDocumentFile(options: {
  filePath: string
  workspaceId: string
  kbId: string
  parseOptions: ParseFileOptions
  parseTimeoutMs: number
  documentId?: string
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
}): Promise<ParsedDocument> {
  if (isPdfFilePath(options.filePath)) {
    const odl = await tryParseIngestWithOdl(options)
    if (odl) return odl
    throw new Error('PDF 页面解析未得到可用正文')
  }
  return parseFile(options.filePath, options.parseOptions)
}

/**
 * Knowledge ingest: native text per page → Hybrid OCR only on failed pages → glm-ocr only on leftovers.
 * Never falls back to whole-document glm-ocr.
 */
export async function tryParseIngestWithOdl(options: {
  filePath: string
  workspaceId: string
  kbId: string
  parseTimeoutMs: number
  documentId?: string
  contentHash?: string
  parsedDir?: string
  parseOptions?: ParseFileOptions
  onParseProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
}): Promise<ParsedDocument | null> {
  const { filePath, parseTimeoutMs, documentId, contentHash, parsedDir, onParseProgress, parseOptions } =
    options
  const cacheCtx = { parsedDir, contentHash, documentId }
  if (!isPdfFilePath(filePath)) return null
  const hybridEnabled = resolveOdlHybridSettings().enabled
  logStructured(
    'knowledge-ingest',
    'info',
    `ODL${hybridEnabled ? '+Hybrid' : ''} parsing ${basename(filePath)}`,
  )

  let local: DocumentParseResult
  try {
    if (shouldUseOpenDataLoaderForPdf(filePath)) {
      local = await parseOdlWithOptionalHybridRetry(
        { filePath, profile: 'knowledge' },
        Math.min(parseTimeoutMs, DEFAULT_ODL_TIMEOUT_MS),
        { skipHybrid: true },
      )
    } else {
      local = await extractNativePdfJsResult(filePath)
    }
  } catch (error) {
    logStructured(
      'knowledge-ingest',
      'warn',
      `ODL native parse failed for ${basename(filePath)}; using pdf.js page text`,
      { error: error instanceof Error ? error.message : String(error) },
    )
    local = await extractNativePdfJsResult(filePath)
  }

  const totalPages = Math.max(1, await resolvePdfTotalPages(filePath, local.totalPages))
  const tracker = createPdfPageParseTracker(totalPages)
  const pageByNumber = new Map<number, DocumentPageText>()
  const nativeStarted = Date.now()
  const nativePages = collectPagesFromChannels({
    pages: local.pages,
    plainText: local.plainText,
    markdown: local.markdown,
    totalPages,
  })
  const nativePerPageMs = (Date.now() - nativeStarted) / totalPages
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = nativePages.get(pageNumber)
    tracker.recordNative(pageNumber, page ? pickIngestPageBody(page) : '', nativePerPageMs)
    if (page && rememberPage(pageByNumber, page)) {
      persistParsedPage({
        ...cacheCtx,
        pageNumber,
        text: pickIngestPageBody(page),
        markdown: page.markdown,
        engine: 'native',
        qualityScore: 'ok',
      })
    }
  }

  if (parsedDir && contentHash) {
    for (const cached of loadUsableCachedPdfPages(parsedDir, contentHash).values()) {
      if (pageByNumber.has(cached.pageNumber)) continue
      const restored = {
        pageNumber: cached.pageNumber,
        text: cached.parsedText,
        markdown: cached.markdown || cached.parsedText,
      }
      if (!rememberPage(pageByNumber, restored)) continue
      if (cached.ocrEngine === 'hybrid') tracker.recordHybrid(cached.pageNumber, cached.parsedText, 0)
      else if (cached.ocrEngine === 'glm-ocr') tracker.recordGlmOcr(cached.pageNumber, cached.parsedText, 0)
    }
  }

  if (
    local.plainText.trim() &&
    !isOdlIngestResultInsufficient(local) &&
    listPagesNeedingOcr(pageByNumber, totalPages).length === 0
  ) {
    const parseReport = tracker.finalize(pageByNumber)
    logStructured(
      'knowledge-ingest',
      'info',
      `ODL succeeded for ${basename(filePath)} (${totalPages} pages, native text)`,
    )
    return toParsedDocumentFromPages(filePath, pageByNumber, totalPages, parseReport)
  }

  const nativeKept = pageByNumber.size
  let needed = listPagesNeedingOcr(pageByNumber, totalPages)
  logStructured(
    'knowledge-ingest',
    'info',
    `ODL local kept ${nativeKept}/${totalPages} pages for ${basename(filePath)}; ${needed.length} need OCR`,
  )
  if (needed.length > 0) onParseProgress?.(nativeKept, totalPages, true)

  if (needed.length > 0 && hybridEnabled) {
    const hybridPages = await parseKnowledgeIngestHybridPages({
      filePath,
      pageNumbers: needed,
      totalPages,
      parseTimeoutMs,
      documentId,
      onParseProgress,
      completedPages: nativeKept,
      tracker,
    })
    for (const page of hybridPages.values()) {
      if (!rememberPage(pageByNumber, page)) continue
      persistParsedPage({
        ...cacheCtx,
        pageNumber: page.pageNumber,
        text: pickIngestPageBody(page),
        markdown: page.markdown,
        engine: 'hybrid',
        qualityScore: 'ok',
      })
    }
    needed = listPagesNeedingOcr(pageByNumber, totalPages)
    logStructured(
      'knowledge-ingest',
      'info',
      `ODL+Hybrid kept ${pageByNumber.size}/${totalPages} usable pages; ${needed.length} still need OCR`,
    )
  } else if (needed.length > 0 && !hybridEnabled) {
    logStructured('knowledge-ingest', 'info', `ODL Hybrid disabled; ${needed.length} pages may use glm-ocr`)
  }

  const recognizePage = parseOptions?.ocr?.enabled ? parseOptions.ocr.recognizePage : undefined
  const glmPageNumbers = needed.filter((pageNumber) =>
    shouldSendPageToGlmOcr({ hybridText: tracker.hybridText(pageNumber) }),
  )
  if (glmPageNumbers.length < needed.length) {
    logStructured(
      'knowledge-ingest',
      'info',
      `glm-ocr skipping ${needed.length - glmPageNumbers.length} Hybrid mojibake pages (keep Fast OCR channel, do not re-OCR)`,
    )
  }
  if (glmPageNumbers.length > 0 && recognizePage) {
    const ocrPages = await backfillPagesWithGlmOcr({
      filePath,
      pageNumbers: glmPageNumbers,
      totalPages,
      recognizePage,
      maxPages: resolveIngestGlmOcrMaxPages(glmPageNumbers.length),
      documentId,
      onParseProgress,
      completedPages: totalPages - needed.length,
      tracker,
    })
    for (const page of ocrPages.values()) {
      if (!rememberPage(pageByNumber, page)) continue
      persistParsedPage({
        ...cacheCtx,
        pageNumber: page.pageNumber,
        text: pickIngestPageBody(page),
        markdown: page.markdown,
        engine: 'glm-ocr',
        qualityScore: 'ok',
      })
    }
    needed = listPagesNeedingOcr(pageByNumber, totalPages)
  } else if (needed.length > 0 && !recognizePage) {
    tracker.markSkipped(needed)
  }

  const parseReport = tracker.finalize(pageByNumber)
  const parsed = toParsedDocumentFromPages(filePath, pageByNumber, totalPages, parseReport)
  if (parsed) {
    logStructured(
      'knowledge-ingest',
      'info',
      `PDF page pipeline finished ${basename(filePath)} (usable=${pageByNumber.size}/${totalPages}, leftover=${needed.length}, duplicateOcr=${parseReport.duplicateOcrPages})`,
    )
    if (parseReport.warning) {
      logStructured('knowledge-ingest', 'warn', parseReport.warning)
    }
    return parsed
  }
  throw new Error(parseReport.warning ?? 'OCR 未从 PDF 页面中识别到文字内容')
}

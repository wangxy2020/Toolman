import { IpcChannel, type PdfParserBackend } from '@toolman/shared'
import { reflowTranslationDisplayLines } from './translation-paragraphs'
import {
  flattenLayoutHtmlTable,
  hasDisplayableParsePreviewContent,
  hasGfmTableMarkup,
  hasHtmlMarkup,
  htmlPreviewToVisibleText,
  isLayoutGfmTable,
  isLayoutHtmlTable,
  repairDocumentPreviewTables,
  sanitizeParsePreviewContent,
  stripBrokenGfmTableNoise,
} from './translation-page-source-quality'

export const PARSE_TIMEOUT_MS = 20_000
/** Full-document ODL parse — includes Hybrid OCR when enabled in app settings. */
export const ODL_PARSE_TIMEOUT_MS = 45 * 60 * 1000
/**
 * First progressive batch — kept small so digital PDFs can probe scan-vs-text
 * quickly, paint pages 1–N immediately, then upgrade via one full-document apply.
 * Scanned PDFs apply this probe then continue with larger batches below.
 */
export const ODL_PROGRESSIVE_FIRST_BATCH = 2
/**
 * Subsequent progressive Hybrid OCR batches.
 * Larger batches = fewer JVM cold starts on true scanned PDFs, and more pages
 * appear soon after the 2-page probe.
 */
export const ODL_PROGRESSIVE_BATCH_SIZE = 10
/** Per-page budget for vision OCR backfill (scanned PDFs, phase 3). */
export const PDF_OCR_PAGE_TIMEOUT_MS = 120_000
export const PDF_METADATA_TIMEOUT_MS = 15_000
/** Prefetch source text this many pages ahead while translating. */
export const SOURCE_PREFETCH_AHEAD = 10
/** OCR backfill concurrency — one page per IPC call, N pages in parallel for faster scans. */
export const OCR_BACKFILL_CONCURRENCY = 2
/** Prefetch OCR backfill this many pages ahead while scrolling scanned PDFs. */
export const OCR_PREFETCH_AHEAD = 1
/** Batch source prefetch up to this many pages per IPC call when translating. */
export const SOURCE_PREFETCH_BATCH = 10
/** Translate this many pages concurrently (parse stays batched separately). */
export const TRANSLATE_CONCURRENCY = 1
/** On Translate click, only enqueue the focused page plus this many ahead. */
export const TRANSLATE_START_AHEAD = 2
/**
 * Apply full-document parse results in small chunks so sanitize/GFM→HTML
 * cannot freeze the renderer for 48-page scanned contracts in one tick.
 */
export const PARSE_APPLY_CHUNK_SIZE = 1

export async function applyParseResultsInChunks(
  pageNumbers: number[],
  pagesData: Array<{ pageNumber: number; text?: string; markdown?: string }>,
  apply: (
    pageNumbers: number[],
    pagesData: Array<{ pageNumber: number; text?: string; markdown?: string }>,
    options?: { emptyAsParsing?: boolean; previewLenient?: boolean },
  ) => number[],
  options?: {
    emptyAsParsing?: boolean
    previewLenient?: boolean
    chunkSize?: number
    shouldAbort?: () => boolean
  },
): Promise<number[]> {
  const chunkSize = Math.max(1, options?.chunkSize ?? PARSE_APPLY_CHUNK_SIZE)
  const emptyPages: number[] = []
  const { waitForDocumentScrollIdle } = await import('./document-scroll-gate')
  for (let index = 0; index < pageNumbers.length; index += chunkSize) {
    if (options?.shouldAbort?.()) return emptyPages
    await waitForDocumentScrollIdle()
    if (options?.shouldAbort?.()) return emptyPages
    const chunk = pageNumbers.slice(index, index + chunkSize)
    emptyPages.push(
      ...apply(chunk, pagesData, {
        emptyAsParsing: options?.emptyAsParsing,
        previewLenient: options?.previewLenient,
      }),
    )
    if (index + chunkSize < pageNumbers.length) {
      await yieldToNextPaint()
      await new Promise<void>((resolve) => setTimeout(resolve, 16))
    }
  }
  return emptyPages
}

export function resolvedPageCount(totalPages: number, pagesLength: number): number {
  return Math.max(totalPages, pagesLength)
}

/** Let the first PDF preview IPC start before metadata re-opens the same file. */
export function yieldToNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0)
      })
      return
    }
    setTimeout(resolve, 0)
  })
}

export function reorderQueueFront(queue: number[], pageNumber: number): void {
  const index = queue.indexOf(pageNumber)
  if (index <= 0) return
  queue.splice(index, 1)
  queue.unshift(pageNumber)
}

export function sortQueueWithPriority(queue: number[], priorityPage: number | null | undefined): void {
  queue.sort((left, right) => left - right)
  if (priorityPage && priorityPage > 0) {
    reorderQueueFront(queue, priorityPage)
  }
}

export function enqueuePage(queue: number[], pageNumber: number, priority = false): void {
  if (queue.includes(pageNumber)) {
    if (priority) reorderQueueFront(queue, pageNumber)
    return
  }
  if (priority) queue.unshift(pageNumber)
  else {
    queue.push(pageNumber)
    queue.sort((left, right) => left - right)
  }
}

export function isPdfPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf')
}

/**
 * Prepare page text for the translation model.
 * - Layout ODL grids → prose
 * - Real HTML/GFM tables → keep markup so structure survives translation
 * - Other HTML → visible text + reflow
 */
export function toPlainTranslationSource(text: string): string {
  const body = text.trim()
  if (!body) return ''
  if (hasHtmlMarkup(body)) {
    if (isLayoutHtmlTable(body)) {
      return reflowTranslationDisplayLines(flattenLayoutHtmlTable(body)).trim()
    }
    if (/<table\b/i.test(body)) {
      // Keep real data tables as HTML for structure-preserving translate.
      return body
    }
    return reflowTranslationDisplayLines(htmlPreviewToVisibleText(body)).trim()
  }
  if (/\|/.test(body) && !hasGfmTableMarkup(body)) {
    const repaired = repairDocumentPreviewTables(body)
    if (/<table\b/i.test(repaired) && !isLayoutHtmlTable(repaired)) return repaired
    if (isLayoutGfmTable(body)) {
      return reflowTranslationDisplayLines(stripBrokenGfmTableNoise(body)).trim()
    }
    return reflowTranslationDisplayLines(stripBrokenGfmTableNoise(body)).trim()
  }
  if (isLayoutGfmTable(body)) {
    return reflowTranslationDisplayLines(stripBrokenGfmTableNoise(body)).trim()
  }
  return reflowTranslationDisplayLines(body).trim()
}

export function resolveTranslationSourceText(text?: string, markdown?: string): string {
  const rawMarkdown = markdown?.trim() ?? ''
  const rawPlain = text?.trim() ?? rawMarkdown
  // Real tables must be captured before OCR-collapse stripping flattens HTML tags.
  const tableCandidate = rawMarkdown || rawPlain
  if (/<table\b/i.test(tableCandidate) && !isLayoutHtmlTable(tableCandidate)) {
    return toPlainTranslationSource(tableCandidate)
  }
  if (hasGfmTableMarkup(tableCandidate) && !isLayoutGfmTable(tableCandidate)) {
    return tableCandidate
  }
  if (/\|/.test(tableCandidate) && !/<table\b/i.test(tableCandidate) && !hasGfmTableMarkup(tableCandidate)) {
    const repaired = repairDocumentPreviewTables(tableCandidate)
    if (/<table\b/i.test(repaired) && !isLayoutHtmlTable(repaired)) return repaired
    return toPlainTranslationSource(stripBrokenGfmTableNoise(tableCandidate))
  }
  if (isLayoutGfmTable(tableCandidate)) {
    return toPlainTranslationSource(stripBrokenGfmTableNoise(tableCandidate))
  }
  const { text: plain, markdown: md } = sanitizeParsePreviewContent(rawPlain, rawMarkdown)
  if (!hasDisplayableParsePreviewContent(plain, md)) return ''
  const candidate = plain.trim() || md.trim()
  return toPlainTranslationSource(candidate)
}

export function resolveParseTimeoutMs(
  filePath: string,
  metadataOnly = false,
  batchPageCount = 1,
): number {
  if (metadataOnly) return PDF_METADATA_TIMEOUT_MS
  if (isPdfPath(filePath)) {
    return PDF_OCR_PAGE_TIMEOUT_MS * Math.max(1, batchPageCount) + 30_000
  }
  return PARSE_TIMEOUT_MS
}

export function resolveProgressiveBatchTimeoutMs(
  filePath: string,
  batchPageCount: number,
  skipLocalWarm: boolean,
): number {
  if (!isPdfPath(filePath)) return PARSE_TIMEOUT_MS
  if (skipLocalWarm) {
    return Math.min(ODL_PARSE_TIMEOUT_MS, batchPageCount * 120_000 + 60_000)
  }
  return Math.min(ODL_PARSE_TIMEOUT_MS, batchPageCount * 120_000 + 120_000)
}

export function buildOdlProgressiveParseBatches(totalPages: number): Array<{ start: number; end: number }> {
  if (totalPages < 1) return []
  const batches: Array<{ start: number; end: number }> = []
  const firstEnd = Math.min(ODL_PROGRESSIVE_FIRST_BATCH, totalPages)
  batches.push({ start: 1, end: firstEnd })
  let next = firstEnd + 1
  while (next <= totalPages) {
    const end = Math.min(next + ODL_PROGRESSIVE_BATCH_SIZE - 1, totalPages)
    batches.push({ start: next, end })
    next = end + 1
  }
  return batches
}

export async function invokeParsePages(
  path: string,
  startPage: number,
  endPage: number,
  workspaceId: string | null,
  pdfParserBackend: PdfParserBackend,
  options?: {
    metadataOnly?: boolean
    odlPreviewOnly?: boolean
    fullDocument?: boolean
    ocrBackfillOnly?: boolean
    odlPreviewReset?: boolean
    odlHybridBackfill?: boolean
    odlWarmOnly?: boolean
    odlProgressiveBatch?: boolean
    odlSkipLocalWarm?: boolean
    timeoutMs?: number
  },
) {
  const result = await window.api.invoke(IpcChannel.TranslationDocumentParsePages, {
    path,
    startPage,
    endPage,
    pdfParserBackend,
    ...(workspaceId ? { workspaceId } : {}),
    ...(options?.metadataOnly ? { metadataOnly: true } : {}),
    ...(options?.odlPreviewOnly ? { odlPreviewOnly: true } : {}),
    ...(options?.fullDocument ? { fullDocument: true } : {}),
    ...(options?.ocrBackfillOnly ? { ocrBackfillOnly: true } : {}),
    ...(options?.odlHybridBackfill ? { odlHybridBackfill: true } : {}),
    ...(options?.odlWarmOnly ? { odlWarmOnly: true } : {}),
    ...(options?.odlPreviewReset ? { odlPreviewReset: true } : {}),
    ...(options?.odlProgressiveBatch ? { odlProgressiveBatch: true } : {}),
    ...(options?.odlSkipLocalWarm ? { odlSkipLocalWarm: true } : {}),
    ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  })
  return result
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

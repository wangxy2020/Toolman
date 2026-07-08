import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  TranslationDocumentParsePagesOutputSchema,
  IpcChannel,
  type PdfParserBackend,
  type TranslationLanguage,
} from '@toolman/shared'
import { useTranslate } from '../chat/useTranslate'
import {
  cachePageState,
  getCachedSourceText,
  hydratePagesFromCache,
  setCachedSourceText,
} from './document-page-cache'
import { applySavedPageSnapshots } from './document-page-snapshots'
import {
  hasDisplayableParsePreviewContent,
  hasUsableParsePreviewContent,
  HYBRID_UNAVAILABLE_ERROR,
  isTranslationPageSourceInsufficient,
  NO_VALID_PAGE_TEXT,
  sanitizeParsePreviewContent,
} from './translation-page-source-quality'
import type { TranslationDocumentPageSnapshot } from './translation-storage'

export type DocumentPageStatus =
  | 'idle'
  | 'loading-source'
  | 'parsing'
  | 'translating'
  | 'done'
  | 'parsed'
  | 'error'
  | 'empty'

export interface DocumentPageState {
  pageNumber: number
  sourceText: string
  translatedText: string
  parsedMarkdown?: string
  status: DocumentPageStatus
  error?: string
}

interface Options {
  filePath: string | null
  documentId: string | null
  workspaceId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  pdfParserBackend: PdfParserBackend
  enabled: boolean
  savedPageSnapshots?: TranslationDocumentPageSnapshot[]
}

const PARSE_TIMEOUT_MS = 20_000
/** Full-document ODL parse — includes Hybrid OCR when enabled in app settings. */
const ODL_PARSE_TIMEOUT_MS = 45 * 60 * 1000
/** First progressive batch — fewer pages for faster first structured preview (IMA-style). */
const ODL_PROGRESSIVE_FIRST_BATCH = 2
/** Subsequent progressive Hybrid OCR batches. */
const ODL_PROGRESSIVE_BATCH_SIZE = 4
/** Per-page budget for vision OCR backfill (scanned PDFs, phase 3). */
const PDF_OCR_PAGE_TIMEOUT_MS = 120_000
const PDF_METADATA_TIMEOUT_MS = 15_000
/** Prefetch source text this many pages ahead while translating. */
const SOURCE_PREFETCH_AHEAD = 10
/** OCR backfill concurrency — one page per IPC call, N pages in parallel for faster scans. */
const OCR_BACKFILL_CONCURRENCY = 2
/** Prefetch OCR backfill this many pages ahead while scrolling scanned PDFs. */
const OCR_PREFETCH_AHEAD = 4
/** Batch source prefetch up to this many pages per IPC call when translating. */
const SOURCE_PREFETCH_BATCH = 10
/** Translate this many pages concurrently (parse stays batched separately). */
const TRANSLATE_CONCURRENCY = 2

function resolvedPageCount(totalPages: number, pagesLength: number): number {
  return Math.max(totalPages, pagesLength)
}

function reorderQueueFront(queue: number[], pageNumber: number): void {
  const index = queue.indexOf(pageNumber)
  if (index <= 0) return
  queue.splice(index, 1)
  queue.unshift(pageNumber)
}

function sortQueueWithPriority(queue: number[], priorityPage: number | null | undefined): void {
  queue.sort((left, right) => left - right)
  if (priorityPage && priorityPage > 0) {
    reorderQueueFront(queue, priorityPage)
  }
}

function enqueuePage(queue: number[], pageNumber: number, priority = false): void {
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

function isPdfPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf')
}

function resolveTranslationSourceText(text?: string, markdown?: string): string {
  const rawMarkdown = markdown?.trim() ?? ''
  const rawPlain = text?.trim() ?? rawMarkdown
  const { text: plain, markdown: md } = sanitizeParsePreviewContent(rawPlain, rawMarkdown)
  if (!hasDisplayableParsePreviewContent(plain, md)) return ''
  return plain.trim() || md.trim()
}


function resolveParseTimeoutMs(
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

function resolveProgressiveBatchTimeoutMs(
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

function buildOdlProgressiveParseBatches(totalPages: number): Array<{ start: number; end: number }> {
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

async function invokeParsePages(
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
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

export function useDocumentPageTranslation({
  filePath,
  documentId,
  workspaceId,
  modelId,
  languages,
  autoDetectSource,
  pdfParserBackend,
  enabled,
  savedPageSnapshots,
}: Options) {
  const { translate } = useTranslate()
  const [totalPages, setTotalPages] = useState(0)
  const [pages, setPages] = useState<DocumentPageState[]>([])
  /** PDF page height / width in points (FitH aspect). */
  const [pageAspect, setPageAspect] = useState<number | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  /** User must click translate (or scroll after starting) before pages auto-translate. */
  const [translationArmed, setTranslationArmed] = useState(false)
  /** User clicked parse — show OpenDataLoader text on the right without translating. */
  const [parseArmed, setParseArmed] = useState(false)
  /** Phase 1: full-document ODL warm in progress (header status). */
  const [odlWarmRunning, setOdlWarmRunning] = useState(false)
  const [hybridBackfillRunning, setHybridBackfillRunning] = useState(false)
  const parseArmedRef = useRef(false)
  const odlWarmRunningRef = useRef(false)
  const hybridBackfillRunningRef = useRef(false)
  const inFlightRef = useRef<Set<number>>(new Set())
  const translateQueueRef = useRef<number[]>([])
  const translateWorkerRunningRef = useRef(false)
  const ocrQueueRef = useRef<number[]>([])
  const ocrWorkerRunningRef = useRef(false)
  const centralOcrPipelineRef = useRef(false)
  /** Pages glm-ocr already tried after ODL+Hybrid — do not re-queue on scroll. */
  const ocrExhaustedRef = useRef<Set<number>>(new Set())
  const pagesRef = useRef<DocumentPageState[]>([])
  const totalPagesRef = useRef(0)
  /** In-flight batch parse per page number (shared promise for coalesced IPC). */
  const pageSourceLoadRef = useRef<Map<number, Promise<void>>>(new Map())
  const translationParamsRef = useRef({ modelId, languages, autoDetectSource })
  const savedPageSnapshotsRef = useRef(savedPageSnapshots)
  const generationRef = useRef(0)
  /** Page jump / header navigation — processed first in parse & translate queues. */
  const focusPageRef = useRef<number | null>(null)

  useEffect(() => {
    translationParamsRef.current = { modelId, languages, autoDetectSource }
    savedPageSnapshotsRef.current = savedPageSnapshots
  }, [autoDetectSource, languages, modelId, savedPageSnapshots])

  useEffect(() => {
    parseArmedRef.current = parseArmed
  }, [parseArmed])

  useEffect(() => {
    odlWarmRunningRef.current = odlWarmRunning
  }, [odlWarmRunning])

  useEffect(() => {
    hybridBackfillRunningRef.current = hybridBackfillRunning
  }, [hybridBackfillRunning])

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    totalPagesRef.current = totalPages
  }, [totalPages])

  const updatePage = useCallback(
    (pageNumber: number, patch: Partial<DocumentPageState>) => {
      setPages((prev) => {
        const pageLimit = resolvedPageCount(totalPagesRef.current, prev.length)
        const index = prev.findIndex((page) => page.pageNumber === pageNumber)
        if (index === -1 && pageLimit > 0 && pageNumber > pageLimit) {
          return prev
        }
        let next: DocumentPageState[]
        if (index === -1) {
          next = [
            ...prev,
            {
              pageNumber,
              sourceText: '',
              translatedText: '',
              status: 'idle',
              ...patch,
            } as DocumentPageState,
          ].sort((left, right) => left.pageNumber - right.pageNumber)
        } else {
          next = prev.map((page) =>
            page.pageNumber === pageNumber ? { ...page, ...patch } : page,
          )
        }
        pagesRef.current = next
        const updated = next.find((page) => page.pageNumber === pageNumber)
        if (updated && documentId && filePath) {
          cachePageState(documentId, filePath, modelId, languages, autoDetectSource, updated)
        }
        return next
      })
    },
    [autoDetectSource, documentId, filePath, languages, modelId],
  )

  const ensurePageSlots = useCallback((count: number) => {
    const safeCount = Math.max(1, Math.floor(count))
    const prev = pagesRef.current
    if (prev.length >= safeCount) return
    const next = [...prev]
    for (let pageNumber = prev.length + 1; pageNumber <= safeCount; pageNumber += 1) {
      next.push({
        pageNumber,
        sourceText: '',
        translatedText: '',
        status: 'idle',
      })
    }
    pagesRef.current = next
    setPages(next)
  }, [])

  const commitTotalPages = useCallback(
    (incoming: number) => {
      if (incoming < 1) return
      setTotalPages((prev) => {
        const next = Math.max(prev, incoming)
        totalPagesRef.current = next
        ensurePageSlots(next)
        return next
      })
    },
    [ensurePageSlots],
  )

  const applyParsedSourcePage = useCallback(
    (pageNumber: number, text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isTranslationPageSourceInsufficient(trimmed)) return false
      setCachedSourceText(filePath!, pageNumber, trimmed)
      const existing = pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (
        existing &&
        !existing.sourceText.trim() &&
        (existing.status === 'idle' || existing.status === 'loading-source')
      ) {
        updatePage(pageNumber, { sourceText: trimmed, status: 'idle', error: undefined })
      }
      return true
    },
    [filePath, updatePage],
  )

  const fetchPageSourcesBatch = useCallback(
    async (fromPage: number, toPage: number, generation: number): Promise<void> => {
      if (!filePath || !enabled) return
      const total = totalPagesRef.current || pagesRef.current.length
      if (total < 1) return

      const start = Math.max(1, Math.floor(fromPage))
      const end = Math.min(total, Math.floor(toPage))
      if (start > end) return

      const missing: number[] = []
      for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
        if (pageSourceLoadRef.current.has(pageNumber)) continue
        const existing = pagesRef.current.find((page) => page.pageNumber === pageNumber)
        if (existing?.sourceText.trim()) continue
        const fromParse = existing
          ? resolveTranslationSourceText(existing.translatedText, existing.parsedMarkdown)
          : ''
        if (fromParse) {
          applyParsedSourcePage(pageNumber, fromParse)
          continue
        }
        const cached = getCachedSourceText(filePath, pageNumber)?.trim()
        if (cached && !isTranslationPageSourceInsufficient(cached)) continue
        missing.push(pageNumber)
      }
      if (missing.length === 0) return

      const batchStart = missing[0]!
      const batchEnd = missing[missing.length - 1]!

      const batchPromise = (async () => {
        try {
          const backend = isPdfPath(filePath) ? 'opendataloader' : pdfParserBackend
          const result = await withTimeout(
            invokeParsePages(filePath, batchStart, batchEnd, workspaceId, backend, {
              ...(isPdfPath(filePath)
                ? {
                    odlPreviewOnly: true,
                    odlProgressiveBatch: hybridBackfillRunningRef.current,
                    odlSkipLocalWarm: hybridBackfillRunningRef.current,
                  }
                : {}),
              timeoutMs: isPdfPath(filePath)
                ? resolveProgressiveBatchTimeoutMs(
                    filePath,
                    batchEnd - batchStart + 1,
                    hybridBackfillRunningRef.current,
                  )
                : resolveParseTimeoutMs(filePath),
            }),
            isPdfPath(filePath)
              ? resolveProgressiveBatchTimeoutMs(
                  filePath,
                  batchEnd - batchStart + 1,
                  hybridBackfillRunningRef.current,
                )
              : resolveParseTimeoutMs(filePath),
            '预加载页面超时',
          )
          if (generation !== generationRef.current || !result.ok) return

          const data = TranslationDocumentParsePagesOutputSchema.parse(result.data)
          if (data.totalPages > 0) {
            commitTotalPages(data.totalPages)
          }
          for (const page of data.pages) {
            const source = resolveTranslationSourceText(page.text, page.markdown)
            if (source) applyParsedSourcePage(page.pageNumber, source)
          }
        } catch {
          // Prefetch is best-effort; translate path will retry.
        }
      })()

      for (const pageNumber of missing) {
        pageSourceLoadRef.current.set(pageNumber, batchPromise)
      }

      try {
        await batchPromise
      } finally {
        for (const pageNumber of missing) {
          if (pageSourceLoadRef.current.get(pageNumber) === batchPromise) {
            pageSourceLoadRef.current.delete(pageNumber)
          }
        }
      }
    },
    [applyParsedSourcePage, commitTotalPages, enabled, filePath, pdfParserBackend, workspaceId],
  )

  const prefetchPageSources = useCallback(
    (fromPage: number, toPage: number, generation: number) => {
      void fetchPageSourcesBatch(fromPage, toPage, generation)
    },
    [fetchPageSourcesBatch],
  )

  const scheduleSourcePrefetch = useCallback(
    (anchorPage: number, generation: number) => {
      const total = totalPagesRef.current || pagesRef.current.length
      if (total < 1) return
      const from = anchorPage + 1
      const to = Math.min(total, anchorPage + SOURCE_PREFETCH_AHEAD)
      if (from > to) return
      void prefetchPageSources(from, to, generation)
    },
    [prefetchPageSources],
  )

  const loadPageSource = useCallback(
    async (pageNumber: number, generation: number): Promise<string> => {
      if (!filePath) return ''
      const existing = pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (existing?.sourceText.trim()) return existing.sourceText

      const fromParse = existing
        ? resolveTranslationSourceText(existing.translatedText, existing.parsedMarkdown)
        : ''
      if (fromParse) {
        setCachedSourceText(filePath, pageNumber, fromParse)
        updatePage(pageNumber, { sourceText: fromParse, status: 'idle', error: undefined })
        return fromParse
      }

      const cachedSource = getCachedSourceText(filePath, pageNumber)
      if (cachedSource?.trim()) {
        if (isTranslationPageSourceInsufficient(cachedSource)) {
          updatePage(pageNumber, {
            sourceText: '',
            status: 'empty',
            error: NO_VALID_PAGE_TEXT,
          })
          return ''
        }
        updatePage(pageNumber, {
          sourceText: cachedSource,
          status: 'idle',
          error: undefined,
        })
        return cachedSource
      }

      const inflight = pageSourceLoadRef.current.get(pageNumber)
      if (inflight) {
        try {
          await inflight
        } catch {
          // Batch parse failed; fall through to retry below.
        }
        if (generation !== generationRef.current) return ''
        const afterBatch = pagesRef.current.find((page) => page.pageNumber === pageNumber)
        if (afterBatch?.sourceText.trim()) {
          scheduleSourcePrefetch(pageNumber, generation)
          return afterBatch.sourceText
        }
        const cachedAfterBatch = getCachedSourceText(filePath, pageNumber)?.trim()
        if (cachedAfterBatch && !isTranslationPageSourceInsufficient(cachedAfterBatch)) {
          updatePage(pageNumber, {
            sourceText: cachedAfterBatch,
            status: 'idle',
            error: undefined,
          })
          scheduleSourcePrefetch(pageNumber, generation)
          return cachedAfterBatch
        }
      }

      updatePage(pageNumber, { status: 'loading-source', error: undefined })
      try {
        await fetchPageSourcesBatch(pageNumber, pageNumber, generation)
        if (generation !== generationRef.current) return ''

        const resolved = pagesRef.current.find((page) => page.pageNumber === pageNumber)
        const text =
          resolved?.sourceText.trim() ||
          getCachedSourceText(filePath, pageNumber)?.trim() ||
          ''
        const insufficient = !text || isTranslationPageSourceInsufficient(text)
        if (text && !insufficient) {
          setCachedSourceText(filePath, pageNumber, text)
        }
        updatePage(pageNumber, {
          sourceText: insufficient ? '' : text,
          status: insufficient ? 'empty' : 'idle',
          error: !text ? 'empty' : insufficient ? NO_VALID_PAGE_TEXT : undefined,
        })
        scheduleSourcePrefetch(pageNumber, generation)
        return insufficient ? '' : text
      } catch (error) {
        if (generation !== generationRef.current) return ''
        const message = error instanceof Error ? error.message : '解析页面失败'
        updatePage(pageNumber, { status: 'error', error: message })
        throw error
      }
    },
    [fetchPageSourcesBatch, filePath, scheduleSourcePrefetch, updatePage],
  )

  const executeTranslatePage = useCallback(
    async (pageNumber: number, generation: number) => {
      if (!enabled || !filePath || !modelId) return

      const current = pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (current?.status === 'done' && current.translatedText.trim()) return
      if (current?.status === 'empty') return

      scheduleSourcePrefetch(pageNumber, generation)

      inFlightRef.current.add(pageNumber)
      try {
        const sourceText = current?.sourceText.trim()
          ? current.sourceText
          : await loadPageSource(pageNumber, generation)
        if (generation !== generationRef.current) return
        if (!sourceText.trim() || isTranslationPageSourceInsufficient(sourceText)) {
          updatePage(pageNumber, {
            status: 'empty',
            translatedText: '',
            sourceText: '',
            error: NO_VALID_PAGE_TEXT,
          })
          return
        }

        updatePage(pageNumber, { status: 'translating', error: undefined })
        const result = await translate({
          text: sourceText,
          modelId,
          translationLanguages: languages,
          autoDetectSource,
        })
        if (generation !== generationRef.current) return
        updatePage(pageNumber, {
          status: 'done',
          translatedText: result.text,
          error: undefined,
        })
      } catch (error) {
        if (generation !== generationRef.current) return
        updatePage(pageNumber, {
          status: 'error',
          error: error instanceof Error ? error.message : 'translate failed',
        })
      } finally {
        inFlightRef.current.delete(pageNumber)
        if (generation !== generationRef.current) {
          const stuck = pagesRef.current.find((page) => page.pageNumber === pageNumber)
          if (stuck?.status === 'translating' || stuck?.status === 'loading-source') {
            updatePage(pageNumber, { status: 'idle', error: undefined })
          }
        }
      }
    },
    [autoDetectSource, enabled, filePath, languages, loadPageSource, modelId, scheduleSourcePrefetch, translate, updatePage],
  )

  const applyParseResults = useCallback(
    (
      pageNumbers: number[],
      pagesData: Array<{ pageNumber: number; text?: string; markdown?: string }>,
      options?: { emptyAsParsing?: boolean; previewLenient?: boolean },
    ): number[] => {
      const emptyAsParsing = options?.emptyAsParsing ?? false
      const previewLenient = options?.previewLenient ?? false
      const byPage = new Map(pagesData.map((page) => [page.pageNumber, page]))
      const emptyPages: number[] = []
      const patches = new Map<number, Partial<DocumentPageState>>()

      for (const pageNumber of pageNumbers) {
        const row = byPage.get(pageNumber)
        const rawMarkdown = row?.markdown?.trim() ?? row?.text?.trim() ?? ''
        const rawPlain = row?.text?.trim() ?? rawMarkdown
        const { text: plain, markdown } = sanitizeParsePreviewContent(rawPlain, rawMarkdown)
        const hasContent = previewLenient
          ? hasDisplayableParsePreviewContent(plain, markdown)
          : hasUsableParsePreviewContent(plain, markdown)
        const sourceForTranslate = resolveTranslationSourceText(rawPlain, rawMarkdown)
        if (hasContent) {
          patches.set(pageNumber, {
            status: 'parsed',
            translatedText: plain.trim() || rawPlain,
            parsedMarkdown: markdown.trim() || rawMarkdown,
            sourceText: sourceForTranslate,
            error: undefined,
          })
        } else {
          emptyPages.push(pageNumber)
          patches.set(pageNumber, {
            status: emptyAsParsing ? 'parsing' : 'empty',
            translatedText: plain.trim() || rawPlain,
            parsedMarkdown: markdown.trim() || rawMarkdown,
            error: emptyAsParsing ? undefined : 'empty',
          })
        }
      }

      setPages((prev) => {
        const pageLimit = resolvedPageCount(totalPagesRef.current, prev.length)
        let next = prev.map((page) => {
          const patch = patches.get(page.pageNumber)
          return patch ? { ...page, ...patch } : page
        })
        for (const pageNumber of pageNumbers) {
          if (next.some((page) => page.pageNumber === pageNumber)) continue
          if (pageLimit > 0 && pageNumber > pageLimit) continue
          const patch = patches.get(pageNumber)
          if (!patch) continue
          next = [
            ...next,
            {
              pageNumber,
              sourceText: '',
              translatedText: '',
              status: 'idle' as const,
              ...patch,
            },
          ].sort((left, right) => left.pageNumber - right.pageNumber)
        }
        pagesRef.current = next
        if (documentId && filePath) {
          for (const pageNumber of pageNumbers) {
            const updated = next.find((page) => page.pageNumber === pageNumber)
            if (updated) {
              cachePageState(
                documentId,
                filePath,
                modelId,
                languages,
                autoDetectSource,
                updated,
              )
            }
          }
        }
        return next
      })

      return emptyPages
    },
    [autoDetectSource, documentId, filePath, languages, modelId],
  )

  const runOcrBackfillBatch = useCallback(
    async (pageNumbers: number[], generation: number) => {
      if (!enabled || !filePath || pageNumbers.length === 0) return

      const toProcess = pageNumbers.filter((pageNumber) => {
        const current = pagesRef.current.find((page) => page.pageNumber === pageNumber)
        if (current?.status === 'parsed') return false
        return (
          current?.status === 'empty' ||
          current?.status === 'parsing' ||
          (current?.status === 'error' && current.error === HYBRID_UNAVAILABLE_ERROR)
        )
      })
      if (toProcess.length === 0) return

      const start = Math.min(...toProcess)
      const end = Math.max(...toProcess)
      const batchTimeoutMs = resolveParseTimeoutMs(filePath, false, toProcess.length)

      for (const pageNumber of toProcess) {
        inFlightRef.current.add(pageNumber)
        updatePage(pageNumber, { status: 'parsing', error: undefined })
      }

      try {
        const result = await withTimeout(
          invokeParsePages(filePath, start, end, workspaceId, 'opendataloader', {
            odlPreviewOnly: true,
            ocrBackfillOnly: true,
            timeoutMs: batchTimeoutMs,
          }),
          batchTimeoutMs,
          'OCR 识别超时',
        )
        if (!result.ok) {
          if (generation !== generationRef.current) return
          for (const pageNumber of toProcess) {
            updatePage(pageNumber, { status: 'empty', error: 'empty' })
          }
          return
        }

        const data = TranslationDocumentParsePagesOutputSchema.parse(result.data)
        commitTotalPages(data.totalPages)
        const stillEmpty = applyParseResults(toProcess, data.pages)
        for (const pageNumber of toProcess) {
          if (stillEmpty.includes(pageNumber)) {
            ocrExhaustedRef.current.add(pageNumber)
            updatePage(pageNumber, { status: 'empty', error: NO_VALID_PAGE_TEXT })
          }
        }
      } catch (error) {
        if (generation !== generationRef.current) {
          for (const pageNumber of toProcess) {
            const stuck = pagesRef.current.find((page) => page.pageNumber === pageNumber)
            if (stuck?.status === 'parsing') {
              updatePage(pageNumber, { status: 'empty', error: 'empty' })
            }
          }
          return
        }
        const message = error instanceof Error ? error.message : 'ocr failed'
        for (const pageNumber of toProcess) {
          updatePage(pageNumber, { status: 'error', error: message })
        }
      } finally {
        for (const pageNumber of toProcess) {
          inFlightRef.current.delete(pageNumber)
        }
      }
    },
    [applyParseResults, commitTotalPages, enabled, filePath, updatePage, workspaceId],
  )

  const drainOcrQueue = useCallback(async () => {
    if (ocrWorkerRunningRef.current) return
    ocrWorkerRunningRef.current = true
    let firstWave = true
    try {
      while (ocrQueueRef.current.length > 0) {
        sortQueueWithPriority(ocrQueueRef.current, focusPageRef.current)
        const generation = generationRef.current
        const wave: number[] = []
        const waveLimit = firstWave ? 1 : OCR_BACKFILL_CONCURRENCY
        firstWave = false
        while (wave.length < waveLimit && ocrQueueRef.current.length > 0) {
          const pageNumber = ocrQueueRef.current.shift()
          if (pageNumber === undefined) break
          const current = pagesRef.current.find((page) => page.pageNumber === pageNumber)
          if (current?.status === 'parsed') continue
          wave.push(pageNumber)
        }
        if (wave.length === 0) break
        await runOcrBackfillBatch(wave, generation)
      }
    } finally {
      ocrWorkerRunningRef.current = false
      if (ocrQueueRef.current.length === 0) {
        centralOcrPipelineRef.current = false
      }
      if (ocrQueueRef.current.length > 0) {
        void drainOcrQueue()
      }
    }
  }, [runOcrBackfillBatch])

  const queueOcrBackfill = useCallback(
    (pageNumber: number, priority = false) => {
      if (!enabled || !filePath || odlWarmRunningRef.current || hybridBackfillRunningRef.current) {
        return false
      }
      if (centralOcrPipelineRef.current) return false
      if (ocrExhaustedRef.current.has(pageNumber)) return false
      const current = pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (current?.status !== 'empty') return false
      if (inFlightRef.current.has(pageNumber)) return false
      if (ocrQueueRef.current.includes(pageNumber)) return false
      enqueuePage(ocrQueueRef.current, pageNumber, priority)
      void drainOcrQueue()
      return true
    },
    [drainOcrQueue, enabled, filePath],
  )

  const drainTranslateQueue = useCallback(async () => {
    if (translateWorkerRunningRef.current) return
    translateWorkerRunningRef.current = true
    try {
      while (translateQueueRef.current.length > 0) {
        sortQueueWithPriority(translateQueueRef.current, focusPageRef.current)
        const generation = generationRef.current
        const batch: number[] = []
        while (batch.length < TRANSLATE_CONCURRENCY && translateQueueRef.current.length > 0) {
          const pageNumber = translateQueueRef.current.shift()
          if (pageNumber === undefined) break
          batch.push(pageNumber)
        }
        if (batch.length === 0) break
        await Promise.all(batch.map((pageNumber) => executeTranslatePage(pageNumber, generation)))
      }
    } finally {
      translateWorkerRunningRef.current = false
      if (translateQueueRef.current.length > 0) {
        void drainTranslateQueue()
      }
    }
  }, [executeTranslatePage])

  const translatePage = useCallback(
    (pageNumber: number, priority = false) => {
      if (!enabled || !filePath || !modelId) return false
      if (inFlightRef.current.has(pageNumber)) return false

      const current = pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (current?.status === 'done' && current.translatedText.trim()) return false
      if (current?.status === 'empty') return false

      if (!translateQueueRef.current.includes(pageNumber)) {
        updatePage(pageNumber, {
          status: current?.sourceText.trim() ? 'translating' : 'loading-source',
          error: undefined,
        })
      }
      enqueuePage(translateQueueRef.current, pageNumber, priority)
      void drainTranslateQueue()
      return true
    },
    [drainTranslateQueue, enabled, filePath, modelId, updatePage],
  )

  const focusPage = useCallback(
    (pageNumber: number) => {
      const pageLimit = resolvedPageCount(totalPagesRef.current, pagesRef.current.length)
      const safePage = Math.max(1, Math.min(pageLimit || pageNumber, Math.floor(pageNumber)))
      focusPageRef.current = safePage

      if (parseArmed) {
        queueOcrBackfill(safePage, true)
        const prefetchEnd = Math.min(pageLimit, safePage + OCR_PREFETCH_AHEAD)
        for (let next = safePage + 1; next <= prefetchEnd; next += 1) {
          queueOcrBackfill(next)
        }
        return
      }

      if (translationArmed) {
        translatePage(safePage, true)
        void prefetchPageSources(
          safePage,
          Math.min(pageLimit, safePage + SOURCE_PREFETCH_BATCH - 1),
          generationRef.current,
        )
      }
    },
    [parseArmed, prefetchPageSources, queueOcrBackfill, translatePage, translationArmed],
  )

  const ensurePageReady = useCallback(
    async (pageNumber: number) => {
      if (!enabled || pageNumber < 1) return
      const pageLimit = resolvedPageCount(totalPagesRef.current, pagesRef.current.length)
      if (pageLimit > 0 && pageNumber > pageLimit) return
      if (parseArmed) {
        queueOcrBackfill(pageNumber)
        const prefetchEnd = Math.min(pageLimit, pageNumber + OCR_PREFETCH_AHEAD)
        for (let next = pageNumber + 1; next <= prefetchEnd; next += 1) {
          queueOcrBackfill(next)
        }
        return
      }
      if (!translationArmed) return
      await translatePage(pageNumber)
    },
    [enabled, parseArmed, queueOcrBackfill, translatePage, translationArmed],
  )

  const stopParse = useCallback(() => {
    generationRef.current += 1
    ocrQueueRef.current = []
    ocrWorkerRunningRef.current = false
    centralOcrPipelineRef.current = false
    ocrExhaustedRef.current.clear()
    setOdlWarmRunning(false)
    setHybridBackfillRunning(false)
    setParseArmed(false)
    setPages((prev) => {
      const next = prev.map((page) =>
        page.status === 'parsing'
          ? { ...page, status: 'empty' as const, error: 'empty' as const }
          : page,
      )
      pagesRef.current = next
      return next
    })
    inFlightRef.current.clear()
  }, [])

  const stopTranslation = useCallback(() => {
    generationRef.current += 1
    translateQueueRef.current = []
    translateWorkerRunningRef.current = false
    pageSourceLoadRef.current.clear()
    setTranslationArmed(false)
    setPages((prev) => {
      const next = prev.map((page) =>
        page.status === 'translating' || page.status === 'loading-source'
          ? { ...page, status: 'idle' as const, error: undefined }
          : page,
      )
      pagesRef.current = next
      return next
    })
    inFlightRef.current.clear()
  }, [])

  const startParse = useCallback(() => {
    if (pagesRef.current.length === 0) return false

    setParseArmed(true)
    setTranslationArmed(false)
    translateQueueRef.current = []

    let resetPages = pagesRef.current.map((page) => {
      if (page.status === 'parsing' || page.status === 'translating' || page.status === 'loading-source') {
        return { ...page, status: 'idle' as const, error: undefined }
      }
      return page
    })

    let pending = resetPages.filter((page) => {
      if (page.status === 'done') return false
      if (page.status === 'empty') return false
      if (page.status === 'parsed') {
        const sanitized = sanitizeParsePreviewContent(page.translatedText, page.parsedMarkdown)
        return !hasUsableParsePreviewContent(sanitized.text, sanitized.markdown)
      }
      return page.status === 'idle' || page.status === 'error'
    })

    resetPages = resetPages.map((page) => {
      if (page.status !== 'parsed') return page
      const sanitized = sanitizeParsePreviewContent(page.translatedText, page.parsedMarkdown)
      if (
        sanitized.text === page.translatedText &&
        sanitized.markdown === (page.parsedMarkdown ?? '')
      ) {
        return page
      }
      const hasContent = hasUsableParsePreviewContent(sanitized.text, sanitized.markdown)
      return {
        ...page,
        translatedText: sanitized.text,
        parsedMarkdown: sanitized.markdown,
        status: hasContent ? ('parsed' as const) : ('empty' as const),
        error: hasContent ? undefined : 'empty',
      }
    })

    pending = resetPages.filter((page) => {
      if (page.status === 'done') return false
      if (page.status === 'empty') return false
      if (page.status === 'parsed') {
        const sanitized = sanitizeParsePreviewContent(page.translatedText, page.parsedMarkdown)
        return !hasUsableParsePreviewContent(sanitized.text, sanitized.markdown)
      }
      return page.status === 'idle' || page.status === 'error'
    })

    if (pending.length === 0) {
      pagesRef.current = resetPages
      setPages(resetPages)
      setParseArmed(true)
      return true
    }

    const count = totalPagesRef.current || resetPages.length
    if (count > 0) ensurePageSlots(count)

    const pendingNumbers = new Set(pending.map((page) => page.pageNumber))
    for (const page of pagesRef.current) {
      if (page.pageNumber <= count && page.status === 'idle' && !pendingNumbers.has(page.pageNumber)) {
        pendingNumbers.add(page.pageNumber)
      }
    }

    const priorByPage = new Map(resetPages.map((page) => [page.pageNumber, page]))
    resetPages = pagesRef.current.map((page) =>
      pendingNumbers.has(page.pageNumber)
        ? {
            ...page,
            status: 'parsing' as const,
            error: undefined,
            translatedText: '',
            parsedMarkdown: '',
          }
        : priorByPage.get(page.pageNumber) ?? page,
    )

    pagesRef.current = resetPages
    setPages(resetPages)

    const generation = ++generationRef.current
    ocrQueueRef.current = []
    ocrExhaustedRef.current = new Set(
      resetPages.filter((page) => page.status === 'empty').map((page) => page.pageNumber),
    )
    setOdlWarmRunning(true)

    void (async () => {
      try {
        const total = totalPagesRef.current || resetPages.length
        setHybridBackfillRunning(true)
        const batches = buildOdlProgressiveParseBatches(total)
        let skipLocalWarm = false
        const allEmptyPages: number[] = []

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          if (generation !== generationRef.current) return
          const { start, end } = batches[batchIndex]!
          const batchPageNumbers = Array.from(
            { length: end - start + 1 },
            (_, index) => start + index,
          )
          const batchTimeoutMs = resolveProgressiveBatchTimeoutMs(
            filePath!,
            batchPageNumbers.length,
            skipLocalWarm,
          )

          const result = await withTimeout(
            invokeParsePages(filePath!, start, end, workspaceId, 'opendataloader', {
              odlPreviewOnly: true,
              odlProgressiveBatch: true,
              odlSkipLocalWarm: skipLocalWarm,
              odlPreviewReset: batchIndex === 0,
              timeoutMs: batchTimeoutMs,
            }),
            batchTimeoutMs,
            'OpenDataLoader 解析超时',
          )
          if (generation !== generationRef.current) return
          if (!result.ok) {
            setPages((prev) => {
              const next = prev.map((page) =>
                batchPageNumbers.includes(page.pageNumber)
                  ? { ...page, status: 'error' as const, error: result.error.message }
                  : page,
              )
              pagesRef.current = next
              return next
            })
            return
          }

          const data = TranslationDocumentParsePagesOutputSchema.parse(result.data)
          commitTotalPages(data.totalPages)
          if (data.odlScanDetected) skipLocalWarm = true

          const emptyInBatch = applyParseResults(batchPageNumbers, data.pages, {
            emptyAsParsing: true,
            previewLenient: true,
          })
          allEmptyPages.push(...emptyInBatch)

          // Page-range hybrid failed — fall back to one full-document Hybrid run (known good for scans).
          if (
            skipLocalWarm &&
            batchIndex > 0 &&
            emptyInBatch.length === batchPageNumbers.length
          ) {
            const remainingPages = Array.from({ length: total }, (_, index) => index + 1).filter(
              (pageNumber) => {
                const page = pagesRef.current.find((item) => item.pageNumber === pageNumber)
                return page?.status === 'parsing' || page?.status === 'empty'
              },
            )
            if (remainingPages.length > 0) {
              const fullResult = await withTimeout(
                invokeParsePages(filePath!, 1, total, workspaceId, 'opendataloader', {
                  odlPreviewOnly: true,
                  fullDocument: true,
                  timeoutMs: ODL_PARSE_TIMEOUT_MS,
                }),
                ODL_PARSE_TIMEOUT_MS,
                'OpenDataLoader 解析超时',
              )
              if (generation !== generationRef.current) return
              if (fullResult.ok) {
                const fullData = TranslationDocumentParsePagesOutputSchema.parse(fullResult.data)
                commitTotalPages(fullData.totalPages)
                const emptyRest = applyParseResults(remainingPages, fullData.pages, {
                  emptyAsParsing: true,
                  previewLenient: true,
                })
                allEmptyPages.push(...emptyRest)
              }
              break
            }
          }

          // Digital PDF: local ODL has text — finish remaining pages in one fast full-document run.
          if (!data.odlScanDetected && batchIndex === 0 && end < total) {
            const fullTimeoutMs = Math.min(ODL_PARSE_TIMEOUT_MS, 120_000)
            const fullResult = await withTimeout(
              invokeParsePages(filePath!, 1, total, workspaceId, 'opendataloader', {
                odlPreviewOnly: true,
                fullDocument: true,
                timeoutMs: fullTimeoutMs,
              }),
              fullTimeoutMs,
              'OpenDataLoader 解析超时',
            )
            if (generation !== generationRef.current) return
            if (!fullResult.ok) {
              setPages((prev) => {
                const next = prev.map((page) =>
                  page.pageNumber > end && pending.some((item) => item.pageNumber === page.pageNumber)
                    ? { ...page, status: 'error' as const, error: fullResult.error.message }
                    : page,
                )
                pagesRef.current = next
                return next
              })
              return
            }
            const fullData = TranslationDocumentParsePagesOutputSchema.parse(fullResult.data)
            commitTotalPages(fullData.totalPages)
            const remainingPages = Array.from({ length: total }, (_, index) => index + 1).filter(
              (pageNumber) => pageNumber > end,
            )
            const emptyRest = applyParseResults(remainingPages, fullData.pages, {
              emptyAsParsing: true,
              previewLenient: true,
            })
            allEmptyPages.push(...emptyRest)
            break
          }
        }

        if (generation !== generationRef.current) return

        const uniqueEmpty = [...new Set(allEmptyPages)]
        if (uniqueEmpty.length > 0) {
          setPages((prev) => {
            const next = prev.map((page) =>
              uniqueEmpty.includes(page.pageNumber) && page.status === 'parsing'
                ? {
                    ...page,
                    status: 'empty' as const,
                    error: NO_VALID_PAGE_TEXT,
                    translatedText: '',
                    parsedMarkdown: '',
                  }
                : page,
            )
            pagesRef.current = next
            for (const pageNumber of uniqueEmpty) {
              ocrExhaustedRef.current.add(pageNumber)
              if (documentId && filePath) {
                const updated = next.find((page) => page.pageNumber === pageNumber)
                if (updated) {
                  cachePageState(
                    documentId,
                    filePath,
                    modelId,
                    languages,
                    autoDetectSource,
                    updated,
                  )
                }
              }
            }
            return next
          })
        }
      } catch (error) {
        if (generation !== generationRef.current) return
        const message = error instanceof Error ? error.message : 'parse failed'
        setPages((prev) => {
          const next = prev.map((page) =>
            pending.some((item) => item.pageNumber === page.pageNumber)
              ? { ...page, status: 'error' as const, error: message }
              : page,
          )
          pagesRef.current = next
          return next
        })
      } finally {
        if (generation === generationRef.current) {
          setOdlWarmRunning(false)
          setHybridBackfillRunning(false)
        }
      }
    })()

    return true
  }, [applyParseResults, commitTotalPages, drainOcrQueue, ensurePageSlots, filePath, workspaceId])

  const startTranslation = useCallback(() => {
    if (!modelId || pagesRef.current.length === 0) return false

    setTranslationArmed(true)
    setParseArmed(false)
    ocrQueueRef.current = []
    let resetPages = pagesRef.current.map((page) => {
      if (page.status === 'empty') {
        return {
          ...page,
          status: 'idle' as const,
          sourceText: '',
          translatedText: '',
          parsedMarkdown: '',
          error: undefined,
        }
      }
      if (page.status === 'translating' || page.status === 'loading-source') {
        return { ...page, status: 'idle' as const, error: undefined }
      }
      return page
    })

    let pending = resetPages.filter(
      (page) => page.status === 'idle' || page.status === 'error',
    )

    // Explicit translate click: re-translate when every page is already done.
    if (pending.length === 0) {
      resetPages = resetPages.map((page) => {
        if (page.status !== 'done') return page
        return {
          ...page,
          status: 'idle' as const,
          translatedText: '',
          error: undefined,
        }
      })
      pending = resetPages.filter(
        (page) => page.status === 'idle' || page.status === 'error',
      )
    }

    if (pending.length === 0) return false

    pagesRef.current = resetPages
    setPages(resetPages)
    const generation = generationRef.current
    const pendingNumbers = pending.map((page) => page.pageNumber)
    sortQueueWithPriority(pendingNumbers, focusPageRef.current)
    const firstPending = pendingNumbers[0]!
    prefetchPageSources(
      firstPending,
      Math.min(
        totalPagesRef.current || resetPages.length,
        firstPending + SOURCE_PREFETCH_BATCH - 1,
      ),
      generation,
    )
    let queued = 0
    for (const pageNumber of pendingNumbers) {
      if (translatePage(pageNumber)) queued += 1
    }
    sortQueueWithPriority(translateQueueRef.current, focusPageRef.current)
    return queued > 0
  }, [modelId, prefetchPageSources, translatePage])

  // Bootstrap: only discover pages / load first-page source. Do not auto-translate.
  useEffect(() => {
    if (!enabled || !filePath || !documentId) {
      generationRef.current += 1
      setTotalPages(0)
      setPages([])
      setPageAspect(null)
      setBootstrapError(null)
      setBootstrapping(false)
      setTranslationArmed(false)
      setParseArmed(false)
      inFlightRef.current.clear()
      translateQueueRef.current = []
      ocrQueueRef.current = []
      pageSourceLoadRef.current.clear()
      return
    }

    const generation = ++generationRef.current
    let cancelled = false
    const snapshotsForRestore = savedPageSnapshots
    setBootstrapping(true)
    setBootstrapError(null)
    setPages([])
    setTotalPages(0)
    setPageAspect(null)
    setTranslationArmed(false)
    setParseArmed(false)
    inFlightRef.current.clear()
    translateQueueRef.current = []
    ocrQueueRef.current = []
    pageSourceLoadRef.current.clear()

    void (async () => {
      try {
        const metadataOnly = isPdfPath(filePath)
        const result = await withTimeout(
          invokeParsePages(filePath, 1, 1, workspaceId, pdfParserBackend, { metadataOnly }),
          resolveParseTimeoutMs(filePath, metadataOnly),
          metadataOnly ? '读取 PDF 信息超时，请重试' : '解析文档超时，请重试或用系统应用打开文件',
        )
        if (cancelled || generation !== generationRef.current) return
        if (!result.ok) {
          setBootstrapError(result.error.message)
          return
        }

        const data = TranslationDocumentParsePagesOutputSchema.parse(result.data)
        const count = Math.max(1, data.totalPages)
        commitTotalPages(count)
        if (data.pageWidth && data.pageHeight && data.pageWidth > 0) {
          setPageAspect(data.pageHeight / data.pageWidth)
        } else {
          setPageAspect(null)
        }

        const initialPages = applySavedPageSnapshots(
          hydratePagesFromCache({
            documentId,
            filePath,
            totalPages: count,
            modelId: translationParamsRef.current.modelId,
            languages: translationParamsRef.current.languages,
            autoDetectSource: translationParamsRef.current.autoDetectSource,
            seedPages: data.pages.map((page) => ({
              pageNumber: page.pageNumber,
              text: page.text,
            })),
          }),
          snapshotsForRestore ?? savedPageSnapshotsRef.current,
          {
            documentId,
            filePath,
            modelId: translationParamsRef.current.modelId,
            languages: translationParamsRef.current.languages,
            autoDetectSource: translationParamsRef.current.autoDetectSource,
          },
        )
        setPages(initialPages)
        pagesRef.current = initialPages
        for (const page of initialPages) {
          if (page.status === 'empty') {
            ocrExhaustedRef.current.add(page.pageNumber)
          }
        }
      } catch (error) {
        if (cancelled || generation !== generationRef.current) return
        setBootstrapError(error instanceof Error ? error.message : 'bootstrap failed')
      } finally {
        if (!cancelled && generation === generationRef.current) {
          setBootstrapping(false)
        }
      }
    })()

    return () => {
      cancelled = true
      generationRef.current += 1
      inFlightRef.current.clear()
      translateQueueRef.current = []
      ocrQueueRef.current = []
      pageSourceLoadRef.current.clear()
    }
  }, [commitTotalPages, documentId, enabled, filePath, pdfParserBackend, savedPageSnapshots, workspaceId])

  // Re-apply persisted page snapshots when the document record updates (e.g. after save or sidebar re-select).
  useEffect(() => {
    if (!enabled || !filePath || !documentId || !savedPageSnapshots?.length) return
    if (bootstrapping) return
    if (parseArmedRef.current || odlWarmRunningRef.current || hybridBackfillRunningRef.current) {
      return
    }

    setPages((prev) => {
      if (prev.length === 0) return prev
      const next = applySavedPageSnapshots(
        prev,
        savedPageSnapshots,
        {
          documentId,
          filePath,
          modelId,
          languages,
          autoDetectSource,
        },
        true,
      )
      pagesRef.current = next
      for (const page of next) {
        if (page.status === 'empty') {
          ocrExhaustedRef.current.add(page.pageNumber)
        }
      }
      return next
    })
  }, [
    autoDetectSource,
    bootstrapping,
    documentId,
    enabled,
    filePath,
    languages,
    modelId,
    savedPageSnapshots,
  ])

  // Translation model/language changes must not reset ODL preview pages or cancel parse IPC.
  useEffect(() => {
    const prev = translationParamsRef.current
    const unchanged =
      prev.modelId === modelId &&
      prev.languages[0] === languages[0] &&
      prev.languages[1] === languages[1] &&
      prev.autoDetectSource === autoDetectSource
    translationParamsRef.current = { modelId, languages, autoDetectSource }

    if (!enabled || !filePath || !documentId || unchanged) {
      return
    }

    translateQueueRef.current = []
    pageSourceLoadRef.current.clear()

    if (
      parseArmedRef.current ||
      pagesRef.current.some((page) => page.status === 'parsing' || page.status === 'parsed')
    ) {
      return
    }

    generationRef.current += 1
    inFlightRef.current.clear()
    ocrQueueRef.current = []

    const count = totalPagesRef.current
    if (count < 1) return

    setPages((prevPages) => {
      const next = applySavedPageSnapshots(
        hydratePagesFromCache({
          documentId,
          filePath,
          totalPages: count,
          modelId,
          languages,
          autoDetectSource,
          seedPages: prevPages.map((page) => ({
            pageNumber: page.pageNumber,
            text: page.sourceText,
          })),
        }),
        savedPageSnapshotsRef.current,
        {
          documentId,
          filePath,
          modelId,
          languages,
          autoDetectSource,
        },
      )
      pagesRef.current = next
      return next
    })
  }, [autoDetectSource, documentId, enabled, filePath, languages, modelId])

  const translatedText = pages
    .filter((page) => page.translatedText.trim())
    .map((page) => page.translatedText.trim())
    .join('\n\n')

  // Phase 1: ODL (+ Hybrid when enabled); phase 2: glm-ocr only when ODL exhausted.
  const parsingActive =
    odlWarmRunning || hybridBackfillRunning || pages.some((page) => page.status === 'parsing')

  const translateActive = pages.some(
    (page) => page.status === 'loading-source' || page.status === 'translating',
  )

  const busy = bootstrapping || parsingActive || translateActive

  const parseProgress = useMemo(() => {
    const total = Math.max(totalPages, pages.length)
    if (total < 1) return null
    if (!parseArmed && !parsingActive && !odlWarmRunning && !hybridBackfillRunning) {
      return null
    }
    const completed = pages.filter(
      (page) =>
        page.status === 'parsed' ||
        page.status === 'done' ||
        page.status === 'empty' ||
        page.status === 'error',
    ).length
    return {
      completed,
      total,
      percent: Math.min(100, Math.round((completed / total) * 100)),
    }
  }, [hybridBackfillRunning, odlWarmRunning, pages, parseArmed, parsingActive, totalPages])

  return {
    totalPages,
    pages,
    pageAspect,
    bootstrapping,
    bootstrapError,
    busy,
    parsing: parsingActive,
    translating: translateActive,
    parseProgress,
    parseArmed,
    translationArmed,
    ensurePageReady,
    focusPage,
    translatePage,
    startTranslation,
    startParse,
    stopParse,
    stopTranslation,
    translatedText,
  }
}

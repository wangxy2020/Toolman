import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from '../chat/useTranslate'
import { cachePageState, setCachedSourceText } from './document-page-cache'
import { useDocumentPageBootstrap } from './document-page-bootstrap'
import { useDocumentPageOcr } from './document-page-ocr'
import { useDocumentPageParsePipeline } from './document-page-parse-pipeline'
import {
  OCR_PREFETCH_AHEAD,
  resolvedPageCount,
  TRANSLATE_START_AHEAD,
} from './document-page-parse-helpers'
import { useDocumentPageSourcePrefetch } from './document-page-source-prefetch'
import { useDocumentPageTranslateQueue } from './document-page-translate-queue'
import type {
  DocumentPageRefs,
  DocumentPageSetters,
  DocumentPageState,
  DocumentPageStatus,
  DocumentPageTranslationOptions,
} from './document-page-types'
import { isTranslationPageSourceInsufficient } from './translation-page-source-quality'

export type { DocumentPageStatus, DocumentPageState }

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
}: DocumentPageTranslationOptions) {
  const { translate } = useTranslate()
  const [totalPages, setTotalPages] = useState(0)
  const [pages, setPages] = useState<DocumentPageState[]>([])
  const [pageAspect, setPageAspect] = useState<number | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [translationArmed, setTranslationArmed] = useState(false)
  const [parseArmed, setParseArmed] = useState(false)
  const [odlWarmRunning, setOdlWarmRunning] = useState(false)
  const [hybridBackfillRunning, setHybridBackfillRunning] = useState(false)

  const parseArmedRef = useRef(false)
  const translationArmedRef = useRef(false)
  const odlWarmRunningRef = useRef(false)
  const hybridBackfillRunningRef = useRef(false)
  const inFlightRef = useRef(new Set<number>())
  const translateInFlightRef = useRef(new Set<number>())
  const translatePageGenerationRef = useRef(new Map<number, number>())
  const translateQueueRef = useRef<number[]>([])
  const translateWorkerRunningRef = useRef(false)
  const ocrQueueRef = useRef<number[]>([])
  const ocrWorkerRunningRef = useRef(false)
  const centralOcrPipelineRef = useRef(false)
  const ocrExhaustedRef = useRef(new Set<number>())
  const pagesRef = useRef<DocumentPageState[]>([])
  const totalPagesRef = useRef(0)
  const pageSourceLoadRef = useRef(new Map<number, Promise<void>>())
  const generationRef = useRef(0)
  const focusPageRef = useRef<number | null>(null)
  const refs = useMemo<DocumentPageRefs>(
    () => ({
      parseArmedRef,
      translationArmedRef,
      odlWarmRunningRef,
      hybridBackfillRunningRef,
      inFlightRef,
      translateInFlightRef,
      translatePageGenerationRef,
      translateQueueRef,
      translateWorkerRunningRef,
      ocrQueueRef,
      ocrWorkerRunningRef,
      centralOcrPipelineRef,
      ocrExhaustedRef,
      pagesRef,
      totalPagesRef,
      pageSourceLoadRef,
      generationRef,
      focusPageRef,
    }),
    [],
  )
  const translationParamsRef = useRef({ modelId, languages, autoDetectSource })
  const savedPageSnapshotsRef = useRef(savedPageSnapshots)
  const setters: DocumentPageSetters = {
    setPages,
    setParseArmed,
    setTranslationArmed,
    setOdlWarmRunning,
    setHybridBackfillRunning,
  }

  useEffect(() => {
    translationParamsRef.current = { modelId, languages, autoDetectSource }
    savedPageSnapshotsRef.current = savedPageSnapshots
  }, [autoDetectSource, languages, modelId, savedPageSnapshots])
  useEffect(() => { parseArmedRef.current = parseArmed }, [parseArmed])
  useEffect(() => { translationArmedRef.current = translationArmed }, [translationArmed])
  useEffect(() => { odlWarmRunningRef.current = odlWarmRunning }, [odlWarmRunning])
  useEffect(() => { hybridBackfillRunningRef.current = hybridBackfillRunning }, [hybridBackfillRunning])
  useEffect(() => { pagesRef.current = pages }, [pages])
  useEffect(() => { totalPagesRef.current = totalPages }, [totalPages])

  const updatePage = useCallback(
    (pageNumber: number, patch: Partial<DocumentPageState>) => {
      setPages((prev) => {
        const pageLimit = resolvedPageCount(refs.totalPagesRef.current, prev.length)
        const index = prev.findIndex((page) => page.pageNumber === pageNumber)
        if (index === -1 && pageLimit > 0 && pageNumber > pageLimit) return prev
        let next: DocumentPageState[]
        if (index === -1) {
          next = [
            ...prev,
            { pageNumber, sourceText: '', translatedText: '', status: 'idle', ...patch } as DocumentPageState,
          ].sort((left, right) => left.pageNumber - right.pageNumber)
        } else {
          next = prev.map((page) => (page.pageNumber === pageNumber ? { ...page, ...patch } : page))
        }
        refs.pagesRef.current = next
        const updated = next.find((page) => page.pageNumber === pageNumber)
        if (updated && documentId && filePath) {
          cachePageState(documentId, filePath, modelId, languages, autoDetectSource, updated)
        }
        return next
      })
    },
    [autoDetectSource, documentId, filePath, languages, modelId, refs],
  )

  const ensurePageSlots = useCallback((count: number) => {
    const safeCount = Math.max(1, Math.floor(count))
    const prev = refs.pagesRef.current
    if (prev.length >= safeCount) return
    const next = [...prev]
    for (let pageNumber = prev.length + 1; pageNumber <= safeCount; pageNumber += 1) {
      next.push({ pageNumber, sourceText: '', translatedText: '', status: 'idle' })
    }
    refs.pagesRef.current = next
    setPages(next)
  }, [refs])

  const commitTotalPages = useCallback(
    (incoming: number) => {
      if (incoming < 1) return
      setTotalPages((prev) => {
        const next = Math.max(prev, incoming)
        refs.totalPagesRef.current = next
        ensurePageSlots(next)
        return next
      })
    },
    [ensurePageSlots, refs],
  )

  const applyParsedSourcePage = useCallback(
    (pageNumber: number, text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isTranslationPageSourceInsufficient(trimmed)) return false
      setCachedSourceText(filePath!, pageNumber, trimmed)
      const existing = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (
        existing &&
        !existing.sourceText.trim() &&
        (existing.status === 'idle' || existing.status === 'loading-source')
      ) {
        updatePage(pageNumber, { sourceText: trimmed, status: 'idle', error: undefined })
      }
      return true
    },
    [filePath, refs, updatePage],
  )

  const { applyParseResults, startParse, stopParse } = useDocumentPageParsePipeline({
    filePath, documentId, workspaceId, modelId, languages, autoDetectSource,
    refs, setters, ensurePageSlots, commitTotalPages,
  })
  const { prefetchPageSources, scheduleSourcePrefetch, loadPageSource } = useDocumentPageSourcePrefetch({
    filePath, workspaceId, pdfParserBackend, enabled, refs, updatePage, applyParsedSourcePage, commitTotalPages,
  })
  const { queueOcrBackfill } = useDocumentPageOcr({
    filePath, workspaceId, enabled, refs, updatePage, commitTotalPages, applyParseResults,
  })
  const { translatePage, startTranslation, stopTranslation } = useDocumentPageTranslateQueue({
    filePath, modelId, languages, autoDetectSource, enabled, refs, setters, updatePage,
    loadPageSource, scheduleSourcePrefetch, prefetchPageSources, translate,
  })

  useDocumentPageBootstrap({
    filePath, documentId, workspaceId, modelId, languages, autoDetectSource, pdfParserBackend,
    enabled, savedPageSnapshots, bootstrapping, refs, savedPageSnapshotsRef, translationParamsRef,
    commitTotalPages, setTotalPages, setPages, setPageAspect, setBootstrapError, setBootstrapping,
    setTranslationArmed, setParseArmed,
  })

  const focusPage = useCallback(
    (pageNumber: number) => {
      const pageLimit = resolvedPageCount(refs.totalPagesRef.current, refs.pagesRef.current.length)
      const safePage = Math.max(1, Math.min(pageLimit || pageNumber, Math.floor(pageNumber)))
      refs.focusPageRef.current = safePage
      if (parseArmed) {
        queueOcrBackfill(safePage, true)
        const prefetchEnd = Math.min(pageLimit, safePage + OCR_PREFETCH_AHEAD)
        for (let next = safePage + 1; next <= prefetchEnd; next += 1) queueOcrBackfill(next)
        return
      }
      if (translationArmed) {
        translatePage(safePage, true)
        // Priority: current page + next N (IMA-style look-ahead).
        for (let ahead = 1; ahead <= TRANSLATE_START_AHEAD; ahead += 1) {
          const nextPage = safePage + ahead
          if (pageLimit > 0 && nextPage > pageLimit) break
          translatePage(nextPage, false)
        }
        // Prefetch neighbors only — never fold the focused page into a multi-page
        // ODL batch, or its translate path waits on the whole slab.
        // Keep scroll-driven prefetch tiny — large batches stall image-PDF flips.
        const aheadStart = safePage + 1
        const aheadEnd = Math.min(pageLimit, safePage + Math.max(2, TRANSLATE_START_AHEAD))
        if (aheadStart <= aheadEnd) {
          void prefetchPageSources(aheadStart, aheadEnd, refs.generationRef.current)
        }
      }
    },
    [parseArmed, prefetchPageSources, queueOcrBackfill, refs, translatePage, translationArmed],
  )

  const ensurePageReady = useCallback(
    async (pageNumber: number) => {
      if (!enabled || pageNumber < 1) return
      const pageLimit = resolvedPageCount(refs.totalPagesRef.current, refs.pagesRef.current.length)
      if (pageLimit > 0 && pageNumber > pageLimit) return
      if (parseArmed) {
        queueOcrBackfill(pageNumber)
        const prefetchEnd = Math.min(pageLimit, pageNumber + OCR_PREFETCH_AHEAD)
        for (let next = pageNumber + 1; next <= prefetchEnd; next += 1) queueOcrBackfill(next)
        return
      }
      if (!translationArmed) return
      const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
      // Recover pages left as「正在翻译」after a cleared queue (not actually in-flight).
      if (
        (current?.status === 'translating' || current?.status === 'loading-source') &&
        !refs.translateInFlightRef.current.has(pageNumber) &&
        !refs.translateQueueRef.current.includes(pageNumber)
      ) {
        updatePage(pageNumber, { status: 'idle', error: undefined })
      }
      await translatePage(pageNumber)
    },
    [enabled, parseArmed, queueOcrBackfill, refs, translatePage, translationArmed, updatePage],
  )

  const translatedText = pages
    .filter((page) => page.translatedText.trim())
    .map((page) => page.translatedText.trim())
    .join('\n\n')
  const parsingActive =
    odlWarmRunning || hybridBackfillRunning || pages.some((page) => page.status === 'parsing')
  const translateActive = pages.some(
    (page) => page.status === 'loading-source' || page.status === 'translating',
  )
  // Soft progress fills the gap between the probe paint and the full-doc apply
  // so the status bar keeps moving while later pages are still arriving.
  const [parseElapsedMs, setParseElapsedMs] = useState(0)
  useEffect(() => {
    if (!odlWarmRunning && !hybridBackfillRunning) {
      setParseElapsedMs(0)
      return
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setParseElapsedMs(Date.now() - startedAt)
    }, 400)
    return () => window.clearInterval(timer)
  }, [hybridBackfillRunning, odlWarmRunning])

  const parseProgress = useMemo(() => {
    const total = Math.max(totalPages, pages.length)
    if (total < 1) return null
    if (!parseArmed && !parsingActive && !odlWarmRunning && !hybridBackfillRunning) return null
    const completed = pages.filter(
      (page) =>
        page.status === 'parsed' ||
        page.status === 'done' ||
        page.status === 'empty' ||
        page.status === 'error',
    ).length
    let percent = Math.min(100, Math.round((completed / total) * 100))
    let reportedCompleted = completed
    const fullDocRunning =
      (odlWarmRunning || hybridBackfillRunning) && completed < total
    if (fullDocRunning) {
      // Ease toward 95% while the JVM full-doc / Hybrid run works (even at 0 pages).
      const soft = Math.min(95, Math.max(percent, 2 + Math.floor(parseElapsedMs / 700)))
      percent = Math.max(percent, soft)
      reportedCompleted = Math.max(
        completed,
        Math.min(total - 1, Math.floor((percent / 100) * total)),
      )
    }
    return { completed: reportedCompleted, total, percent }
  }, [
    hybridBackfillRunning,
    odlWarmRunning,
    pages,
    parseArmed,
    parseElapsedMs,
    parsingActive,
    totalPages,
  ])

  return {
    totalPages,
    pages,
    pageAspect,
    bootstrapping,
    bootstrapError,
    busy: bootstrapping || parsingActive || translateActive,
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

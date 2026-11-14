import { useCallback } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { getCachedPageText, pageTextCacheKey } from './document-page-cache'
import {
  enqueuePage,
  sortQueueWithPriority,
  SOURCE_PREFETCH_BATCH,
  TRANSLATE_CONCURRENCY,
  TRANSLATE_START_AHEAD,
  toPlainTranslationSource,
} from './document-page-parse-helpers'
import type { DocumentPageRefs, DocumentPageSetters, DocumentPageState } from './document-page-types'
import { isTranslationPageSourceInsufficient, NO_VALID_PAGE_TEXT } from './translation-page-source-quality'

/** Wall-clock budget for one page translate (IPC + model). */
export const PAGE_TRANSLATE_TIMEOUT_MS = 120_000

interface TranslateQueueDeps {
  filePath: string | null
  documentId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  enabled: boolean
  refs: DocumentPageRefs
  setters: DocumentPageSetters
  updatePage: (pageNumber: number, patch: Partial<DocumentPageState>) => void
  loadPageSource: (pageNumber: number, generation: number) => Promise<string>
  scheduleSourcePrefetch: (anchorPage: number, generation: number) => void
  prefetchPageSources: (fromPage: number, toPage: number, generation: number) => void
  translate: (input: {
    text: string
    modelId: string
    translationLanguages: [TranslationLanguage, TranslationLanguage]
    autoDetectSource: boolean
  }) => Promise<{ text: string }>
}

function nextPendingTranslatePage(
  pages: DocumentPageState[],
  afterPage: number,
): number | null {
  const pending = pages
    .filter(
      (page) =>
        page.pageNumber > afterPage &&
        (page.status === 'idle' || page.status === 'error' || page.status === 'parsed'),
    )
    .sort((left, right) => left.pageNumber - right.pageNumber)
  return pending[0]?.pageNumber ?? null
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

export function useDocumentPageTranslateQueue({
  filePath,
  documentId,
  modelId,
  languages,
  autoDetectSource,
  enabled,
  refs,
  setters,
  updatePage,
  loadPageSource,
  scheduleSourcePrefetch,
  prefetchPageSources,
  translate,
}: TranslateQueueDeps) {
  const enqueueNextTranslatePage = useCallback(
    (afterPage: number) => {
      if (!refs.translationArmedRef.current) return
      const next = nextPendingTranslatePage(refs.pagesRef.current, afterPage)
      if (next == null) return
      if (refs.translateQueueRef.current.includes(next)) return
      if (refs.translateInFlightRef.current.has(next)) return
      enqueuePage(refs.translateQueueRef.current, next, false)
    },
    [refs],
  )

  const executeTranslatePage = useCallback(
    async (pageNumber: number, generation: number) => {
      // Always enter try/finally so a page marked translating cannot spin forever.
      refs.translateInFlightRef.current.add(pageNumber)
      refs.translatePageGenerationRef.current.set(pageNumber, generation)
      let settled = false
      const settle = (patch: Partial<DocumentPageState>, enqueueNext = false) => {
        if (generation !== refs.generationRef.current) return
        settled = true
        updatePage(pageNumber, patch)
        if (enqueueNext) enqueueNextTranslatePage(pageNumber)
      }
      try {
        if (!enabled || !filePath || !modelId) {
          settle({
            status: 'error',
            error: !modelId ? '未选择翻译模型' : '翻译未就绪',
          }, true)
          return
        }

        const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
        if (current?.status === 'done' && current.translatedText.trim()) {
          settled = true
          enqueueNextTranslatePage(pageNumber)
          return
        }
        if (current?.status === 'empty') {
          settled = true
          enqueueNextTranslatePage(pageNumber)
          return
        }

        // Session cache already has Chinese — settle immediately so the header
        // spinner stops while the right pane already shows the cached body.
        if (documentId && modelId) {
          const cached = getCachedPageText(
            pageTextCacheKey(documentId, pageNumber, modelId, languages, autoDetectSource),
          )
          if (cached?.status === 'done' && cached.translatedText.trim()) {
            settle(
              {
                status: 'done',
                translatedText: cached.translatedText,
                sourceText: cached.sourceText || current?.sourceText || '',
                parsedMarkdown: cached.parsedMarkdown,
                error: undefined,
              },
              true,
            )
            return
          }
        }

        scheduleSourcePrefetch(pageNumber, generation)

        const rawSource = current?.sourceText.trim()
          ? current.sourceText
          : await loadPageSource(pageNumber, generation)
        if (generation !== refs.generationRef.current) return

        const sourceText = toPlainTranslationSource(rawSource)
        if (sourceText && sourceText !== rawSource.trim()) {
          updatePage(pageNumber, { sourceText })
        }

        if (!sourceText || isTranslationPageSourceInsufficient(sourceText)) {
          settle({
            status: 'empty',
            translatedText: '',
            sourceText: '',
            error: NO_VALID_PAGE_TEXT,
          }, true)
          return
        }

        updatePage(pageNumber, { status: 'translating', error: undefined })
        const result = await withTimeout(
          translate({
            text: sourceText,
            modelId,
            translationLanguages: languages,
            // Document dual-pane (IMA-style): always detect so EN PDF → 中文.
            autoDetectSource: true,
          }),
          PAGE_TRANSLATE_TIMEOUT_MS,
          '翻译超时，请检查模型服务后重试',
        )
        if (generation !== refs.generationRef.current) return
        const translated = result.text.trim()
        if (!translated) {
          settle({
            status: 'error',
            error: '翻译结果为空，请重试或更换模型',
          }, true)
          return
        }
        settle({
          status: 'done',
          translatedText: translated,
          // Keep parsedMarkdown so the user can switch back to parse preview.
          error: undefined,
        }, true)
      } catch (error) {
        settle({
          status: 'error',
          error: error instanceof Error ? error.message : 'translate failed',
        }, true)
      } finally {
        refs.translateInFlightRef.current.delete(pageNumber)
        const ownedGeneration = refs.translatePageGenerationRef.current.get(pageNumber)
        refs.translatePageGenerationRef.current.delete(pageNumber)
        const stuck = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
        const stillBusy =
          stuck?.status === 'translating' || stuck?.status === 'loading-source'
        if (stillBusy) {
          // Superseded run — park the page without wiping a newer generation's claim.
          if (generation !== refs.generationRef.current && ownedGeneration === generation) {
            updatePage(pageNumber, { status: 'idle', error: undefined })
          } else if (!settled && generation === refs.generationRef.current) {
            // Same generation exited without done/error/empty — never leave「正在翻译」spinning.
            updatePage(pageNumber, {
              status: 'error',
              error: '翻译中断，请重试',
            })
            enqueueNextTranslatePage(pageNumber)
          }
        }
      }
    },
    [
      autoDetectSource,
      documentId,
      enabled,
      enqueueNextTranslatePage,
      filePath,
      languages,
      loadPageSource,
      modelId,
      refs,
      scheduleSourcePrefetch,
      translate,
      updatePage,
    ],
  )

  const drainTranslateQueue = useCallback(async () => {
    if (refs.translateWorkerRunningRef.current) return
    refs.translateWorkerRunningRef.current = true
    try {
      while (refs.translateQueueRef.current.length > 0) {
        sortQueueWithPriority(refs.translateQueueRef.current, refs.focusPageRef.current)
        const generation = refs.generationRef.current
        const batch: number[] = []
        while (batch.length < TRANSLATE_CONCURRENCY && refs.translateQueueRef.current.length > 0) {
          const pageNumber = refs.translateQueueRef.current.shift()
          if (pageNumber === undefined) break
          batch.push(pageNumber)
        }
        if (batch.length === 0) break
        await Promise.all(batch.map((pageNumber) => executeTranslatePage(pageNumber, generation)))
        if (refs.translationArmedRef.current && refs.translateQueueRef.current.length === 0) {
          const focus = refs.focusPageRef.current ?? 1
          const next = nextPendingTranslatePage(refs.pagesRef.current, focus - 1)
          if (next != null) enqueuePage(refs.translateQueueRef.current, next, false)
        }
      }
    } finally {
      refs.translateWorkerRunningRef.current = false
      if (refs.translateQueueRef.current.length > 0) {
        void drainTranslateQueue()
      }
    }
  }, [executeTranslatePage, refs])

  const translatePage = useCallback(
    (pageNumber: number, priority = false) => {
      if (!enabled || !filePath || !modelId) return false
      if (refs.translateInFlightRef.current.has(pageNumber)) return false

      const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (current?.status === 'done' && current.translatedText.trim()) return false
      if (current?.status === 'empty') return false
      // Keep visible errors until the user explicitly retries — scroll/ensure must
      // not clear a red error and flip the chip back to「正在翻译」in a loop.
      if (current?.status === 'error' && !priority) return false

      if (!refs.translateQueueRef.current.includes(pageNumber)) {
        updatePage(pageNumber, {
          status: current?.sourceText.trim() ? 'translating' : 'loading-source',
          error: undefined,
        })
      }
      enqueuePage(refs.translateQueueRef.current, pageNumber, priority)
      void drainTranslateQueue()
      return true
    },
    [drainTranslateQueue, enabled, filePath, modelId, refs, updatePage],
  )

  const stopTranslation = useCallback(() => {
    refs.generationRef.current += 1
    refs.translateQueueRef.current = []
    refs.translateWorkerRunningRef.current = false
    refs.pageSourceLoadRef.current.clear()
    refs.translateInFlightRef.current.clear()
    refs.translatePageGenerationRef.current.clear()
    refs.translationArmedRef.current = false
    setters.setTranslationArmed(false)
    setters.setPages((prev) => {
      const next = prev.map((page) =>
        page.status === 'translating' || page.status === 'loading-source'
          ? { ...page, status: 'idle' as const, error: undefined }
          : page,
      )
      refs.pagesRef.current = next
      return next
    })
  }, [refs, setters])

  const startTranslation = useCallback(() => {
    if (!modelId || refs.pagesRef.current.length === 0) return false

    // Switch UI mode immediately so the right pane leaves parse-armed preview
    // rules before the first page reaches status=done.
    setters.setParseArmed(false)
    refs.translationArmedRef.current = true
    setters.setTranslationArmed(true)
    setters.setOdlWarmRunning(false)
    setters.setHybridBackfillRunning(false)

    // Normalize pages first (including leftover parsing) before bumping
    // generation, so parse→translate switches always enqueue real work.
    const resetPages = refs.pagesRef.current.map((page) => {
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
      if (
        page.status === 'translating' ||
        page.status === 'loading-source' ||
        page.status === 'parsing'
      ) {
        const preview = page.parsedMarkdown || page.translatedText
        if (preview?.trim()) {
          const fromPreview = toPlainTranslationSource(
            page.sourceText.trim() || preview,
          )
          return {
            ...page,
            status: 'parsed' as const,
            sourceText: fromPreview || page.sourceText,
            translatedText: '',
            parsedMarkdown: preview,
            error: undefined,
          }
        }
        return { ...page, status: 'idle' as const, error: undefined }
      }
      if (page.status === 'parsed') {
        const fromPreview = toPlainTranslationSource(
          page.sourceText.trim() || page.parsedMarkdown || page.translatedText,
        )
        const sourceText = fromPreview || page.sourceText
        // Keep parse preview only in parsedMarkdown. Leave translatedText empty so
        // a finished Chinese result clearly replaces the preview (status=done).
        const preview = page.parsedMarkdown || page.translatedText
        return {
          ...page,
          sourceText,
          translatedText: '',
          parsedMarkdown: preview,
          error: undefined,
        }
      }
      return page
    })

    const pending = resetPages.filter(
      (page) =>
        page.status === 'idle' ||
        page.status === 'error' ||
        page.status === 'parsed',
    )

    // Already fully translated (live or restored): keep the translate view armed
    // without wiping done pages — that left the header spinning while the right
    // pane still painted cached/snapshot Chinese.
    if (pending.length === 0) {
      const allComplete =
        resetPages.length > 0 &&
        resetPages.every((page) => page.status === 'done' || page.status === 'empty')
      if (allComplete) {
        refs.pagesRef.current = resetPages
        setters.setPages(resetPages)
        return true
      }
      refs.translationArmedRef.current = false
      setters.setTranslationArmed(false)
      return false
    }

    refs.generationRef.current += 1
    refs.ocrQueueRef.current = []
    refs.ocrWorkerRunningRef.current = false
    refs.centralOcrPipelineRef.current = false
    refs.ocrExhaustedRef.current.clear()
    refs.pageSourceLoadRef.current.clear()
    refs.translateQueueRef.current = []
    refs.translateWorkerRunningRef.current = false
    refs.translateInFlightRef.current.clear()
    refs.translatePageGenerationRef.current.clear()
    refs.inFlightRef.current.clear()

    refs.pagesRef.current = resetPages
    setters.setPages(resetPages)
    const generation = refs.generationRef.current
    const pendingNumbers = pending.map((page) => page.pageNumber)
    sortQueueWithPriority(pendingNumbers, refs.focusPageRef.current)
    const firstPending = pendingNumbers[0]!
    const focus = refs.focusPageRef.current && refs.focusPageRef.current > 0
      ? refs.focusPageRef.current
      : firstPending
    const immediate = pendingNumbers.filter(
      (pageNumber) => pageNumber >= focus && pageNumber <= focus + TRANSLATE_START_AHEAD,
    )
    const toQueue = immediate.length > 0 ? immediate : pendingNumbers.slice(0, TRANSLATE_START_AHEAD + 1)
    const aheadStart = (toQueue[0] ?? firstPending) + 1
    const aheadEnd = Math.min(
      refs.totalPagesRef.current || resetPages.length,
      (toQueue[0] ?? firstPending) + SOURCE_PREFETCH_BATCH - 1,
    )
    if (aheadStart <= aheadEnd) {
      prefetchPageSources(aheadStart, aheadEnd, generation)
    }
    let queued = 0
    for (const pageNumber of toQueue) {
      if (translatePage(pageNumber, pageNumber === focus)) queued += 1
    }
    sortQueueWithPriority(refs.translateQueueRef.current, refs.focusPageRef.current)
    return queued > 0
  }, [modelId, prefetchPageSources, refs, setters, translatePage])

  return { translatePage, startTranslation, stopTranslation }
}

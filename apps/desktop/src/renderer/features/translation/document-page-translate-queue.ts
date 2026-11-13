import { useCallback } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
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
  modelId,
  languages,
  autoDetectSource: _autoDetectSource,
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
      try {
        if (!enabled || !filePath || !modelId) {
          updatePage(pageNumber, {
            status: 'error',
            error: !modelId ? '未选择翻译模型' : '翻译未就绪',
          })
          return
        }

        const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
        if (current?.status === 'done' && current.translatedText.trim()) return
        if (current?.status === 'empty') return

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
          updatePage(pageNumber, {
            status: 'empty',
            translatedText: '',
            sourceText: '',
            error: NO_VALID_PAGE_TEXT,
          })
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
          updatePage(pageNumber, {
            status: 'error',
            error: '翻译结果为空，请重试或更换模型',
          })
          enqueueNextTranslatePage(pageNumber)
          return
        }
        updatePage(pageNumber, {
          status: 'done',
          translatedText: translated,
          parsedMarkdown: undefined,
          error: undefined,
        })
        enqueueNextTranslatePage(pageNumber)
      } catch (error) {
        if (generation !== refs.generationRef.current) return
        updatePage(pageNumber, {
          status: 'error',
          error: error instanceof Error ? error.message : 'translate failed',
        })
        enqueueNextTranslatePage(pageNumber)
      } finally {
        refs.translateInFlightRef.current.delete(pageNumber)
        const ownedGeneration = refs.translatePageGenerationRef.current.get(pageNumber)
        refs.translatePageGenerationRef.current.delete(pageNumber)
        // Only idle a stuck page if THIS generation still owns it — never clobber a newer run.
        if (
          generation !== refs.generationRef.current &&
          ownedGeneration === generation
        ) {
          const stuck = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
          if (stuck?.status === 'translating' || stuck?.status === 'loading-source') {
            updatePage(pageNumber, { status: 'idle', error: undefined })
          }
        }
      }
    },
    [
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
    setters.setOdlWarmRunning(false)
    setters.setHybridBackfillRunning(false)
    setters.setParseArmed(false)
    refs.translationArmedRef.current = true
    setters.setTranslationArmed(true)

    let resetPages = refs.pagesRef.current.map((page) => {
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
      if (page.status === 'parsed') {
        const fromPreview = toPlainTranslationSource(
          page.sourceText.trim() || page.parsedMarkdown || page.translatedText,
        )
        const sourceText = fromPreview || page.sourceText
        // Keep English in parsedMarkdown for mid-translate preview; clear
        // translatedText so「已解析」English is not mistaken for Chinese.
        return {
          ...page,
          sourceText,
          translatedText: '',
          parsedMarkdown: page.parsedMarkdown || page.translatedText,
          error: undefined,
        }
      }
      return page
    })

    let pending = resetPages.filter(
      (page) =>
        page.status === 'idle' ||
        page.status === 'error' ||
        page.status === 'parsed',
    )

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

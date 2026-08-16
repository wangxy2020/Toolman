import { useCallback } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import {
  enqueuePage,
  sortQueueWithPriority,
  SOURCE_PREFETCH_BATCH,
  TRANSLATE_CONCURRENCY,
} from './document-page-parse-helpers'
import type { DocumentPageRefs, DocumentPageSetters, DocumentPageState } from './document-page-types'
import { isTranslationPageSourceInsufficient, NO_VALID_PAGE_TEXT } from './translation-page-source-quality'

interface TranslateQueueDeps {
  filePath: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  enabled: boolean
  refs: DocumentPageRefs
  setters: Pick<DocumentPageSetters, 'setPages' | 'setTranslationArmed' | 'setParseArmed'>
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

export function useDocumentPageTranslateQueue({
  filePath,
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
  const executeTranslatePage = useCallback(
    async (pageNumber: number, generation: number) => {
      if (!enabled || !filePath || !modelId) return

      const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (current?.status === 'done' && current.translatedText.trim()) return
      if (current?.status === 'empty') return

      scheduleSourcePrefetch(pageNumber, generation)

      refs.inFlightRef.current.add(pageNumber)
      try {
        const sourceText = current?.sourceText.trim()
          ? current.sourceText
          : await loadPageSource(pageNumber, generation)
        if (generation !== refs.generationRef.current) return
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
        if (generation !== refs.generationRef.current) return
        updatePage(pageNumber, {
          status: 'done',
          translatedText: result.text,
          error: undefined,
        })
      } catch (error) {
        if (generation !== refs.generationRef.current) return
        updatePage(pageNumber, {
          status: 'error',
          error: error instanceof Error ? error.message : 'translate failed',
        })
      } finally {
        refs.inFlightRef.current.delete(pageNumber)
        if (generation !== refs.generationRef.current) {
          const stuck = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
          if (stuck?.status === 'translating' || stuck?.status === 'loading-source') {
            updatePage(pageNumber, { status: 'idle', error: undefined })
          }
        }
      }
    },
    [
      autoDetectSource,
      enabled,
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
      if (refs.inFlightRef.current.has(pageNumber)) return false

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
    refs.inFlightRef.current.clear()
  }, [refs, setters])

  const startTranslation = useCallback(() => {
    if (!modelId || refs.pagesRef.current.length === 0) return false

    setters.setTranslationArmed(true)
    setters.setParseArmed(false)
    refs.ocrQueueRef.current = []
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

    refs.pagesRef.current = resetPages
    setters.setPages(resetPages)
    const generation = refs.generationRef.current
    const pendingNumbers = pending.map((page) => page.pageNumber)
    sortQueueWithPriority(pendingNumbers, refs.focusPageRef.current)
    const firstPending = pendingNumbers[0]!
    prefetchPageSources(
      firstPending,
      Math.min(
        refs.totalPagesRef.current || resetPages.length,
        firstPending + SOURCE_PREFETCH_BATCH - 1,
      ),
      generation,
    )
    let queued = 0
    for (const pageNumber of pendingNumbers) {
      if (translatePage(pageNumber)) queued += 1
    }
    sortQueueWithPriority(refs.translateQueueRef.current, refs.focusPageRef.current)
    return queued > 0
  }, [modelId, prefetchPageSources, refs, setters, translatePage])

  return { translatePage, startTranslation, stopTranslation }
}

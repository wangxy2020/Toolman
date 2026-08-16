import { useCallback } from 'react'
import { TranslationDocumentParsePagesOutputSchema, type PdfParserBackend } from '@toolman/shared'
import { getCachedSourceText, setCachedSourceText } from './document-page-cache'
import {
  isPdfPath,
  resolveParseTimeoutMs,
  resolveProgressiveBatchTimeoutMs,
  resolveTranslationSourceText,
  invokeParsePages,
  withTimeout,
  SOURCE_PREFETCH_AHEAD,
} from './document-page-parse-helpers'
import type { DocumentPageRefs } from './document-page-types'
import type { DocumentPageState } from './document-page-types'
import { isTranslationPageSourceInsufficient, NO_VALID_PAGE_TEXT } from './translation-page-source-quality'

interface SourcePrefetchDeps {
  filePath: string | null
  workspaceId: string | null
  pdfParserBackend: PdfParserBackend
  enabled: boolean
  refs: DocumentPageRefs
  updatePage: (pageNumber: number, patch: Partial<DocumentPageState>) => void
  applyParsedSourcePage: (pageNumber: number, text: string) => boolean
  commitTotalPages: (incoming: number) => void
}

export function useDocumentPageSourcePrefetch({
  filePath,
  workspaceId,
  pdfParserBackend,
  enabled,
  refs,
  updatePage,
  applyParsedSourcePage,
  commitTotalPages,
}: SourcePrefetchDeps) {
  const fetchPageSourcesBatch = useCallback(
    async (fromPage: number, toPage: number, generation: number): Promise<void> => {
      if (!filePath || !enabled) return
      const total = refs.totalPagesRef.current || refs.pagesRef.current.length
      if (total < 1) return

      const start = Math.max(1, Math.floor(fromPage))
      const end = Math.min(total, Math.floor(toPage))
      if (start > end) return

      const missing: number[] = []
      for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
        if (refs.pageSourceLoadRef.current.has(pageNumber)) continue
        const existing = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
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
                    odlProgressiveBatch: refs.hybridBackfillRunningRef.current,
                    odlSkipLocalWarm: refs.hybridBackfillRunningRef.current,
                  }
                : {}),
              timeoutMs: isPdfPath(filePath)
                ? resolveProgressiveBatchTimeoutMs(
                    filePath,
                    batchEnd - batchStart + 1,
                    refs.hybridBackfillRunningRef.current,
                  )
                : resolveParseTimeoutMs(filePath),
            }),
            isPdfPath(filePath)
              ? resolveProgressiveBatchTimeoutMs(
                  filePath,
                  batchEnd - batchStart + 1,
                  refs.hybridBackfillRunningRef.current,
                )
              : resolveParseTimeoutMs(filePath),
            '预加载页面超时',
          )
          if (generation !== refs.generationRef.current || !result.ok) return

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
        refs.pageSourceLoadRef.current.set(pageNumber, batchPromise)
      }

      try {
        await batchPromise
      } finally {
        for (const pageNumber of missing) {
          if (refs.pageSourceLoadRef.current.get(pageNumber) === batchPromise) {
            refs.pageSourceLoadRef.current.delete(pageNumber)
          }
        }
      }
    },
    [applyParsedSourcePage, commitTotalPages, enabled, filePath, pdfParserBackend, refs, workspaceId],
  )

  const prefetchPageSources = useCallback(
    (fromPage: number, toPage: number, generation: number) => {
      void fetchPageSourcesBatch(fromPage, toPage, generation)
    },
    [fetchPageSourcesBatch],
  )

  const scheduleSourcePrefetch = useCallback(
    (anchorPage: number, generation: number) => {
      const total = refs.totalPagesRef.current || refs.pagesRef.current.length
      if (total < 1) return
      const from = anchorPage + 1
      const to = Math.min(total, anchorPage + SOURCE_PREFETCH_AHEAD)
      if (from > to) return
      void prefetchPageSources(from, to, generation)
    },
    [prefetchPageSources, refs],
  )

  const loadPageSource = useCallback(
    async (pageNumber: number, generation: number): Promise<string> => {
      if (!filePath) return ''
      const existing = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
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

      const inflight = refs.pageSourceLoadRef.current.get(pageNumber)
      if (inflight) {
        try {
          await inflight
        } catch {
          // Batch parse failed; fall through to retry below.
        }
        if (generation !== refs.generationRef.current) return ''
        const afterBatch = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
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
        if (generation !== refs.generationRef.current) return ''

        const resolved = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
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
        if (generation !== refs.generationRef.current) return ''
        const message = error instanceof Error ? error.message : '解析页面失败'
        updatePage(pageNumber, { status: 'error', error: message })
        throw error
      }
    },
    [fetchPageSourcesBatch, filePath, refs, scheduleSourcePrefetch, updatePage],
  )

  return { fetchPageSourcesBatch, prefetchPageSources, scheduleSourcePrefetch, loadPageSource }
}

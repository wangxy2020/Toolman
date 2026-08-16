import { TranslationDocumentParsePagesOutputSchema, type TranslationLanguage } from '@toolman/shared'
import { cachePageState } from './document-page-cache'
import {
  buildOdlProgressiveParseBatches,
  invokeParsePages,
  ODL_PARSE_TIMEOUT_MS,
  resolveProgressiveBatchTimeoutMs,
  withTimeout,
} from './document-page-parse-helpers'
import type { DocumentPageRefs, DocumentPageSetters, DocumentPageState } from './document-page-types'
import { NO_VALID_PAGE_TEXT } from './translation-page-source-quality'

export async function runOdlProgressiveParse(args: {
  filePath: string
  workspaceId: string | null
  documentId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  generation: number
  pending: DocumentPageState[]
  refs: DocumentPageRefs
  setters: DocumentPageSetters
  commitTotalPages: (incoming: number) => void
  applyParseResults: (
    pageNumbers: number[],
    pagesData: Array<{ pageNumber: number; text?: string; markdown?: string }>,
    options?: { emptyAsParsing?: boolean; previewLenient?: boolean },
  ) => number[]
}): Promise<void> {
  const {
    filePath,
    workspaceId,
    documentId,
    modelId,
    languages,
    autoDetectSource,
    generation,
    pending,
    refs,
    setters,
    commitTotalPages,
    applyParseResults,
  } = args

  try {
    const total = refs.totalPagesRef.current || refs.pagesRef.current.length
    setters.setHybridBackfillRunning(true)
    const batches = buildOdlProgressiveParseBatches(total)
    let skipLocalWarm = false
    const allEmptyPages: number[] = []

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      if (generation !== refs.generationRef.current) return
      const { start, end } = batches[batchIndex]!
      const batchPageNumbers = Array.from(
        { length: end - start + 1 },
        (_, index) => start + index,
      )
      const batchTimeoutMs = resolveProgressiveBatchTimeoutMs(
        filePath,
        batchPageNumbers.length,
        skipLocalWarm,
      )

      const result = await withTimeout(
        invokeParsePages(filePath, start, end, workspaceId, 'opendataloader', {
          odlPreviewOnly: true,
          odlProgressiveBatch: true,
          odlSkipLocalWarm: skipLocalWarm,
          odlPreviewReset: batchIndex === 0,
          timeoutMs: batchTimeoutMs,
        }),
        batchTimeoutMs,
        'OpenDataLoader 解析超时',
      )
      if (generation !== refs.generationRef.current) return
      if (!result.ok) {
        setters.setPages((prev) => {
          const next = prev.map((page) =>
            batchPageNumbers.includes(page.pageNumber)
              ? { ...page, status: 'error' as const, error: result.error.message }
              : page,
          )
          refs.pagesRef.current = next
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
            const page = refs.pagesRef.current.find((item) => item.pageNumber === pageNumber)
            return page?.status === 'parsing' || page?.status === 'empty'
          },
        )
        if (remainingPages.length > 0) {
          const fullResult = await withTimeout(
            invokeParsePages(filePath, 1, total, workspaceId, 'opendataloader', {
              odlPreviewOnly: true,
              fullDocument: true,
              timeoutMs: ODL_PARSE_TIMEOUT_MS,
            }),
            ODL_PARSE_TIMEOUT_MS,
            'OpenDataLoader 解析超时',
          )
          if (generation !== refs.generationRef.current) return
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
          invokeParsePages(filePath, 1, total, workspaceId, 'opendataloader', {
            odlPreviewOnly: true,
            fullDocument: true,
            timeoutMs: fullTimeoutMs,
          }),
          fullTimeoutMs,
          'OpenDataLoader 解析超时',
        )
        if (generation !== refs.generationRef.current) return
        if (!fullResult.ok) {
          setters.setPages((prev) => {
            const next = prev.map((page) =>
              page.pageNumber > end && pending.some((item) => item.pageNumber === page.pageNumber)
                ? { ...page, status: 'error' as const, error: fullResult.error.message }
                : page,
            )
            refs.pagesRef.current = next
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

    if (generation !== refs.generationRef.current) return

    const uniqueEmpty = [...new Set(allEmptyPages)]
    if (uniqueEmpty.length > 0) {
      setters.setPages((prev) => {
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
        refs.pagesRef.current = next
        for (const pageNumber of uniqueEmpty) {
          refs.ocrExhaustedRef.current.add(pageNumber)
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
    if (generation !== refs.generationRef.current) return
    const message = error instanceof Error ? error.message : 'parse failed'
    setters.setPages((prev) => {
      const next = prev.map((page) =>
        pending.some((item) => item.pageNumber === page.pageNumber)
          ? { ...page, status: 'error' as const, error: message }
          : page,
      )
      refs.pagesRef.current = next
      return next
    })
  } finally {
    if (generation === refs.generationRef.current) {
      setters.setOdlWarmRunning(false)
      setters.setHybridBackfillRunning(false)
    }
  }
}

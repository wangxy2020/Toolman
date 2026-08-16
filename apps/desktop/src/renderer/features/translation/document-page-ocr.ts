import { useCallback } from 'react'
import { TranslationDocumentParsePagesOutputSchema } from '@toolman/shared'
import {
  enqueuePage,
  OCR_BACKFILL_CONCURRENCY,
  resolveParseTimeoutMs,
  invokeParsePages,
  sortQueueWithPriority,
  withTimeout,
} from './document-page-parse-helpers'
import type { DocumentPageRefs } from './document-page-types'
import type { DocumentPageState } from './document-page-types'
import { HYBRID_UNAVAILABLE_ERROR, NO_VALID_PAGE_TEXT } from './translation-page-source-quality'

interface OcrDeps {
  filePath: string | null
  workspaceId: string | null
  enabled: boolean
  refs: DocumentPageRefs
  updatePage: (pageNumber: number, patch: Partial<DocumentPageState>) => void
  commitTotalPages: (incoming: number) => void
  applyParseResults: (
    pageNumbers: number[],
    pagesData: Array<{ pageNumber: number; text?: string; markdown?: string }>,
    options?: { emptyAsParsing?: boolean; previewLenient?: boolean },
  ) => number[]
}

export function useDocumentPageOcr({
  filePath,
  workspaceId,
  enabled,
  refs,
  updatePage,
  commitTotalPages,
  applyParseResults,
}: OcrDeps) {
  const runOcrBackfillBatch = useCallback(
    async (pageNumbers: number[], generation: number) => {
      if (!enabled || !filePath || pageNumbers.length === 0) return

      const toProcess = pageNumbers.filter((pageNumber) => {
        const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
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
        refs.inFlightRef.current.add(pageNumber)
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
          if (generation !== refs.generationRef.current) return
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
            refs.ocrExhaustedRef.current.add(pageNumber)
            updatePage(pageNumber, { status: 'empty', error: NO_VALID_PAGE_TEXT })
          }
        }
      } catch (error) {
        if (generation !== refs.generationRef.current) {
          for (const pageNumber of toProcess) {
            const stuck = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
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
          refs.inFlightRef.current.delete(pageNumber)
        }
      }
    },
    [applyParseResults, commitTotalPages, enabled, filePath, refs, updatePage, workspaceId],
  )

  const drainOcrQueue = useCallback(async () => {
    if (refs.ocrWorkerRunningRef.current) return
    refs.ocrWorkerRunningRef.current = true
    let firstWave = true
    try {
      while (refs.ocrQueueRef.current.length > 0) {
        sortQueueWithPriority(refs.ocrQueueRef.current, refs.focusPageRef.current)
        const generation = refs.generationRef.current
        const wave: number[] = []
        const waveLimit = firstWave ? 1 : OCR_BACKFILL_CONCURRENCY
        firstWave = false
        while (wave.length < waveLimit && refs.ocrQueueRef.current.length > 0) {
          const pageNumber = refs.ocrQueueRef.current.shift()
          if (pageNumber === undefined) break
          const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
          if (current?.status === 'parsed') continue
          wave.push(pageNumber)
        }
        if (wave.length === 0) break
        await runOcrBackfillBatch(wave, generation)
      }
    } finally {
      refs.ocrWorkerRunningRef.current = false
      if (refs.ocrQueueRef.current.length === 0) {
        refs.centralOcrPipelineRef.current = false
      }
      if (refs.ocrQueueRef.current.length > 0) {
        void drainOcrQueue()
      }
    }
  }, [refs, runOcrBackfillBatch])

  const queueOcrBackfill = useCallback(
    (pageNumber: number, priority = false) => {
      if (!enabled || !filePath || refs.odlWarmRunningRef.current || refs.hybridBackfillRunningRef.current) {
        return false
      }
      if (refs.centralOcrPipelineRef.current) return false
      if (refs.ocrExhaustedRef.current.has(pageNumber)) return false
      const current = refs.pagesRef.current.find((page) => page.pageNumber === pageNumber)
      if (current?.status !== 'empty') return false
      if (refs.inFlightRef.current.has(pageNumber)) return false
      if (refs.ocrQueueRef.current.includes(pageNumber)) return false
      enqueuePage(refs.ocrQueueRef.current, pageNumber, priority)
      void drainOcrQueue()
      return true
    },
    [drainOcrQueue, enabled, filePath, refs],
  )

  return { drainOcrQueue, queueOcrBackfill }
}

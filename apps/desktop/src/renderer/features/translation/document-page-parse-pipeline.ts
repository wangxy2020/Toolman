import { useCallback } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { useDocumentPageParseApply } from './document-page-parse-apply'
import { runOdlProgressiveParse } from './document-page-parse-run'
import type { DocumentPageRefs, DocumentPageSetters } from './document-page-types'
import {
  hasUsableParsePreviewContent,
  sanitizeParsePreviewContent,
} from './translation-page-source-quality'

interface ParsePipelineDeps {
  filePath: string | null
  documentId: string | null
  workspaceId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  refs: DocumentPageRefs
  setters: DocumentPageSetters
  ensurePageSlots: (count: number) => void
  commitTotalPages: (incoming: number) => void
}

export function useDocumentPageParsePipeline({
  filePath,
  documentId,
  workspaceId,
  modelId,
  languages,
  autoDetectSource,
  refs,
  setters,
  ensurePageSlots,
  commitTotalPages,
}: ParsePipelineDeps) {
  const { applyParseResults } = useDocumentPageParseApply({
    filePath,
    documentId,
    modelId,
    languages,
    autoDetectSource,
    refs,
    setters,
  })

  const stopParse = useCallback(() => {
    refs.generationRef.current += 1
    refs.ocrQueueRef.current = []
    refs.ocrWorkerRunningRef.current = false
    refs.centralOcrPipelineRef.current = false
    refs.ocrExhaustedRef.current.clear()
    setters.setOdlWarmRunning(false)
    setters.setHybridBackfillRunning(false)
    setters.setParseArmed(false)
    setters.setPages((prev) => {
      const next = prev.map((page) =>
        page.status === 'parsing'
          ? { ...page, status: 'empty' as const, error: 'empty' as const }
          : page,
      )
      refs.pagesRef.current = next
      return next
    })
    refs.inFlightRef.current.clear()
  }, [refs, setters])

  const startParse = useCallback(() => {
    if (refs.pagesRef.current.length === 0) return false

    setters.setParseArmed(true)
    setters.setTranslationArmed(false)
    refs.translateQueueRef.current = []

    let resetPages = refs.pagesRef.current.map((page) => {
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
      refs.pagesRef.current = resetPages
      setters.setPages(resetPages)
      setters.setParseArmed(true)
      return true
    }

    const pendingForErrors = pending
    const count = refs.totalPagesRef.current || resetPages.length
    if (count > 0) ensurePageSlots(count)

    const pendingNumbers = new Set(pending.map((page) => page.pageNumber))
    for (const page of refs.pagesRef.current) {
      if (page.pageNumber <= count && page.status === 'idle' && !pendingNumbers.has(page.pageNumber)) {
        pendingNumbers.add(page.pageNumber)
      }
    }

    const priorByPage = new Map(resetPages.map((page) => [page.pageNumber, page]))
    resetPages = refs.pagesRef.current.map((page) =>
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

    refs.pagesRef.current = resetPages
    setters.setPages(resetPages)

    const generation = ++refs.generationRef.current
    refs.ocrQueueRef.current = []
    refs.ocrExhaustedRef.current = new Set(
      resetPages.filter((page) => page.status === 'empty').map((page) => page.pageNumber),
    )
    setters.setOdlWarmRunning(true)

    void runOdlProgressiveParse({
      filePath: filePath!,
      workspaceId,
      documentId,
      modelId,
      languages,
      autoDetectSource,
      generation,
      pending: pendingForErrors,
      refs,
      setters,
      commitTotalPages,
      applyParseResults,
    })

    return true
  }, [
    applyParseResults,
    autoDetectSource,
    commitTotalPages,
    documentId,
    ensurePageSlots,
    filePath,
    languages,
    modelId,
    refs,
    setters,
    workspaceId,
  ])

  return { applyParseResults, startParse, stopParse }
}

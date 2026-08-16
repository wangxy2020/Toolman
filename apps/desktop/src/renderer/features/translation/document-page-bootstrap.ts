import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { TranslationDocumentParsePagesOutputSchema, type PdfParserBackend, type TranslationLanguage } from '@toolman/shared'
import { hydratePagesFromCache } from './document-page-cache'
import {
  invokeParsePages,
  isPdfPath,
  resolveParseTimeoutMs,
  withTimeout,
} from './document-page-parse-helpers'
import type { DocumentPageRefs, DocumentPageState } from './document-page-types'
import { applySavedPageSnapshots } from './document-page-snapshots'
import type { TranslationDocumentPageSnapshot } from './translation-storage'

interface BootstrapDeps {
  filePath: string | null
  documentId: string | null
  workspaceId: string | null
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  pdfParserBackend: PdfParserBackend
  enabled: boolean
  savedPageSnapshots?: TranslationDocumentPageSnapshot[]
  bootstrapping: boolean
  refs: DocumentPageRefs
  savedPageSnapshotsRef: MutableRefObject<TranslationDocumentPageSnapshot[] | undefined>
  translationParamsRef: MutableRefObject<{
    modelId: string | null
    languages: [TranslationLanguage, TranslationLanguage]
    autoDetectSource: boolean
  }>
  commitTotalPages: (incoming: number) => void
  setTotalPages: Dispatch<SetStateAction<number>>
  setPages: Dispatch<SetStateAction<DocumentPageState[]>>
  setPageAspect: Dispatch<SetStateAction<number | null>>
  setBootstrapError: Dispatch<SetStateAction<string | null>>
  setBootstrapping: Dispatch<SetStateAction<boolean>>
  setTranslationArmed: Dispatch<SetStateAction<boolean>>
  setParseArmed: Dispatch<SetStateAction<boolean>>
}

export function useDocumentPageBootstrap({
  filePath,
  documentId,
  workspaceId,
  modelId,
  languages,
  autoDetectSource,
  pdfParserBackend,
  enabled,
  savedPageSnapshots,
  bootstrapping,
  refs,
  savedPageSnapshotsRef,
  translationParamsRef,
  commitTotalPages,
  setTotalPages,
  setPages,
  setPageAspect,
  setBootstrapError,
  setBootstrapping,
  setTranslationArmed,
  setParseArmed,
}: BootstrapDeps) {
  // Bootstrap: only discover pages / load first-page source. Do not auto-translate.
  useEffect(() => {
    if (!enabled || !filePath || !documentId) {
      refs.generationRef.current += 1
      setTotalPages(0)
      setPages([])
      setPageAspect(null)
      setBootstrapError(null)
      setBootstrapping(false)
      setTranslationArmed(false)
      setParseArmed(false)
      refs.inFlightRef.current.clear()
      refs.translateQueueRef.current = []
      refs.ocrQueueRef.current = []
      refs.pageSourceLoadRef.current.clear()
      return
    }

    const generation = ++refs.generationRef.current
    let cancelled = false
    const snapshotsForRestore = savedPageSnapshots
    setBootstrapping(true)
    setBootstrapError(null)
    setPages([])
    setTotalPages(0)
    setPageAspect(null)
    setTranslationArmed(false)
    setParseArmed(false)
    refs.inFlightRef.current.clear()
    refs.translateQueueRef.current = []
    refs.ocrQueueRef.current = []
    refs.pageSourceLoadRef.current.clear()

    void (async () => {
      try {
        const metadataOnly = isPdfPath(filePath)
        const result = await withTimeout(
          invokeParsePages(filePath, 1, 1, workspaceId, pdfParserBackend, { metadataOnly }),
          resolveParseTimeoutMs(filePath, metadataOnly),
          metadataOnly ? '读取 PDF 信息超时，请重试' : '解析文档超时，请重试或用系统应用打开文件',
        )
        if (cancelled || generation !== refs.generationRef.current) return
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
        refs.pagesRef.current = initialPages
        for (const page of initialPages) {
          if (page.status === 'empty') {
            refs.ocrExhaustedRef.current.add(page.pageNumber)
          }
        }
      } catch (error) {
        if (cancelled || generation !== refs.generationRef.current) return
        setBootstrapError(error instanceof Error ? error.message : 'bootstrap failed')
      } finally {
        if (!cancelled && generation === refs.generationRef.current) {
          setBootstrapping(false)
        }
      }
    })()

    return () => {
      cancelled = true
      refs.generationRef.current += 1
      refs.inFlightRef.current.clear()
      refs.translateQueueRef.current = []
      refs.ocrQueueRef.current = []
      refs.pageSourceLoadRef.current.clear()
    }
  }, [commitTotalPages, documentId, enabled, filePath, pdfParserBackend, refs, savedPageSnapshots, savedPageSnapshotsRef, setBootstrapError, setBootstrapping, setPageAspect, setPages, setParseArmed, setTotalPages, setTranslationArmed, translationParamsRef, workspaceId])

  // Re-apply persisted page snapshots when the document record updates (e.g. after save or sidebar re-select).
  useEffect(() => {
    if (!enabled || !filePath || !documentId || !savedPageSnapshots?.length) return
    if (bootstrapping) return
    if (refs.parseArmedRef.current || refs.odlWarmRunningRef.current || refs.hybridBackfillRunningRef.current) {
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
      refs.pagesRef.current = next
      for (const page of next) {
        if (page.status === 'empty') {
          refs.ocrExhaustedRef.current.add(page.pageNumber)
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
    refs,
    savedPageSnapshots,
    setPages,
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

    refs.translateQueueRef.current = []
    refs.pageSourceLoadRef.current.clear()

    if (
      refs.parseArmedRef.current ||
      refs.pagesRef.current.some((page) => page.status === 'parsing' || page.status === 'parsed')
    ) {
      return
    }

    refs.generationRef.current += 1
    refs.inFlightRef.current.clear()
    refs.ocrQueueRef.current = []

    const count = refs.totalPagesRef.current
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
      refs.pagesRef.current = next
      return next
    })
  }, [autoDetectSource, documentId, enabled, filePath, languages, modelId, refs, savedPageSnapshotsRef, setPages, translationParamsRef])
}

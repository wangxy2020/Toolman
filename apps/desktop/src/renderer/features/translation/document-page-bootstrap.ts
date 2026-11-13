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
import { applySavedPageSnapshots, createLightweightPagesFromSnapshots, pageCountFromSnapshots } from './document-page-snapshots'
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
      refs.translationArmedRef.current = false
      setTranslationArmed(false)
      setParseArmed(false)
      refs.inFlightRef.current.clear()
      refs.translateInFlightRef.current.clear()
      refs.translatePageGenerationRef.current.clear()
      refs.translateQueueRef.current = []
      refs.ocrQueueRef.current = []
      refs.pageSourceLoadRef.current.clear()
      return
    }

    // Document identity change — cancel work. Same file re-runs must not disarm
    // an in-progress translate (that left the header spinning forever).
    const generation = ++refs.generationRef.current
    let cancelled = false
    const snapshotsForRestore = savedPageSnapshotsRef.current
    const restoredCount = pageCountFromSnapshots(snapshotsForRestore)
    setBootstrapError(null)
    refs.translationArmedRef.current = false
    setTranslationArmed(false)
    setParseArmed(false)
    refs.inFlightRef.current.clear()
    refs.translateInFlightRef.current.clear()
    refs.translatePageGenerationRef.current.clear()
    refs.translateQueueRef.current = []
    refs.ocrQueueRef.current = []
    refs.pageSourceLoadRef.current.clear()

    // Saved parse results must paint immediately. Waiting on PDF metadata IPC
    // was wiping the workspace back to "正在加载文档分页" whenever snapshots
    // were cloned (e.g. source-text autosave).
    if (restoredCount > 0 && documentId) {
      const initialPages = createLightweightPagesFromSnapshots(snapshotsForRestore, restoredCount)
      refs.pagesRef.current = initialPages
      setPages(initialPages)
      commitTotalPages(restoredCount)
      for (const page of initialPages) {
        if (page.status === 'empty') {
          refs.ocrExhaustedRef.current.add(page.pageNumber)
        }
      }
      setBootstrapping(false)
    } else {
      setBootstrapping(true)
      setPages([])
      refs.pagesRef.current = []
      setTotalPages(0)
      setPageAspect(null)
    }

    void (async () => {
      try {
        if (restoredCount > 0) {
          // Saved docs already know page count. Re-opening the PDF for metadata
          // shares the one-at-a-time raster queue and stalls the left preview.
          return
        }

        // Do not open large scanned PDFs with renderer PDF.js just for metadata —
        // that alone beachballs the window on 50MB+ JPEG page stacks. Main-process
        // metadataOnly is enough for page count / aspect.
        const metadataOnly = isPdfPath(filePath)
        const result = await withTimeout(
          invokeParsePages(filePath, 1, 1, workspaceId, pdfParserBackend, { metadataOnly }),
          resolveParseTimeoutMs(filePath, metadataOnly),
          metadataOnly ? '读取 PDF 信息超时，请重试' : '解析文档超时，请重试或用系统应用打开文件',
        )
        if (cancelled || generation !== refs.generationRef.current) return
        if (!result.ok) {
          if (restoredCount < 1) setBootstrapError(result.error.message)
          return
        }

        const data = TranslationDocumentParsePagesOutputSchema.parse(result.data)
        const count = Math.max(1, data.totalPages, restoredCount)
        commitTotalPages(count)
        if (data.pageWidth && data.pageHeight && data.pageWidth > 0) {
          setPageAspect(data.pageHeight / data.pageWidth)
        } else if (restoredCount < 1) {
          setPageAspect(null)
        }

        // Restored documents already have page bodies. Rebuilding them here
        // would remount markdown and stall the first PDF preview.
        if (restoredCount > 0) return

        const initialPages = applySavedPageSnapshots(
          hydratePagesFromCache({
            documentId,
            filePath,
            totalPages: count,
            modelId: translationParamsRef.current.modelId,
            languages: translationParamsRef.current.languages,
            autoDetectSource: translationParamsRef.current.autoDetectSource,
            seedPages: [
              ...refs.pagesRef.current.map((page) => ({
                pageNumber: page.pageNumber,
                text: page.sourceText,
              })),
              ...data.pages.map((page) => ({
                pageNumber: page.pageNumber,
                text: page.text,
              })),
            ],
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
        if (restoredCount < 1) {
          setBootstrapError(error instanceof Error ? error.message : 'bootstrap failed')
        }
      } finally {
        if (!cancelled && generation === refs.generationRef.current) {
          setBootstrapping(false)
        }
      }
    })()

    return () => {
      cancelled = true
      // Cleanup of a superseded bootstrap for the SAME document must not cancel
      // an armed translation (pdfParserBackend / workspace churn). Only bump
      // generation when translate is not armed — startTranslation owns its gen.
      if (!refs.translationArmedRef.current) {
        refs.generationRef.current += 1
        refs.translateQueueRef.current = []
        refs.translateInFlightRef.current.clear()
        refs.translatePageGenerationRef.current.clear()
      }
      refs.inFlightRef.current.clear()
      refs.ocrQueueRef.current = []
      refs.pageSourceLoadRef.current.clear()
    }
  }, [commitTotalPages, documentId, enabled, filePath, pdfParserBackend, refs, savedPageSnapshotsRef, setBootstrapError, setBootstrapping, setPageAspect, setPages, setParseArmed, setTotalPages, setTranslationArmed, translationParamsRef, workspaceId])

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

  // Translation model/language changes must not reset ODL preview pages or cancel parse/translate IPC.
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

    // Never touch queues while parse/translate is armed — clearing the translate
    // queue here left pages stuck on「正在翻译」with no worker (IMA dual-pane).
    if (refs.parseArmedRef.current || refs.translationArmedRef.current) {
      return
    }

    const hasActiveDocumentWork = refs.pagesRef.current.some(
      (page) =>
        page.status === 'parsing' ||
        page.status === 'parsed' ||
        page.status === 'translating' ||
        page.status === 'loading-source' ||
        page.status === 'done',
    )
    if (hasActiveDocumentWork) {
      return
    }

    refs.translateQueueRef.current = []
    refs.pageSourceLoadRef.current.clear()
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

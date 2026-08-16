import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
} from 'react'
import type { PdfParserBackend, TranslationLanguage } from '@toolman/shared'
import { buildDocumentPageSnapshots } from './document-page-snapshots'
import { useDocumentPageTranslation, type DocumentPageState } from './useDocumentPageTranslation'
import { useDocumentVisiblePage } from './useDocumentVisiblePage'
import type { TranslationDocumentItem, TranslationDocumentPageSnapshot } from './translation-storage'
import {
  DOCUMENT_PAGE_ZOOM_DEFAULT,
  measurePaneWidth,
  type PageDisplayBox,
  type TranslationDocumentWorkspaceHandle,
} from './translation-document-workspace-types'

type Options = {
  workspaceId: string | null
  modelId: string | null
  activeDocument: TranslationDocumentItem | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  pdfParserBackend: PdfParserBackend
  onTargetTextChange: (text: string) => void
  onSourceTextChange: (text: string) => void
  onBusyChange: (busy: boolean) => void
  onParsingChange?: (parsing: boolean) => void
  onParseProgressChange?: (progress: { completed: number; total: number; percent: number } | null) => void
  onPageSnapshotsChange?: (snapshots: TranslationDocumentPageSnapshot[]) => void
  onErrorChange: (message: string | null) => void
  onPageMetaChange?: (meta: { totalPages: number; currentPage: number }) => void
  pageZoom?: number
  onRegisterActions?: (actions: TranslationDocumentWorkspaceHandle | null) => void
  ref: ForwardedRef<TranslationDocumentWorkspaceHandle>
}

export function useTranslationDocumentWorkspace(options: Options) {
  const {
    workspaceId,
    modelId,
    activeDocument,
    languages,
    autoDetectSource,
    pdfParserBackend,
    onTargetTextChange,
    onSourceTextChange,
    onBusyChange,
    onParsingChange,
    onParseProgressChange,
    onPageSnapshotsChange,
    onErrorChange,
    onPageMetaChange,
    onRegisterActions,
    pageZoom = DOCUMENT_PAGE_ZOOM_DEFAULT,
    ref,
  } = options

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const widthRef = useRef(0)
  const resizeTimerRef = useRef<number | null>(null)
  const [pageBox, setPageBox] = useState<PageDisplayBox>({ width: 400 })
  const pendingTranslateRef = useRef(false)
  const pendingParseRef = useRef(false)
  const bootstrappingRef = useRef(false)
  const modelIdRef = useRef(modelId)
  const pagesRef = useRef<DocumentPageState[]>([])

  const {
    totalPages,
    pages,
    pageAspect,
    bootstrapping,
    bootstrapError,
    parsing,
    translating,
    parseArmed,
    translationArmed,
    parseProgress,
    ensurePageReady,
    startTranslation,
    startParse,
    stopParse,
    stopTranslation,
    focusPage,
    translatedText,
  } = useDocumentPageTranslation({
    filePath: activeDocument?.filePath ?? null,
    documentId: activeDocument?.id ?? null,
    workspaceId,
    modelId,
    languages,
    autoDetectSource,
    pdfParserBackend,
    enabled: Boolean(activeDocument),
    savedPageSnapshots: activeDocument?.pageSnapshots,
  })

  pagesRef.current = pages

  useEffect(() => {
    onPageSnapshotsChange?.(buildDocumentPageSnapshots(pages))
  }, [onPageSnapshotsChange, pages])

  const resolvedTotalPages = Math.max(totalPages, pages.length)
  const currentPage = useDocumentVisiblePage(scrollRef, Boolean(activeDocument) && !bootstrapping)

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const root = scrollRef.current
      if (!root) return
      const safePage = Math.max(1, Math.min(resolvedTotalPages || 1, Math.floor(pageNumber)))
      const row = root.querySelector<HTMLElement>(`[data-page-number="${safePage}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        root.scrollTo({ top: 0, behavior: 'smooth' })
      }
      focusPage(safePage)
    },
    [focusPage, resolvedTotalPages],
  )

  const startTranslationRef = useRef(startTranslation)
  const startParseRef = useRef(startParse)
  const stopTranslationRef = useRef(stopTranslation)
  const stopParseRef = useRef(stopParse)
  startTranslationRef.current = startTranslation
  startParseRef.current = startParse
  stopTranslationRef.current = stopTranslation
  stopParseRef.current = stopParse
  bootstrappingRef.current = bootstrapping
  modelIdRef.current = modelId

  const runStartTranslation = useCallback(() => {
    if (!modelIdRef.current) return false
    if (bootstrappingRef.current) {
      pendingTranslateRef.current = true
      pendingParseRef.current = false
      return true
    }
    return startTranslationRef.current() !== false
  }, [])

  const runStartParse = useCallback(() => {
    if (bootstrappingRef.current) {
      pendingParseRef.current = true
      pendingTranslateRef.current = false
      return true
    }
    return startParseRef.current() !== false
  }, [])

  useEffect(() => {
    if (bootstrapping) return
    if (pendingParseRef.current) {
      pendingParseRef.current = false
      startParseRef.current()
      return
    }
    if (!modelId) return
    if (pendingTranslateRef.current) {
      pendingTranslateRef.current = false
      startTranslationRef.current()
    }
  }, [bootstrapping, modelId])

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage,
      startTranslation: runStartTranslation,
      startParse: runStartParse,
      stopTranslation: () => stopTranslationRef.current(),
      stopParse: () => stopParseRef.current(),
      getPageSnapshots: () => buildDocumentPageSnapshots(pagesRef.current),
    }),
    [runStartParse, runStartTranslation, scrollToPage],
  )

  useEffect(() => {
    const actions: TranslationDocumentWorkspaceHandle = {
      scrollToPage,
      startTranslation: runStartTranslation,
      startParse: runStartParse,
      stopTranslation: () => stopTranslationRef.current(),
      stopParse: () => stopParseRef.current(),
      getPageSnapshots: () => buildDocumentPageSnapshots(pagesRef.current),
    }
    onRegisterActions?.(actions)
    return () => onRegisterActions?.(null)
  }, [onRegisterActions, runStartParse, runStartTranslation, scrollToPage])

  useEffect(() => {
    onPageMetaChange?.({ totalPages: resolvedTotalPages, currentPage })
  }, [currentPage, onPageMetaChange, resolvedTotalPages])

  useEffect(() => {
    onTargetTextChange(translatedText)
  }, [onTargetTextChange, translatedText])

  useEffect(() => {
    const sourceText = pages
      .filter((page) => page.sourceText.trim())
      .map((page) => page.sourceText.trim())
      .join('\n\n')
    const timer = window.setTimeout(() => {
      onSourceTextChange(sourceText)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [onSourceTextChange, pages])

  useEffect(() => {
    onBusyChange(translating)
  }, [onBusyChange, translating])

  useEffect(() => {
    onParsingChange?.(parsing)
  }, [onParsingChange, parsing])

  useEffect(() => {
    onParseProgressChange?.(parseProgress)
  }, [onParseProgressChange, parseProgress])

  useEffect(() => {
    return () => onBusyChange(false)
  }, [onBusyChange])

  useEffect(() => {
    onErrorChange(bootstrapError)
  }, [bootstrapError, onErrorChange])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    const commitWidth = () => {
      const next = measurePaneWidth(root.clientWidth, pageZoom)
      if (Math.abs(next.width - widthRef.current) < 4) return
      widthRef.current = next.width
      setPageBox(next)
    }

    commitWidth()

    const observer = new ResizeObserver(() => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null
        commitWidth()
      }, 120)
    })
    observer.observe(root)

    return () => {
      observer.disconnect()
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [activeDocument?.id, pageZoom])

  const handleEnsurePage = useCallback(
    (pageNumber: number) => {
      void ensurePageReady(pageNumber)
    },
    [ensurePageReady],
  )

  return {
    scrollRef: scrollRef as RefObject<HTMLDivElement | null>,
    pageBox,
    pages,
    pageAspect,
    bootstrapping,
    bootstrapError,
    parseArmed,
    translationArmed,
    resolvedTotalPages,
    handleEnsurePage,
  }
}

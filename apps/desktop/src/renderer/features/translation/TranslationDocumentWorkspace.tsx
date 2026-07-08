import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { PdfParserBackend, TranslationLanguage } from '@toolman/shared'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { TranslationDocumentPageRow } from './TranslationDocumentPageRow'
import {
  buildDocumentPageSnapshots,
} from './document-page-snapshots'
import { useDocumentPageTranslation, type DocumentPageState } from './useDocumentPageTranslation'
import { useDocumentVisiblePage } from './useDocumentVisiblePage'
import type { TranslationDocumentItem, TranslationDocumentPageSnapshot } from './translation-storage'

interface Props {
  workspaceId: string | null
  modelId: string | null
  activeDocument: TranslationDocumentItem | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  pdfParserBackend: PdfParserBackend
  onOpenDocument: () => void
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
}

export interface TranslationDocumentWorkspaceHandle {
  scrollToPage: (pageNumber: number) => void
  startTranslation: () => boolean
  startParse: () => boolean
  stopTranslation: () => void
  stopParse: () => void
  getPageSnapshots: () => TranslationDocumentPageSnapshot[]
}

/** Pane width used for PDF render resolution and layout. */
export interface PageDisplayBox {
  width: number
}

export const DOCUMENT_PAGE_ZOOM_MIN = 0.7
export const DOCUMENT_PAGE_ZOOM_MAX = 1.6
export const DOCUMENT_PAGE_ZOOM_STEP = 0.1
export const DOCUMENT_PAGE_ZOOM_DEFAULT = 1

function isPdfPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf')
}

/**
 * Match contrast translation content width:
 * scrollport − 12px scrollbar gutter, half column, then 16px pane padding on each side.
 */
function measurePaneWidth(viewportWidth: number, zoom: number): PageDisplayBox {
  const columnsWidth = Math.max(0, viewportWidth - 12)
  const paneInner = Math.floor(columnsWidth / 2) - 32
  return {
    width: Math.max(160, Math.round(paneInner * zoom)),
  }
}

export const TranslationDocumentWorkspace = forwardRef<
  TranslationDocumentWorkspaceHandle,
  Props
>(function TranslationDocumentWorkspace(
  {
    workspaceId,
    modelId,
    activeDocument,
    languages,
    autoDetectSource,
    pdfParserBackend,
    onOpenDocument,
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
  },
  ref,
) {
  const { t } = useI18n()
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

  if (!activeDocument) {
    return (
      <div className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-empty">
          <div className="tm-translation-doc-empty-card">
            <div className="tm-translation-doc-empty-icons" aria-hidden="true">
              <span className="tm-translation-doc-badge tm-translation-doc-badge--pdf">PDF</span>
              <span className="tm-translation-doc-badge tm-translation-doc-badge--word">Word</span>
              <span className="tm-translation-doc-badge tm-translation-doc-badge--excel">Excel</span>
            </div>
            <h3 className="tm-translation-doc-empty-title">
              {t('translationPage.documents.emptyTitle')}
            </h3>
            <p className="tm-translation-doc-empty-hint">
              {t('translationPage.documents.emptyHint')}
            </p>
            <button type="button" className="tm-translation-doc-open-btn" onClick={onOpenDocument}>
              <IconPlus size={16} />
              {t('translationPage.documents.open')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (bootstrapping) {
    return (
      <div ref={scrollRef} className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-pages-status">
          <p>{t('translationPage.documents.pagesBootstrapping')}</p>
        </div>
      </div>
    )
  }

  if (bootstrapError) {
    return (
      <div ref={scrollRef} className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-pages-status tm-translation-doc-pages-status--error">
          <p>{bootstrapError}</p>
        </div>
      </div>
    )
  }

  const isPdf = isPdfPath(activeDocument.filePath)

  return (
    <div ref={scrollRef} className="tm-translation-documents">
      {pages.map((page) => (
        <TranslationDocumentPageRow
          key={`${activeDocument.id}-${page.pageNumber}`}
          page={page}
          totalPages={resolvedTotalPages}
          filePath={activeDocument.filePath}
          isPdf={isPdf}
          pageBox={pageBox}
          pageAspect={pageAspect}
          hasModel={Boolean(modelId)}
          parseArmed={parseArmed}
          translationArmed={translationArmed}
          scrollRootRef={scrollRef}
          onEnsurePage={handleEnsurePage}
        />
      ))}
    </div>
  )
})

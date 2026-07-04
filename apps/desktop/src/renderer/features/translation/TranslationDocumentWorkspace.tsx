import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslationLanguage } from '@toolman/shared'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { TranslationDocumentPageRow } from './TranslationDocumentPageRow'
import { useDocumentPageTranslation } from './useDocumentPageTranslation'
import type { TranslationDocumentItem } from './translation-storage'

interface Props {
  modelId: string | null
  activeDocument: TranslationDocumentItem | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  onOpenDocument: () => void
  onTargetTextChange: (text: string) => void
  onSourceTextChange: (text: string) => void
  onBusyChange: (busy: boolean) => void
  onErrorChange: (message: string | null) => void
  translateRequestId: number
}

/** Pane width used for PDF render resolution and layout. */
export interface PageDisplayBox {
  width: number
}

function isPdfPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf')
}

/**
 * Match contrast translation content width:
 * scrollport − 12px scrollbar gutter, half column, then 16px pane padding on each side.
 */
function measurePaneWidth(viewportWidth: number): PageDisplayBox {
  const columnsWidth = Math.max(0, viewportWidth - 12)
  const paneInner = Math.floor(columnsWidth / 2) - 32
  return {
    width: Math.max(160, paneInner),
  }
}

export function TranslationDocumentWorkspace({
  modelId,
  activeDocument,
  languages,
  autoDetectSource,
  onOpenDocument,
  onTargetTextChange,
  onSourceTextChange,
  onBusyChange,
  onErrorChange,
  translateRequestId,
}: Props) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const widthRef = useRef(0)
  const resizeTimerRef = useRef<number | null>(null)
  const [pageBox, setPageBox] = useState<PageDisplayBox>({ width: 400 })

  const {
    totalPages,
    pages,
    bootstrapping,
    bootstrapError,
    busy,
    ensurePageReady,
    startTranslation,
    translatedText,
  } = useDocumentPageTranslation({
    filePath: activeDocument?.filePath ?? null,
    documentId: activeDocument?.id ?? null,
    modelId,
    languages,
    autoDetectSource,
    enabled: Boolean(activeDocument),
  })

  useEffect(() => {
    onTargetTextChange(translatedText)
  }, [onTargetTextChange, translatedText])

  useEffect(() => {
    const sourceText = pages
      .filter((page) => page.sourceText.trim())
      .map((page) => page.sourceText.trim())
      .join('\n\n')
    onSourceTextChange(sourceText)
  }, [onSourceTextChange, pages])

  useEffect(() => {
    onBusyChange(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    return () => onBusyChange(false)
  }, [onBusyChange])

  useEffect(() => {
    onErrorChange(bootstrapError)
  }, [bootstrapError, onErrorChange])

  const startTranslationRef = useRef(startTranslation)
  startTranslationRef.current = startTranslation

  useEffect(() => {
    if (!translateRequestId || !activeDocument || !modelId) return
    startTranslationRef.current()
  }, [activeDocument, modelId, translateRequestId])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    const commitWidth = () => {
      const next = measurePaneWidth(root.clientWidth)
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
  }, [activeDocument?.id])

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
          totalPages={totalPages || pages.length}
          filePath={activeDocument.filePath}
          isPdf={isPdf}
          pageBox={pageBox}
          hasModel={Boolean(modelId)}
          scrollRootRef={scrollRef}
          onEnsurePage={handleEnsurePage}
        />
      ))}
    </div>
  )
}

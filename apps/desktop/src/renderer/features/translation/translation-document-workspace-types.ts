import type { PdfParserBackend, TranslationLanguage } from '@toolman/shared'
import type { TranslationDocumentItem, TranslationDocumentPageSnapshot } from './translation-storage'

export interface TranslationDocumentWorkspaceProps {
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

export const DOCUMENT_PAGE_ZOOM_DEFAULT = 1

export function isPdfPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf')
}

/**
 * Match contrast translation content width:
 * scrollport − 12px scrollbar gutter, half column, then 16px pane padding on each side.
 */
export function measurePaneWidth(viewportWidth: number, zoom: number): PageDisplayBox {
  const columnsWidth = Math.max(0, viewportWidth - 12)
  const paneInner = Math.floor(columnsWidth / 2) - 32
  return {
    width: Math.max(160, Math.round(paneInner * zoom)),
  }
}

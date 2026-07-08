import type { TranslationLanguage } from '@toolman/shared'
import { cachePageState } from './document-page-cache'
import type { TranslationDocumentPageSnapshot } from './translation-storage'
import {
  hasDisplayableParsePreviewContent,
  NO_VALID_PAGE_TEXT,
} from './translation-page-source-quality'
import type { DocumentPageState } from './useDocumentPageTranslation'

export function buildDocumentPageSnapshots(
  pages: DocumentPageState[],
): TranslationDocumentPageSnapshot[] {
  const snapshots: TranslationDocumentPageSnapshot[] = []

  for (const page of pages) {
    const sourceText = page.sourceText.trim()
    const translatedText = page.translatedText.trim()
    const hasPreview = hasDisplayableParsePreviewContent(translatedText, page.parsedMarkdown)

    if (page.status === 'done' && translatedText) {
      snapshots.push({
        pageNumber: page.pageNumber,
        sourceText: page.sourceText,
        translatedText: page.translatedText,
        parsedMarkdown: page.parsedMarkdown,
        status: 'done',
      })
      continue
    }

    if (page.status === 'empty') {
      snapshots.push({
        pageNumber: page.pageNumber,
        sourceText: '',
        translatedText: '',
        status: 'empty',
      })
      continue
    }

    if (hasPreview) {
      snapshots.push({
        pageNumber: page.pageNumber,
        sourceText: page.sourceText,
        translatedText: page.translatedText,
        parsedMarkdown: page.parsedMarkdown,
        status: 'parsed',
      })
      continue
    }

    if (sourceText) {
      snapshots.push({
        pageNumber: page.pageNumber,
        sourceText: page.sourceText,
        translatedText: page.translatedText,
        parsedMarkdown: page.parsedMarkdown,
        status: 'idle',
      })
    }
  }

  return snapshots
}

export function aggregateSnapshotSourceText(snapshots: TranslationDocumentPageSnapshot[]): string {
  return snapshots
    .filter((page) => page.status !== 'empty')
    .map((page) => page.sourceText.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function aggregateSnapshotTargetText(snapshots: TranslationDocumentPageSnapshot[]): string {
  return snapshots
    .filter((page) => page.status === 'done')
    .map((page) => page.translatedText.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function countRestorableSnapshots(
  snapshots: TranslationDocumentPageSnapshot[] | undefined,
): number {
  return snapshots?.filter((page) => page.status === 'parsed' || page.status === 'done').length ?? 0
}

function snapshotToPageState(
  page: DocumentPageState,
  snapshot: TranslationDocumentPageSnapshot,
): DocumentPageState {
  const pageStatus =
    snapshot.status === 'empty'
      ? ('empty' as const)
      : snapshot.status === 'done'
        ? ('done' as const)
        : snapshot.status === 'parsed'
          ? ('parsed' as const)
          : ('idle' as const)

  return {
    ...page,
    sourceText: snapshot.sourceText,
    translatedText: snapshot.translatedText,
    parsedMarkdown: snapshot.parsedMarkdown,
    status: pageStatus,
    error: snapshot.status === 'empty' ? NO_VALID_PAGE_TEXT : undefined,
  }
}

function pageHasRestoredContent(page: DocumentPageState): boolean {
  if (page.status === 'done' && page.translatedText.trim()) return true
  if (page.status === 'parsed' && hasDisplayableParsePreviewContent(page.translatedText, page.parsedMarkdown)) {
    return true
  }
  if (page.status === 'empty') return true
  return false
}

export function applySavedPageSnapshots(
  pages: DocumentPageState[],
  snapshots: TranslationDocumentPageSnapshot[] | undefined,
  options: {
    documentId: string
    filePath: string
    modelId: string | null
    languages: [TranslationLanguage, TranslationLanguage]
    autoDetectSource: boolean
  },
  mergeWithExisting = false,
): DocumentPageState[] {
  if (!snapshots?.length) return pages

  const byPage = new Map(snapshots.map((snapshot) => [snapshot.pageNumber, snapshot]))

  return pages.map((page) => {
    const snapshot = byPage.get(page.pageNumber)
    if (!snapshot) return page
    if (mergeWithExisting && pageHasRestoredContent(page)) return page

    const next = snapshotToPageState(page, snapshot)

    cachePageState(
      options.documentId,
      options.filePath,
      options.modelId,
      options.languages,
      options.autoDetectSource,
      next,
    )

    return next
  })
}

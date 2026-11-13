import type { TranslationLanguage } from '@toolman/shared'
import { cachePageState } from './document-page-cache'
import { splitDocumentPageFitMarkdown, writeDocumentPageFitMarkdown } from './document-page-fit'
import { getCachedPageFit } from './document-page-fit-cache'
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

export function pageCountFromSnapshots(
  snapshots: TranslationDocumentPageSnapshot[] | undefined,
): number {
  if (!snapshots?.length) return 0
  return snapshots.reduce((max, page) => Math.max(max, page.pageNumber), 0)
}

function pageMatchesSnapshot(
  page: DocumentPageState,
  snapshot: TranslationDocumentPageSnapshot,
): boolean {
  const expected =
    snapshot.status === 'empty'
      ? 'empty'
      : snapshot.status === 'done'
        ? 'done'
        : snapshot.status === 'parsed'
          ? 'parsed'
          : 'idle'
  return (
    page.status === expected &&
    page.sourceText === snapshot.sourceText &&
    page.translatedText === snapshot.translatedText &&
    (page.parsedMarkdown ?? '') === (snapshot.parsedMarkdown ?? '')
  )
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
  let changed = false

  const nextPages = pages.map((page) => {
    const snapshot = byPage.get(page.pageNumber)
    if (!snapshot) return page
    if (mergeWithExisting && pageHasRestoredContent(page)) return page
    if (mergeWithExisting) return page
    if (pageMatchesSnapshot(page, snapshot)) return page

    changed = true
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

  return changed ? nextPages : pages
}

export function createLightweightPagesFromSnapshots(
  snapshots: TranslationDocumentPageSnapshot[] | undefined,
  totalPages: number,
): DocumentPageState[] {
  const count = Math.max(1, Math.floor(totalPages) || 1)
  const byPage = new Map((snapshots ?? []).map((snapshot) => [snapshot.pageNumber, snapshot]))

  return Array.from({ length: count }, (_, index) => {
    const pageNumber = index + 1
    const snapshot = byPage.get(pageNumber)
    if (!snapshot) {
      return { pageNumber, sourceText: '', translatedText: '', status: 'idle' as const }
    }
    if (snapshot.status === 'empty') {
      return {
        pageNumber,
        sourceText: '',
        translatedText: '',
        status: 'empty' as const,
        error: NO_VALID_PAGE_TEXT,
      }
    }
    return {
      pageNumber,
      sourceText: '',
      translatedText: '',
      status:
        snapshot.status === 'done'
          ? ('done' as const)
          : snapshot.status === 'parsed'
            ? ('parsed' as const)
            : ('idle' as const),
    }
  })
}

export function resolvePageFromSnapshot(
  page: DocumentPageState,
  snapshot: TranslationDocumentPageSnapshot | undefined,
): DocumentPageState {
  if (!snapshot) return page
  if (pageHasRestoredContent(page)) return page
  return snapshotToPageState(page, snapshot)
}

export function mergeLiveSnapshotsWithSaved(
  live: TranslationDocumentPageSnapshot[],
  saved: TranslationDocumentPageSnapshot[] | undefined,
): TranslationDocumentPageSnapshot[] {
  if (!saved?.length) return live
  const byPage = new Map(saved.map((item) => [item.pageNumber, item]))
  for (const item of live) {
    const hasBody =
      item.status === 'empty' ||
      Boolean(item.sourceText.trim()) ||
      Boolean(item.translatedText.trim()) ||
      Boolean(item.parsedMarkdown?.trim())
    if (hasBody) byPage.set(item.pageNumber, item)
  }
  return [...byPage.values()].sort((left, right) => left.pageNumber - right.pageNumber)
}

export function pagesHaveIncompleteSnapshotBodies(
  pages: DocumentPageState[],
  snapshots: TranslationDocumentPageSnapshot[] | undefined,
): boolean {
  if (!snapshots?.length) return false
  const byPage = new Map(pages.map((page) => [page.pageNumber, page]))
  return snapshots.some((snapshot) => {
    if (snapshot.status === 'empty') return false
    if (!snapshot.sourceText.trim() && !snapshot.translatedText.trim() && !snapshot.parsedMarkdown?.trim()) {
      return false
    }
    const page = byPage.get(snapshot.pageNumber)
    return !page || !pageHasRestoredContent(page)
  })
}

/** Write measured type settings into snapshot Markdown before save. */
export function applyFitRecordsToSnapshots(
  snapshots: TranslationDocumentPageSnapshot[],
  documentId: string | null,
): TranslationDocumentPageSnapshot[] {
  if (!documentId || snapshots.length === 0) return snapshots
  let changed = false
  const next = snapshots.map((snapshot) => {
    const fit = getCachedPageFit(documentId, snapshot.pageNumber)
    const raw = snapshot.parsedMarkdown ?? snapshot.translatedText
    if (!fit || !raw.trim()) return snapshot
    const written = writeDocumentPageFitMarkdown(splitDocumentPageFitMarkdown(raw).body, fit)
    if (written === snapshot.parsedMarkdown) return snapshot
    changed = true
    return { ...snapshot, parsedMarkdown: written }
  })
  return changed ? next : snapshots
}

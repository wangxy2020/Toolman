import {
  DOCUMENT_PAGE_FIT_PROSE_CAPS,
  DOCUMENT_PAGE_FIT_TABLE_CAPS,
  splitDocumentPageFitMarkdown,
  type DocumentPageFitRecord,
} from './document-page-fit'
import { getCachedPageFit, setCachedPageFit } from './document-page-fit-cache'
import { seedDocumentPageNaturalFit } from './document-page-fit-shared'
import {
  hasVisibleParsePreviewBody,
  htmlPreviewToVisibleText,
  resolveParsePreviewKind,
  usesDocumentPageTableFit,
  type ParsePreviewKind,
} from './translation-page-source-quality'
import type { DocumentPageState } from './document-page-types'
import type { TranslationDocumentPageSnapshot } from './translation-storage'

/** Display cache for one page — HTML skips the expensive strip-to-plain pass. */
export type DocumentPageBody = {
  kind: ParsePreviewKind
  plain: string
  markdown: string
  fit?: DocumentPageFitRecord
}

export function toDocumentPageBody(
  text: string,
  markdown?: string,
  options?: { documentId?: string | null; pageNumber?: number },
): DocumentPageBody | null {
  const rawMarkdown = (markdown ?? text).trim()
  const rawPlain = text.trim() || rawMarkdown
  const split = splitDocumentPageFitMarkdown(rawMarkdown)
  const bodyMarkdown = split.body || rawMarkdown
  const bodyPlain = splitDocumentPageFitMarkdown(rawPlain).body || rawPlain
  if (!hasVisibleParsePreviewBody(bodyPlain, bodyMarkdown)) return null
  const kind = resolveParsePreviewKind(bodyPlain, bodyMarkdown)
  const fit =
    split.fit ??
    (options?.pageNumber ? getCachedPageFit(options.documentId, options.pageNumber) : null)
  if (fit && options?.documentId && options.pageNumber) {
    setCachedPageFit(options.documentId, options.pageNumber, fit)
    const table = usesDocumentPageTableFit(bodyMarkdown) || usesDocumentPageTableFit(bodyPlain)
    seedDocumentPageNaturalFit({
      documentId: options.documentId,
      pageNumber: options.pageNumber,
      kind: table ? 'table' : 'prose',
      fontSize: fit.fontSize,
      caps: table ? DOCUMENT_PAGE_FIT_TABLE_CAPS : DOCUMENT_PAGE_FIT_PROSE_CAPS,
    })
  }
  if (kind === 'html') {
    return { kind, plain: '', markdown: bodyMarkdown, ...(fit ? { fit } : {}) }
  }
  if (kind === 'markdown') {
    return { kind, plain: bodyPlain, markdown: bodyMarkdown, ...(fit ? { fit } : {}) }
  }
  return {
    kind,
    plain: htmlPreviewToVisibleText(bodyPlain),
    markdown: bodyMarkdown,
    ...(fit ? { fit } : {}),
  }
}

export function snapshotToPageBody(
  snapshot: TranslationDocumentPageSnapshot | undefined,
  documentId?: string | null,
): DocumentPageBody | null {
  if (!snapshot || snapshot.status === 'empty') return null
  return toDocumentPageBody(snapshot.translatedText, snapshot.parsedMarkdown, {
    documentId,
    pageNumber: snapshot.pageNumber,
  })
}

export function pageStateToPageBody(
  page: DocumentPageState,
  documentId?: string | null,
): DocumentPageBody | null {
  return toDocumentPageBody(page.translatedText, page.parsedMarkdown, {
    documentId,
    pageNumber: page.pageNumber,
  })
}

/** Snapshot index only — classify a page the first time it is displayed. */
export function createDocumentPageBodyLookup(
  snapshots: TranslationDocumentPageSnapshot[] | undefined,
  pages: DocumentPageState[],
  documentId?: string | null,
): { get: (pageNumber: number) => DocumentPageBody | undefined } {
  const snapshotByPage = new Map((snapshots ?? []).map((snapshot) => [snapshot.pageNumber, snapshot] as const))
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page] as const))
  const cache = new Map<number, DocumentPageBody | null>()

  return {
    get(pageNumber: number) {
      if (cache.has(pageNumber)) return cache.get(pageNumber) ?? undefined
      const live = pageByNumber.get(pageNumber)
      const body =
        (live ? pageStateToPageBody(live, documentId) : null) ??
        snapshotToPageBody(snapshotByPage.get(pageNumber), documentId)
      cache.set(pageNumber, body)
      return body ?? undefined
    },
  }
}

export function resolvePageForDisplay(
  page: DocumentPageState,
  body: DocumentPageBody | null | undefined,
  attachBody: boolean,
): DocumentPageState {
  if (!attachBody) {
    if (!page.sourceText && !page.translatedText && !page.parsedMarkdown) return page
    return {
      ...page,
      sourceText: '',
      translatedText: '',
      parsedMarkdown: undefined,
    }
  }
  if (!body) return page
  // Live translation / done pages must keep their own text — body.plain is often
  // empty for ODL HTML and was wiping the Chinese result from the right pane.
  if (
    page.status === 'done' ||
    page.status === 'translating' ||
    page.status === 'loading-source' ||
    page.status === 'error'
  ) {
    return {
      ...page,
      ...(page.status === 'done' && page.translatedText.trim()
        ? { parsedMarkdown: undefined }
        : {}),
    }
  }
  return {
    ...page,
    translatedText: body.plain,
    parsedMarkdown: body.markdown,
  }
}

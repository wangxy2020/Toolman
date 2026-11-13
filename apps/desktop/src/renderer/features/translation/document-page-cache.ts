import type { TranslationLanguage } from '@toolman/shared'
import type { DocumentPageState, DocumentPageStatus } from './useDocumentPageTranslation'
import {
  isPdfPageMarkerOnly,
  sanitizeParsePreviewContent,
} from './translation-page-source-quality'

export interface CachedPageText {
  sourceText: string
  translatedText: string
  parsedMarkdown?: string
  status: Extract<DocumentPageStatus, 'done' | 'empty' | 'idle'>
}

export interface CachedParsePage {
  translatedText: string
  parsedMarkdown?: string
  status: Extract<DocumentPageStatus, 'parsed' | 'empty'>
}

const sourceTextCache = new Map<string, string>()
const pageTextCache = new Map<string, CachedPageText>()
const parsePageCache = new Map<string, CachedParsePage>()
const pageImageCache = new Map<string, string>()
/** Keep enough left-pane frames that flipping back 1–2 pages hits cache (no main render). */
export const MAX_PAGE_IMAGE_CACHE = 24
const previewImageInflight = new Map<string, Promise<string>>()
const pageImageCacheListeners = new Set<() => void>()
/** Keys currently shown in mounted left-pane slots — never revoke these blobs. */
const pinnedPageImageKeys = new Map<string, number>()
const MAX_PARSE_PAGE_CACHE = 2000
const MAX_TRANSLATION_PAGE_CACHE = 2000

function notifyPageImageCacheListeners() {
  for (const listener of pageImageCacheListeners) {
    try {
      listener()
    } catch {
      // Listeners must not break cache writes.
    }
  }
}

/** Subscribe to left-pane raster cache inserts/evictions (prefetch → neighbor paint). */
export function subscribePageImageCache(listener: () => void): () => void {
  pageImageCacheListeners.add(listener)
  return () => {
    pageImageCacheListeners.delete(listener)
  }
}

export function pinPageImageKey(key: string): void {
  if (!key) return
  pinnedPageImageKeys.set(key, (pinnedPageImageKeys.get(key) ?? 0) + 1)
}

export function unpinPageImageKey(key: string): void {
  if (!key) return
  const next = (pinnedPageImageKeys.get(key) ?? 0) - 1
  if (next <= 0) pinnedPageImageKeys.delete(key)
  else pinnedPageImageKeys.set(key, next)
}

function isPageImageKeyPinned(key: string): boolean {
  return (pinnedPageImageKeys.get(key) ?? 0) > 0
}

export function parsePageCacheKey(documentId: string, pageNumber: number): string {
  return `${documentId}::parse:v5::${pageNumber}`
}

export function sourceTextCacheKey(filePath: string, pageNumber: number): string {
  return `${filePath}::${pageNumber}`
}

export function pageTextCacheKey(
  documentId: string,
  pageNumber: number,
  modelId: string,
  languages: [TranslationLanguage, TranslationLanguage],
  autoDetectSource: boolean,
): string {
  return `${documentId}::${pageNumber}::${modelId}::${languages[0]}-${languages[1]}::${autoDetectSource ? '1' : '0'}`
}

export function pageImageCacheKey(
  filePath: string,
  pageNumber: number,
  renderWidth: number,
): string {
  return `${filePath}::${pageNumber}::${renderWidth}`
}

/** Any cached raster for this page (any width) — used to avoid white remounts. */
export function getAnyCachedPageImage(filePath: string, pageNumber: number): string | null {
  const prefix = `${filePath}::${pageNumber}::`
  let bestUrl: string | null = null
  let bestWidth = -1
  for (const [key, url] of pageImageCache) {
    if (!key.startsWith(prefix)) continue
    const widthPart = key.slice(prefix.length)
    const width = Number.parseInt(widthPart, 10)
    if (!Number.isFinite(width)) continue
    if (width >= bestWidth) {
      bestWidth = width
      bestUrl = url
    }
  }
  if (bestUrl && bestWidth >= 0) {
    // Touch LRU for the winning key.
    getCachedPageImage(pageImageCacheKey(filePath, pageNumber, bestWidth))
  }
  return bestUrl
}

export function getCachedSourceText(filePath: string, pageNumber: number): string | null {
  return sourceTextCache.get(sourceTextCacheKey(filePath, pageNumber)) ?? null
}

export function setCachedSourceText(filePath: string, pageNumber: number, text: string): void {
  sourceTextCache.set(sourceTextCacheKey(filePath, pageNumber), text)
}

export function getCachedPageText(key: string): CachedPageText | null {
  return pageTextCache.get(key) ?? null
}

export function setCachedPageText(key: string, value: CachedPageText): void {
  pageTextCache.delete(key)
  pageTextCache.set(key, value)
  while (pageTextCache.size > MAX_TRANSLATION_PAGE_CACHE) {
    const oldest = pageTextCache.keys().next().value
    if (!oldest) break
    pageTextCache.delete(oldest)
  }
}

export function getCachedParsePage(documentId: string, pageNumber: number): CachedParsePage | null {
  return parsePageCache.get(parsePageCacheKey(documentId, pageNumber)) ?? null
}

export function setCachedParsePage(
  documentId: string,
  pageNumber: number,
  value: CachedParsePage,
): void {
  const key = parsePageCacheKey(documentId, pageNumber)
  parsePageCache.delete(key)
  parsePageCache.set(key, value)
  while (parsePageCache.size > MAX_PARSE_PAGE_CACHE) {
    const oldest = parsePageCache.keys().next().value
    if (!oldest) break
    parsePageCache.delete(oldest)
  }
}

function revokePageImageUrl(url: string) {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Ignore already-revoked or non-blob URLs (tests).
  }
}

export function getCachedPageImage(key: string): string | null {
  const url = pageImageCache.get(key)
  if (!url) return null
  // Refresh LRU order.
  pageImageCache.delete(key)
  pageImageCache.set(key, url)
  return url
}

export function setCachedPageImage(key: string, objectUrl: string): void {
  const previous = pageImageCache.get(key)
  if (previous && previous !== objectUrl) {
    revokePageImageUrl(previous)
  }
  pageImageCache.delete(key)
  pageImageCache.set(key, objectUrl)
  while (pageImageCache.size > MAX_PAGE_IMAGE_CACHE) {
    let evicted = false
    for (const oldestKey of pageImageCache.keys()) {
      if (isPageImageKeyPinned(oldestKey)) continue
      const oldestUrl = pageImageCache.get(oldestKey)
      pageImageCache.delete(oldestKey)
      if (oldestUrl) revokePageImageUrl(oldestUrl)
      evicted = true
      break
    }
    if (!evicted) break
  }
  notifyPageImageCacheListeners()
}

export function listCachedPageImageUrls(
  filePath: string,
  renderWidth: number,
  startPage: number,
  endPage: number,
): string[] {
  const urls: string[] = []
  const start = Math.max(1, Math.floor(startPage) || 1)
  const end = Math.max(start, Math.floor(endPage) || start)
  for (let page = start; page <= end; page += 1) {
    const url = getCachedPageImage(pageImageCacheKey(filePath, page, renderWidth))
    if (url) urls.push(url)
  }
  return urls
}

export function rememberPageImageInflight(key: string, factory: () => Promise<string>): Promise<string> {
  const existing = previewImageInflight.get(key)
  if (existing) return existing
  const pending = factory()
  const tracked = pending.finally(() => {
    if (previewImageInflight.get(key) === tracked) previewImageInflight.delete(key)
  })
  previewImageInflight.set(key, tracked)
  return tracked
}

export function getPageImageInflight(key: string): Promise<string> | null {
  return previewImageInflight.get(key) ?? null
}

export function clearPageImageCache(): void {
  for (const url of pageImageCache.values()) revokePageImageUrl(url)
  pageImageCache.clear()
  previewImageInflight.clear()
  pinnedPageImageKeys.clear()
  notifyPageImageCacheListeners()
}

/** Hydrate page slots from in-memory cache (survives scroll / remount within session). */
export function hydratePagesFromCache(options: {
  documentId: string
  filePath: string
  totalPages: number
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  autoDetectSource: boolean
  seedPages: Array<{ pageNumber: number; text: string }>
}): DocumentPageState[] {
  const { documentId, filePath, totalPages, modelId, languages, autoDetectSource, seedPages } =
    options
  const seededByPage = new Map(seedPages.map((page) => [page.pageNumber, page.text]))

  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1
    const seeded = seededByPage.get(pageNumber) ?? ''
    const cachedSource = getCachedSourceText(filePath, pageNumber)
    const sourceText = (cachedSource ?? seeded).trim() ? (cachedSource ?? seeded) : seeded

    const textKey = modelId
      ? pageTextCacheKey(documentId, pageNumber, modelId, languages, autoDetectSource)
      : null
    const cachedPage = textKey ? getCachedPageText(textKey) : null
    const cachedParse = getCachedParsePage(documentId, pageNumber)

    if (cachedPage?.status === 'empty') {
      return {
        pageNumber,
        sourceText: '',
        translatedText: '',
        status: 'idle' as const,
      }
    }

    if (cachedPage?.status === 'done' && cachedPage.translatedText.trim()) {
      const resolvedSource = cachedPage.sourceText || sourceText
      if (resolvedSource.trim()) setCachedSourceText(filePath, pageNumber, resolvedSource)
      return {
        pageNumber,
        sourceText: resolvedSource,
        translatedText: cachedPage.translatedText,
        parsedMarkdown: cachedPage.parsedMarkdown,
        status: 'done' as const,
      }
    }

    if (cachedParse?.status === 'parsed') {
      const sanitized = sanitizeParsePreviewContent(
        cachedParse.translatedText,
        cachedParse.parsedMarkdown,
      )
      const hasContent =
        (sanitized.markdown.trim() && !isPdfPageMarkerOnly(sanitized.markdown)) ||
        (sanitized.text.trim() && !isPdfPageMarkerOnly(sanitized.text))
      if (!hasContent) {
        return {
          pageNumber,
          sourceText: sourceText.trim() ? sourceText : '',
          translatedText: '',
          status: 'idle' as const,
        }
      }
      return {
        pageNumber,
        sourceText: sourceText.trim() ? sourceText : '',
        translatedText: sanitized.text,
        parsedMarkdown: sanitized.markdown,
        status: 'parsed' as const,
      }
    }

    const resolvedSource = cachedPage?.sourceText || sourceText
    if (resolvedSource.trim()) {
      setCachedSourceText(filePath, pageNumber, resolvedSource)
      return {
        pageNumber,
        sourceText: resolvedSource,
        translatedText: cachedPage?.translatedText ?? '',
        status: 'idle' as const,
      }
    }

    return {
      pageNumber,
      sourceText: '',
      translatedText: '',
      status: 'idle' as const,
    }
  })
}

export function cachePageState(
  documentId: string,
  filePath: string,
  modelId: string | null,
  languages: [TranslationLanguage, TranslationLanguage],
  autoDetectSource: boolean,
  page: Pick<
    DocumentPageState,
    'pageNumber' | 'sourceText' | 'translatedText' | 'parsedMarkdown' | 'status'
  >,
): void {
  if (page.sourceText.trim()) {
    setCachedSourceText(filePath, page.pageNumber, page.sourceText)
  }

  if (page.status === 'parsed') {
    setCachedParsePage(documentId, page.pageNumber, {
      translatedText: page.translatedText,
      parsedMarkdown: page.parsedMarkdown,
      status: 'parsed',
    })
    return
  }

  if (!modelId) return
  if (page.status !== 'done' && page.status !== 'idle') return

  setCachedPageText(
    pageTextCacheKey(documentId, page.pageNumber, modelId, languages, autoDetectSource),
    {
      sourceText: page.sourceText,
      translatedText: page.translatedText,
      parsedMarkdown: page.parsedMarkdown,
      status: page.status === 'done' ? page.status : 'idle',
    },
  )
}

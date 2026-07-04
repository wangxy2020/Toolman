import type { TranslationLanguage } from '@toolman/shared'
import type { DocumentPageState, DocumentPageStatus } from './useDocumentPageTranslation'

export interface CachedPageText {
  sourceText: string
  translatedText: string
  status: Extract<DocumentPageStatus, 'done' | 'empty' | 'idle'>
}

const sourceTextCache = new Map<string, string>()
const pageTextCache = new Map<string, CachedPageText>()
const pageImageCache = new Map<string, string>()
const MAX_IMAGE_CACHE = 24

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
  pageTextCache.set(key, value)
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
    URL.revokeObjectURL(previous)
  }
  pageImageCache.delete(key)
  pageImageCache.set(key, objectUrl)
  while (pageImageCache.size > MAX_IMAGE_CACHE) {
    const oldestKey = pageImageCache.keys().next().value
    if (!oldestKey) break
    const oldestUrl = pageImageCache.get(oldestKey)
    pageImageCache.delete(oldestKey)
    if (oldestUrl) URL.revokeObjectURL(oldestUrl)
  }
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

  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1
    const seeded = seedPages.find((page) => page.pageNumber === pageNumber)?.text ?? ''
    const cachedSource = getCachedSourceText(filePath, pageNumber)
    const sourceText = (cachedSource ?? seeded).trim() ? (cachedSource ?? seeded) : seeded

    const textKey = modelId
      ? pageTextCacheKey(documentId, pageNumber, modelId, languages, autoDetectSource)
      : null
    const cachedPage = textKey ? getCachedPageText(textKey) : null

    if (cachedPage?.status === 'done' && cachedPage.translatedText.trim()) {
      const resolvedSource = cachedPage.sourceText || sourceText
      if (resolvedSource.trim()) setCachedSourceText(filePath, pageNumber, resolvedSource)
      return {
        pageNumber,
        sourceText: resolvedSource,
        translatedText: cachedPage.translatedText,
        status: 'done' as const,
      }
    }

    if (cachedPage?.status === 'empty') {
      return {
        pageNumber,
        sourceText: cachedPage.sourceText || sourceText,
        translatedText: '',
        status: 'empty' as const,
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
  page: Pick<DocumentPageState, 'pageNumber' | 'sourceText' | 'translatedText' | 'status'>,
): void {
  if (page.sourceText.trim()) {
    setCachedSourceText(filePath, page.pageNumber, page.sourceText)
  }

  if (!modelId) return
  if (page.status !== 'done' && page.status !== 'empty' && page.status !== 'idle') return

  setCachedPageText(
    pageTextCacheKey(documentId, page.pageNumber, modelId, languages, autoDetectSource),
    {
      sourceText: page.sourceText,
      translatedText: page.translatedText,
      status: page.status === 'done' || page.status === 'empty' ? page.status : 'idle',
    },
  )
}

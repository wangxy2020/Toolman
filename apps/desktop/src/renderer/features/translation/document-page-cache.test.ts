import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPageImageCache,
  getCachedPageImage,
  MAX_PAGE_IMAGE_CACHE,
  pageImageCacheKey,
  setCachedPageImage,
} from './document-page-cache'

describe('page image cache', () => {
  afterEach(() => {
    clearPageImageCache()
  })

  it('keeps more recently used previews when the cache is full', () => {
    for (let page = 1; page <= MAX_PAGE_IMAGE_CACHE + 5; page += 1) {
      setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', page, 800), `blob:page-${page}`)
    }

    expect(getCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 1, 800))).toBeNull()
    expect(getCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 6, 800))).toBe('blob:page-6')
    expect(getCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', MAX_PAGE_IMAGE_CACHE + 5, 800))).toBe(
      `blob:page-${MAX_PAGE_IMAGE_CACHE + 5}`,
    )
  })

  it('does not drop a page that was viewed again before eviction', () => {
    for (let page = 1; page <= MAX_PAGE_IMAGE_CACHE; page += 1) {
      setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', page, 800), `blob:page-${page}`)
    }
    expect(getCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 1, 800))).toBe('blob:page-1')
    setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', MAX_PAGE_IMAGE_CACHE + 1, 800), 'blob:page-next')
    expect(getCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 1, 800))).toBe('blob:page-1')
    expect(getCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 2, 800))).toBeNull()
  })
})

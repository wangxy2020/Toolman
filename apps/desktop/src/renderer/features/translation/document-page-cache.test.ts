import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearPageImageCache,
  getAnyCachedPageImage,
  getCachedPageImage,
  MAX_PAGE_IMAGE_CACHE,
  pageImageCacheKey,
  pinPageImageKey,
  setCachedPageImage,
  subscribePageImageCache,
  unpinPageImageKey,
} from './document-page-cache'

describe('page image cache', () => {
  afterEach(() => {
    clearPageImageCache()
  })

  it('notifies subscribers when a preview raster is stored', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePageImageCache(listener)
    setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 2, 720), 'blob:page-2')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 3, 720), 'blob:page-3')
    expect(listener).toHaveBeenCalledTimes(1)
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

  it('does not revoke a pinned preview still shown on screen', () => {
    const pinnedKey = pageImageCacheKey('/tmp/doc.pdf', 1, 560)
    pinPageImageKey(pinnedKey)
    setCachedPageImage(pinnedKey, 'blob:page-1')
    for (let page = 2; page <= MAX_PAGE_IMAGE_CACHE + 2; page += 1) {
      setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', page, 560), `blob:page-${page}`)
    }
    expect(getCachedPageImage(pinnedKey)).toBe('blob:page-1')
    unpinPageImageKey(pinnedKey)
  })

  it('returns any cached width for a page to avoid white remounts', () => {
    setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 3, 400), 'blob:page-3-small')
    setCachedPageImage(pageImageCacheKey('/tmp/doc.pdf', 3, 800), 'blob:page-3-large')
    expect(getAnyCachedPageImage('/tmp/doc.pdf', 3)).toBe('blob:page-3-large')
    expect(getAnyCachedPageImage('/tmp/doc.pdf', 4)).toBeNull()
  })
})


import { describe, expect, it } from 'vitest'
import { createPreviewJpegCache } from './preview-jpeg-cache.js'

describe('preview jpeg cache', () => {
  it('returns a previously stored raster without dropping recent pages', () => {
    const cache = createPreviewJpegCache(2)
    const first = {
      jpeg: Buffer.from('one'),
      width: 10,
      height: 10,
      totalPages: 8,
      mimeType: 'image/jpeg' as const,
    }
    const second = {
      ...first,
      jpeg: Buffer.from('two'),
    }
    const third = {
      ...first,
      jpeg: Buffer.from('three'),
    }

    cache.set(cache.key('/tmp/a.pdf', 1, 1, 800), first)
    cache.set(cache.key('/tmp/a.pdf', 1, 2, 800), second)
    expect(cache.get(cache.key('/tmp/a.pdf', 1, 1, 800))?.jpeg.toString()).toBe('one')
    cache.set(cache.key('/tmp/a.pdf', 1, 3, 800), third)

    expect(cache.get(cache.key('/tmp/a.pdf', 1, 1, 800))?.jpeg.toString()).toBe('one')
    expect(cache.get(cache.key('/tmp/a.pdf', 1, 2, 800))).toBeNull()
    expect(cache.get(cache.key('/tmp/a.pdf', 1, 3, 800))?.jpeg.toString()).toBe('three')
    expect(cache.size).toBe(2)
  })
})

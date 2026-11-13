export interface PreviewJpegEntry {
  jpeg: Buffer
  width: number
  height: number
  totalPages: number
  mimeType: 'image/jpeg'
}

/** LRU of rasterized preview JPEGs so scrolling back does not re-render the page. */
export function createPreviewJpegCache(limit: number) {
  const items = new Map<string, PreviewJpegEntry>()
  const max = Math.max(1, Math.floor(limit) || 1)

  return {
    key(filePath: string, mtimeMs: number, pageNumber: number, targetWidth: number): string {
      return `${filePath}::${mtimeMs}::${pageNumber}::${Math.round(targetWidth)}`
    },
    get(key: string): PreviewJpegEntry | null {
      const entry = items.get(key)
      if (!entry) return null
      items.delete(key)
      items.set(key, entry)
      return entry
    },
    set(key: string, entry: PreviewJpegEntry): void {
      items.delete(key)
      items.set(key, entry)
      while (items.size > max) {
        const oldest = items.keys().next().value
        if (!oldest) break
        items.delete(oldest)
      }
    },
    get size() {
      return items.size
    },
  }
}

/**
 * In-worker / in-process LRU. Main process also keeps a larger durable cache so a
 * worker restart does not force full re-rasters of pages already painted.
 */
export const previewJpegCache = createPreviewJpegCache(32)

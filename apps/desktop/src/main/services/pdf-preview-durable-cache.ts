import { createPreviewJpegCache, type PreviewJpegEntry } from '@toolman/knowledge'

/**
 * Lives in Electron main (not the preview worker). Survives worker soft-cancel
 * and even emergency worker restarts, so flipped-to pages that were already
 * rasterized do not pay a full scan re-render.
 */
const durablePreviewJpegCache = createPreviewJpegCache(48)

export function getDurablePdfPreviewJpeg(
  filePath: string,
  mtimeMs: number,
  pageNumber: number,
  targetWidth: number,
): PreviewJpegEntry | null {
  return durablePreviewJpegCache.get(
    durablePreviewJpegCache.key(filePath, mtimeMs, pageNumber, targetWidth),
  )
}

export function setDurablePdfPreviewJpeg(
  filePath: string,
  mtimeMs: number,
  pageNumber: number,
  targetWidth: number,
  entry: PreviewJpegEntry,
): void {
  durablePreviewJpegCache.set(
    durablePreviewJpegCache.key(filePath, mtimeMs, pageNumber, targetWidth),
    entry,
  )
}

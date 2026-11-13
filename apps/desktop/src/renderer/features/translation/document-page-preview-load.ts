import {
  IpcChannel,
  TranslationDocumentRenderPageOutputSchema,
} from '@toolman/shared'
import {
  getCachedPageImage,
  getPageImageInflight,
  pageImageCacheKey,
  rememberPageImageInflight,
  setCachedPageImage,
} from './document-page-cache'
import { isDocumentScrollBusy } from './document-scroll-gate'
import { resolvePdfPreviewPriority } from './document-page-preview-policy'

/**
 * Decode base64 via chunked `atob` — Electron CSP blocks `fetch(data:…)`
 * ("Failed to fetch"), so data-URL fetch cannot be used here.
 */
async function base64ToObjectUrl(base64: string, mimeType: string): Promise<string> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  const chunk = 48_000
  for (let offset = 0; offset < binary.length; offset += chunk) {
    const end = Math.min(binary.length, offset + chunk)
    for (let index = offset; index < end; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    if (end < binary.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

export function isPdfPreviewRenderDropped(error: unknown): boolean {
  return (
    (error instanceof Error && error.message === 'PREVIEW_RENDER_DROPPED') ||
    (error instanceof Error && error.name === 'PreviewRenderDroppedError') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ABORTED')
  )
}

function invokePdfPageRender(options: {
  filePath: string
  pageNumber: number
  renderWidth: number
  currentPage: number
}) {
  return window.api.invoke(IpcChannel.TranslationDocumentRenderPage, {
    path: options.filePath,
    pageNumber: options.pageNumber,
    targetWidth: options.renderWidth,
    priority: resolvePdfPreviewPriority(options.pageNumber, options.currentPage),
  })
}

/**
 * Load a preview into the session cache; concurrent callers share one IPC request.
 *
 * Mid-fling: refuse to *start* new work unless `allowWhileBusy` (sharp upgrade).
 * Finished rasters are always cached.
 */
export function ensurePdfPageImage(options: {
  filePath: string
  pageNumber: number
  renderWidth: number
  currentPage: number
  /** Current-page sharp upgrade — do not drop because layout jitter set busy. */
  allowWhileBusy?: boolean
}): Promise<string> {
  const { filePath, pageNumber, renderWidth, allowWhileBusy = false } = options
  const key = pageImageCacheKey(filePath, pageNumber, renderWidth)
  const cached = getCachedPageImage(key)
  if (cached) return Promise.resolve(cached)

  if (!allowWhileBusy && isDocumentScrollBusy()) {
    const error = new Error('PREVIEW_RENDER_DROPPED')
    error.name = 'PreviewRenderDroppedError'
    return Promise.reject(error)
  }

  const inflight = getPageImageInflight(key)
  if (inflight) return inflight

  return rememberPageImageInflight(key, async () => {
    if (!allowWhileBusy && isDocumentScrollBusy()) {
      const error = new Error('PREVIEW_RENDER_DROPPED')
      error.name = 'PreviewRenderDroppedError'
      throw error
    }
    const existing = getCachedPageImage(key)
    if (existing) return existing
    const result = await invokePdfPageRender(options)
    const stillCached = getCachedPageImage(key)
    if (stillCached) return stillCached
    if (!result.ok) {
      const error = new Error(result.error.message)
      if (result.error.code === 'ABORTED') error.name = 'PreviewRenderDroppedError'
      throw error
    }
    const data = TranslationDocumentRenderPageOutputSchema.parse(result.data)
    const objectUrl = await base64ToObjectUrl(data.base64, data.mimeType)
    setCachedPageImage(key, objectUrl)
    return objectUrl
  })
}

/**
 * Sharp upgrade for the focused page. Never wait on the scroll-idle gate —
 * layout/fit micro-scrolls were leaving busy=true until the user scrolled
 * again, so clarity only appeared after a wheel nudge.
 */
export function ensurePdfPageImageWhenIdle(options: {
  filePath: string
  pageNumber: number
  renderWidth: number
  currentPage: number
}): Promise<string> {
  return ensurePdfPageImage({ ...options, allowWhileBusy: true })
}

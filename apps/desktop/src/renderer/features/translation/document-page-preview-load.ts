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
 * Build an object URL from raw IPC bytes (preferred) or legacy base64.
 * Binary path is sync — no chunked `atob` that stalls the renderer during flips.
 */
function previewBytesToObjectUrl(
  bytes: Uint8Array | undefined,
  base64: string | undefined,
  mimeType: string,
): string {
  if (bytes && bytes.byteLength > 0) {
    // Copy into a tight ArrayBuffer so Blob owns stable memory after IPC detach.
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return URL.createObjectURL(new Blob([copy], { type: mimeType }))
  }
  if (!base64) {
    throw new Error('PDF preview payload missing bytes')
  }
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index)
  }
  return URL.createObjectURL(new Blob([out], { type: mimeType }))
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
 * Mid-fling: refuse to *start* new neighbor work unless `allowWhileBusy`.
 * The focused page always proceeds so the landed frame never stays white.
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
  const { filePath, pageNumber, renderWidth, currentPage, allowWhileBusy = false } = options
  const focused = pageNumber === currentPage
  const allow = allowWhileBusy || focused
  const key = pageImageCacheKey(filePath, pageNumber, renderWidth)
  const cached = getCachedPageImage(key)
  if (cached) return Promise.resolve(cached)

  if (!allow && isDocumentScrollBusy()) {
    const error = new Error('PREVIEW_RENDER_DROPPED')
    error.name = 'PreviewRenderDroppedError'
    return Promise.reject(error)
  }

  const inflight = getPageImageInflight(key)
  if (inflight) return inflight

  return rememberPageImageInflight(key, async () => {
    if (!allow && isDocumentScrollBusy()) {
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
    const objectUrl = previewBytesToObjectUrl(data.bytes, data.base64, data.mimeType)
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

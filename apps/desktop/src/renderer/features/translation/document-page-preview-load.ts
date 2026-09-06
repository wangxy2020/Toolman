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
import { resolvePdfPreviewPriority } from './document-page-preview-policy'

function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

export function isPdfPreviewRenderDropped(error: unknown): boolean {
  return (
    (error instanceof Error && error.message === 'PREVIEW_RENDER_DROPPED') ||
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

/** Load a preview into the session cache; concurrent callers share one IPC request. */
export function ensurePdfPageImage(options: {
  filePath: string
  pageNumber: number
  renderWidth: number
  currentPage: number
}): Promise<string> {
  const { filePath, pageNumber, renderWidth } = options
  const key = pageImageCacheKey(filePath, pageNumber, renderWidth)
  const cached = getCachedPageImage(key)
  if (cached) return Promise.resolve(cached)

  const inflight = getPageImageInflight(key)
  if (inflight) return inflight

  return rememberPageImageInflight(key, async () => {
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
    const objectUrl = base64ToObjectUrl(data.base64, data.mimeType)
    setCachedPageImage(key, objectUrl)
    return objectUrl
  })
}

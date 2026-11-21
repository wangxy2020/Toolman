import type { PDFPageProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { getRendererPdfDocument } from './pdf-renderer-document'
import {
  dropRendererPdfPaints,
  enqueueRendererPdfPaint,
  isRendererPdfPaintDropped,
} from './pdf-renderer-paint-queue'
import { resolveRendererPdfPaintScale } from './pdf-renderer-scale'

export { resolveRendererPdfPaintScale }

export async function paintRendererPdfPage(options: {
  filePath: string
  pageNumber: number
  cssWidth: number
  focused: boolean
  canvas: HTMLCanvasElement
  signal: { cancelled: () => boolean }
}): Promise<{ width: number; height: number }> {
  const doc = await getRendererPdfDocument(options.filePath)
  if (options.signal.cancelled()) {
    throw Object.assign(new Error('PDF_PAINT_DROPPED'), { name: 'PdfPaintDroppedError' })
  }

  const page: PDFPageProxy = await doc.getPage(options.pageNumber)
  try {
    if (options.signal.cancelled()) {
      throw Object.assign(new Error('PDF_PAINT_DROPPED'), { name: 'PdfPaintDroppedError' })
    }
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = resolveRendererPdfPaintScale({
      pageWidthPt: baseViewport.width,
      cssWidth: options.cssWidth,
      focused: options.focused,
    })
    const viewport = page.getViewport({ scale })
    const offscreen = document.createElement('canvas')
    offscreen.width = Math.max(1, Math.ceil(viewport.width))
    offscreen.height = Math.max(1, Math.ceil(viewport.height))
    const context = offscreen.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas 2D unavailable')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    let renderTask: RenderTask | null = page.render({
      canvasContext: context,
      viewport,
      canvas: offscreen,
    })
    try {
      await renderTask.promise
    } catch (error) {
      if (options.signal.cancelled()) {
        throw Object.assign(new Error('PDF_PAINT_DROPPED'), { name: 'PdfPaintDroppedError' })
      }
      throw error
    } finally {
      renderTask = null
    }

    if (options.signal.cancelled()) {
      throw Object.assign(new Error('PDF_PAINT_DROPPED'), { name: 'PdfPaintDroppedError' })
    }

    const target = options.canvas
    const targetCtx = target.getContext('2d', { alpha: false })
    if (!targetCtx) throw new Error('Canvas 2D unavailable')
    // Assign size then blit in the same turn so the frame never paints blank.
    target.width = offscreen.width
    target.height = offscreen.height
    targetCtx.drawImage(offscreen, 0, 0)
    return { width: offscreen.width, height: offscreen.height }
  } finally {
    try {
      page.cleanup()
    } catch {
      // best-effort
    }
  }
}

export async function scheduleRendererPdfPagePaint(options: {
  filePath: string
  pageNumber: number
  cssWidth: number
  focused: boolean
  canvas: HTMLCanvasElement
}): Promise<void> {
  if (options.focused) {
    dropRendererPdfPaints(options.filePath, options.pageNumber, 1)
  }
  const key = `${options.filePath}::${options.pageNumber}::${Math.round(options.cssWidth)}::${
    options.focused ? 'f' : 'n'
  }`
  try {
    await enqueueRendererPdfPaint({
      filePath: options.filePath,
      pageNumber: options.pageNumber,
      priority: options.focused ? 3 : 1,
      key,
      run: async (signal) => {
        await paintRendererPdfPage({ ...options, signal })
      },
    })
  } catch (error) {
    if (isRendererPdfPaintDropped(error)) return
    throw error
  }
}

export { isRendererPdfPaintDropped }

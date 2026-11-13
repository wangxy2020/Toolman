import {
  GlobalWorkerOptions,
  PDFDataRangeTransport,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDF_VIEWER_PAGE_BATCH } from './document-page-window'
import { createPdfPaintBuffer } from './document-pdf-paint-buffer'
import {
  PDF_VIEWER_PAINT_CACHE_LIMIT,
  PDF_VIEWER_RANGE_CHUNK_SIZE,
  PDF_VIEWER_RENDER_CONCURRENCY,
  isPdfViewerRenderCancelled,
  parseContentRangeSize,
  pdfViewerPaintCacheKey,
  pdfjsDocumentUrl,
  resolvePdfjsAssetUrl,
  resolvePdfPageViewportScale,
  resolvePdfViewerBackingWidth,
  resolvePdfViewerPaintQuality,
  resolvePdfViewerRenderPriority,
  type PdfViewerPaintQuality,
} from './document-pdf-viewer-scale'

const documents = new Map<string, Promise<PDFDocumentProxy>>()
const failedPaths = new Set<string>()
const canvasTasks = new WeakMap<HTMLCanvasElement, RenderTask>()
type CachedPdfPaint = {
  bitmap: ImageBitmap
  width: number
  height: number
  quality: PdfViewerPaintQuality
}
const paintCache = new Map<string, CachedPdfPaint>()
let workerConfigured = false

function rememberPdfPaint(key: string, entry: CachedPdfPaint): void {
  const previous = paintCache.get(key)
  if (previous && previous.bitmap !== entry.bitmap) previous.bitmap.close()
  paintCache.delete(key)
  paintCache.set(key, entry)
  while (paintCache.size > PDF_VIEWER_PAINT_CACHE_LIMIT) {
    const oldestKey = paintCache.keys().next().value
    if (!oldestKey) break
    const oldest = paintCache.get(oldestKey)
    paintCache.delete(oldestKey)
    oldest?.bitmap.close()
  }
}

export function getCachedPdfPaintQuality(
  filePath: string,
  pageNumber: number,
  cssWidth: number,
): PdfViewerPaintQuality | null {
  return paintCache.get(pdfViewerPaintCacheKey(filePath, pageNumber, cssWidth))?.quality ?? null
}

export function restorePdfPagePaintToCanvas(options: {
  filePath: string
  pageNumber: number
  canvas: HTMLCanvasElement
  cssWidth: number
  minQuality?: PdfViewerPaintQuality
}): PdfViewerPaintQuality | null {
  const cached = paintCache.get(pdfViewerPaintCacheKey(options.filePath, options.pageNumber, options.cssWidth))
  if (!cached) return null
  if (options.minQuality === 'sharp' && cached.quality !== 'sharp') return null
  const { canvas } = options
  canvas.width = cached.width
  canvas.height = cached.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) return null
  context.drawImage(cached.bitmap, 0, 0)
  return cached.quality
}

async function cachePdfPagePaintFromCanvas(
  filePath: string,
  pageNumber: number,
  cssWidth: number,
  canvas: HTMLCanvasElement,
  quality: PdfViewerPaintQuality,
): Promise<void> {
  if (typeof createImageBitmap !== 'function' || cssWidth < 1 || canvas.width < 1) return
  try {
    const bitmap = await createImageBitmap(canvas)
    rememberPdfPaint(pdfViewerPaintCacheKey(filePath, pageNumber, cssWidth), {
      bitmap,
      width: canvas.width,
      height: canvas.height,
      quality,
    })
  } catch {
    // Bitmap cache is best-effort; paint already landed on the canvas.
  }
}

export function clearPdfPaintCache(filePath?: string): void {
  if (!filePath) {
    for (const entry of paintCache.values()) entry.bitmap.close()
    paintCache.clear()
    return
  }
  for (const key of [...paintCache.keys()]) {
    if (!key.startsWith(`${filePath}::`)) continue
    paintCache.get(key)?.bitmap.close()
    paintCache.delete(key)
  }
}

type RenderJob = {
  filePath: string
  pageNumber: number
  canvas: HTMLCanvasElement
  cssWidth: number
  currentPage: number
  allowSharp: boolean
  signal: AbortSignal
  priority: number
  resolve: () => void
  reject: (error: unknown) => void
}

const renderQueue: RenderJob[] = []
let activeRenders = 0

function ensurePdfjsWorker(): void {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = workerSrc
  workerConfigured = true
}

function pdfjsLoadingOptions() {
  return {
    verbosity: 0 as const,
    useSystemFonts: true,
    disableFontFace: false,
    password: '',
    stopAtErrors: false,
    useWorkerFetch: true,
    wasmUrl: resolvePdfjsAssetUrl('wasm'),
    cMapUrl: resolvePdfjsAssetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: resolvePdfjsAssetUrl('standard_fonts'),
    iccUrl: resolvePdfjsAssetUrl('iccs'),
  }
}

class PdfFileRangeTransport extends PDFDataRangeTransport {
  constructor(
    length: number,
    private readonly fileUrl: string,
  ) {
    super(length, new Uint8Array(0), false)
  }

  requestDataRange(begin: number, end: number): void {
    void fetch(this.fileUrl, {
      headers: { Range: `bytes=${begin}-${end - 1}` },
    })
      .then(async (response) => {
        if (!response.ok && response.status !== 206) {
          throw new Error(`PDF range ${response.status}`)
        }
        this.onDataRange(begin, new Uint8Array(await response.arrayBuffer()))
      })
      .catch(() => {
        this.onDataRange(begin, new Uint8Array(0))
      })
  }
}

async function resolvePdfFileSize(fileUrl: string): Promise<number> {
  const head = await fetch(fileUrl, { method: 'HEAD' })
  const fromHead = Number(head.headers.get('content-length'))
  if (head.ok && Number.isFinite(fromHead) && fromHead > 0) return fromHead
  const fromHeadRange = parseContentRangeSize(head.headers.get('content-range'))
  if (fromHeadRange) return fromHeadRange
  const probe = await fetch(fileUrl, { headers: { Range: 'bytes=0-0' } })
  const fromRange = parseContentRangeSize(probe.headers.get('content-range'))
  if (fromRange) return fromRange
  throw new Error('无法读取 PDF')
}

async function loadPdfViewerDocument(filePath: string): Promise<PDFDocumentProxy> {
  ensurePdfjsWorker()
  const fileUrl = pdfjsDocumentUrl(filePath)
  const length = await resolvePdfFileSize(fileUrl)
  const loadingTask = getDocument({
    range: new PdfFileRangeTransport(length, fileUrl),
    disableAutoFetch: true,
    disableStream: true,
    rangeChunkSize: PDF_VIEWER_RANGE_CHUNK_SIZE,
    ...pdfjsLoadingOptions(),
  })
  return loadingTask.promise
}

export function evictPdfViewerDocument(filePath: string): void {
  failedPaths.delete(filePath)
  clearPdfPaintCache(filePath)
  const pending = documents.get(filePath)
  documents.delete(filePath)
  void pending
    ?.then((doc) => {
      void doc.cleanup()
      return doc.loadingTask.destroy()
    })
    .catch(() => undefined)
}

export function evictOtherPdfViewerDocuments(keepPath: string): void {
  for (const filePath of documents.keys()) {
    if (filePath !== keepPath) evictPdfViewerDocument(filePath)
  }
  for (const filePath of failedPaths) {
    if (filePath !== keepPath) failedPaths.delete(filePath)
  }
}

export function getPdfViewerDocument(filePath: string): Promise<PDFDocumentProxy> {
  if (failedPaths.has(filePath)) {
    return Promise.reject(new Error('PDF viewer unavailable'))
  }
  const existing = documents.get(filePath)
  if (existing) return existing
  const pending = loadPdfViewerDocument(filePath).catch((error) => {
    if (documents.get(filePath) === pending) documents.delete(filePath)
    failedPaths.add(filePath)
    throw error
  })
  documents.set(filePath, pending)
  return pending
}

export async function getPdfViewerDocumentInfo(filePath: string): Promise<{
  numPages: number
  pageWidth: number
  pageHeight: number
}> {
  const doc = await getPdfViewerDocument(filePath)
  const numPages = doc.numPages
  if (numPages < 1) return { numPages: 0, pageWidth: 0, pageHeight: 0 }
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  return { numPages, pageWidth: viewport.width, pageHeight: viewport.height }
}

export async function prefetchPdfViewerPageRange(
  filePath: string,
  startPage: number,
  endPage: number,
): Promise<void> {
  const doc = await getPdfViewerDocument(filePath)
  const last = Math.min(doc.numPages, endPage)
  for (let pageNumber = Math.max(1, startPage); pageNumber <= last; pageNumber += 1) {
    await doc.getPage(pageNumber)
  }
}

export function prefetchPdfViewerPageBatch(filePath: string, currentPage: number, totalPages: number): void {
  // Warm only a tight window around the viewport — full batch prefetch on every
  // page tick competed with paints and made scanned PDFs feel sticky.
  const warmStart = Math.max(1, currentPage - 1)
  const warmEnd = Math.min(totalPages, currentPage + 2)
  void prefetchPdfViewerPageRange(filePath, warmStart, warmEnd).catch(() => undefined)
}

function yieldPdfPaintToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0)
      })
      return
    }
    setTimeout(resolve, 0)
  })
}

async function paintPdfPage(job: RenderJob): Promise<void> {
  const { filePath, pageNumber, canvas, cssWidth, currentPage, allowSharp, signal } = job
  if (cssWidth < 1 || signal.aborted) return
  // Let pending scroll/wheel handlers run before PDF.js work freezes the main thread.
  await yieldPdfPaintToMain()
  if (signal.aborted) return
  canvasTasks.get(canvas)?.cancel()
  const doc = await getPdfViewerDocument(filePath)
  if (signal.aborted) return
  await yieldPdfPaintToMain()
  if (signal.aborted) return
  const page = await doc.getPage(pageNumber)
  if (signal.aborted) return
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const quality = resolvePdfViewerPaintQuality(pageNumber, currentPage, { allowSharp })
  const backingWidth = resolvePdfViewerBackingWidth(cssWidth, dpr, quality)
  const unscaled = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({
    scale: resolvePdfPageViewportScale(unscaled.width, backingWidth),
  })
  // Paint off-DOM / OffscreenCanvas, then blit — keeps the previous frame visible
  // and avoids in-DOM canvas font metrics thrashing the document style.
  const buffer = createPdfPaintBuffer(viewport.width, viewport.height)
  const task = page.render({
    canvas: buffer.canvas as HTMLCanvasElement,
    canvasContext: buffer.context as CanvasRenderingContext2D,
    viewport,
  })
  canvasTasks.set(canvas, task)
  const onAbort = () => task.cancel()
  signal.addEventListener('abort', onAbort)
  try {
    await task.promise
    if (signal.aborted) return
    await yieldPdfPaintToMain()
    if (signal.aborted) return
    buffer.blitTo(canvas)
    // Cache from the visible canvas on idle — createImageBitmap on the paint
    // buffer used to stall scroll while "正在加载文档预览" was on screen.
    const scheduleCache =
      typeof requestIdleCallback === 'function'
        ? (fn: () => void) => requestIdleCallback(() => fn(), { timeout: 900 })
        : (fn: () => void) => setTimeout(fn, 0)
    scheduleCache(() => {
      if (signal.aborted) return
      void cachePdfPagePaintFromCanvas(filePath, pageNumber, cssWidth, canvas, quality)
    })
  } catch (error) {
    if (isPdfViewerRenderCancelled(error) || signal.aborted) return
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (canvasTasks.get(canvas) === task) canvasTasks.delete(canvas)
    buffer.dispose()
  }
}

function pumpPdfRenderQueue(): void {
  while (activeRenders < PDF_VIEWER_RENDER_CONCURRENCY && renderQueue.length > 0) {
    renderQueue.sort((left, right) => left.priority - right.priority || left.pageNumber - right.pageNumber)
    const job = renderQueue.shift()
    if (!job || job.signal.aborted) continue
    activeRenders += 1
    void paintPdfPage(job)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeRenders -= 1
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => pumpPdfRenderQueue())
          return
        }
        pumpPdfRenderQueue()
      })
  }
}

export function schedulePdfPageRender(options: {
  filePath: string
  pageNumber: number
  canvas: HTMLCanvasElement
  cssWidth: number
  currentPage: number
  allowSharp?: boolean
  signal: AbortSignal
}): Promise<void> {
  const { signal } = options
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const job: RenderJob = {
      filePath: options.filePath,
      pageNumber: options.pageNumber,
      canvas: options.canvas,
      cssWidth: options.cssWidth,
      currentPage: options.currentPage,
      allowSharp: options.allowSharp !== false,
      signal,
      priority: resolvePdfViewerRenderPriority(options.pageNumber, options.currentPage),
      resolve,
      reject,
    }
    const existing = renderQueue.findIndex((item) => item.canvas === options.canvas)
    if (existing >= 0) {
      renderQueue.splice(existing, 1)[0]?.resolve()
    }
    renderQueue.push(job)
    const onAbort = () => {
      const index = renderQueue.indexOf(job)
      if (index >= 0) {
        renderQueue.splice(index, 1)
        resolve()
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    pumpPdfRenderQueue()
  })
}

export async function renderPdfPageToCanvas(options: {
  filePath: string
  pageNumber: number
  canvas: HTMLCanvasElement
  cssWidth: number
  currentPage?: number
  allowSharp?: boolean
  signal?: AbortSignal
}): Promise<void> {
  const signal = options.signal ?? new AbortController().signal
  await schedulePdfPageRender({
    filePath: options.filePath,
    pageNumber: options.pageNumber,
    canvas: options.canvas,
    cssWidth: options.cssWidth,
    currentPage: options.currentPage ?? options.pageNumber,
    allowSharp: options.allowSharp,
    signal,
  })
}

export { PDF_VIEWER_PAGE_BATCH }

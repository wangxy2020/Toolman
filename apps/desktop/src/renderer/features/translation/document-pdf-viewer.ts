import {
  GlobalWorkerOptions,
  PDFDataRangeTransport,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDF_VIEWER_PAGE_BATCH, resolvePdfViewerPageBatch } from './document-page-window'
import {
  PDF_VIEWER_RENDER_CONCURRENCY,
  isPdfViewerRenderCancelled,
  parseContentRangeSize,
  pdfjsDocumentUrl,
  resolvePdfjsAssetUrl,
  resolvePdfPageViewportScale,
  resolvePdfViewerBackingWidth,
  resolvePdfViewerRenderPriority,
} from './document-pdf-viewer-scale'

const documents = new Map<string, Promise<PDFDocumentProxy>>()
const failedPaths = new Set<string>()
const canvasTasks = new WeakMap<HTMLCanvasElement, RenderTask>()
let workerConfigured = false

type RenderJob = {
  filePath: string
  pageNumber: number
  canvas: HTMLCanvasElement
  cssWidth: number
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
    rangeChunkSize: 65_536,
    ...pdfjsLoadingOptions(),
  })
  return loadingTask.promise
}

export function evictPdfViewerDocument(filePath: string): void {
  failedPaths.delete(filePath)
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
  const current = resolvePdfViewerPageBatch(currentPage, totalPages)
  void prefetchPdfViewerPageRange(filePath, current.startPage, current.endPage).catch(() => undefined)
  if (currentPage < current.endPage - 1) return
  const nextStart = current.endPage + 1
  if (nextStart > totalPages) return
  const next = resolvePdfViewerPageBatch(nextStart, totalPages)
  void prefetchPdfViewerPageRange(filePath, next.startPage, next.endPage).catch(() => undefined)
}

async function paintPdfPage(job: RenderJob): Promise<void> {
  const { filePath, pageNumber, canvas, cssWidth, signal } = job
  if (cssWidth < 1 || signal.aborted) return
  canvasTasks.get(canvas)?.cancel()
  const doc = await getPdfViewerDocument(filePath)
  if (signal.aborted) return
  const page = await doc.getPage(pageNumber)
  if (signal.aborted) return
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const backingWidth = resolvePdfViewerBackingWidth(cssWidth, dpr)
  const unscaled = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({
    scale: resolvePdfPageViewportScale(unscaled.width, backingWidth),
  })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas is unavailable')
  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
  })
  canvasTasks.set(canvas, task)
  const onAbort = () => task.cancel()
  signal.addEventListener('abort', onAbort)
  try {
    await task.promise
  } catch (error) {
    if (isPdfViewerRenderCancelled(error) || signal.aborted) return
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (canvasTasks.get(canvas) === task) canvasTasks.delete(canvas)
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
  signal?: AbortSignal
}): Promise<void> {
  const signal = options.signal ?? new AbortController().signal
  await schedulePdfPageRender({
    filePath: options.filePath,
    pageNumber: options.pageNumber,
    canvas: options.canvas,
    cssWidth: options.cssWidth,
    currentPage: options.currentPage ?? options.pageNumber,
    signal,
  })
}

export { PDF_VIEWER_PAGE_BATCH }

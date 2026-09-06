import { readFileSync, statSync } from 'node:fs'
import { coalesceInflight } from './inflight-coalesce.js'
import { loadPdfjsDocument } from './pdfjs-options.js'
import { previewJpegCache } from './preview-jpeg-cache.js'
import { createPreviewRenderQueue, PDF_PREVIEW_RETAIN_PAGES, previewPriorityValue } from './preview-render-queue.js'
import { whitenRenderedPageCanvas } from './pdf-left-margin-whiten.js'

export interface RenderedPdfPage {
  pageNumber: number
  png: Buffer
  mimeType: 'image/png' | 'image/jpeg'
}

export type PdfRenderPurpose = 'ocr' | 'vision' | 'preview'

const DEFAULT_RENDER_SCALE = 2
const OCR_RENDER_SCALE = 2.5
const VISION_RENDER_SCALE = 2.5

function resolveRenderScale(purpose: PdfRenderPurpose, scale?: number): number {
  if (scale !== undefined) return scale
  if (purpose === 'ocr') return OCR_RENDER_SCALE
  if (purpose === 'vision') return VISION_RENDER_SCALE
  return DEFAULT_RENDER_SCALE
}

export async function renderPdfPagesToPng(
  filePath: string,
  maxPages = 40,
  scale?: number,
  purpose: PdfRenderPurpose = 'preview',
): Promise<{ totalPages: number; pages: RenderedPdfPage[] }> {
  const buffer = readFileSync(filePath)
  const document = await loadPdfjsDocument(buffer)
  const totalPages = document.numPages
  const pageCount = Math.min(totalPages, maxPages)
  const renderScale = resolveRenderScale(purpose, scale)
  const { createCanvas } = await import('@napi-rs/canvas')
  const pages: RenderedPdfPage[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    // glm-ocr rejects oversized images; keep OCR pages within ~1800px on the long side.
    const baseViewport = page.getViewport({ scale: 1 })
    const ocrMaxDim = 1800
    const scale =
      purpose === 'ocr'
        ? Math.min(renderScale, ocrMaxDim / Math.max(baseViewport.width, baseViewport.height, 1))
        : renderScale
    const viewport = page.getViewport({ scale })
    let canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport, canvas }).promise

    if (purpose === 'ocr') {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const { data } = imageData
      for (let index = 0; index < data.length; index += 4) {
        const gray = 0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]!
        const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128))
        data[index] = enhanced
        data[index + 1] = enhanced
        data[index + 2] = enhanced
      }
      context.putImageData(imageData, 0, 0)
      whitenRenderedPageCanvas(canvas)

      const longSide = Math.max(canvas.width, canvas.height)
      if (longSide > ocrMaxDim) {
        const resizeScale = ocrMaxDim / longSide
        const width = Math.max(1, Math.round(canvas.width * resizeScale))
        const height = Math.max(1, Math.round(canvas.height * resizeScale))
        const resized = createCanvas(width, height)
        resized.getContext('2d').drawImage(canvas, 0, 0, width, height)
        canvas = resized
      }
    }

    const usePng = purpose === 'ocr' || purpose === 'vision' || renderScale >= 2
    pages.push({
      pageNumber,
      png: usePng ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 90),
      mimeType: usePng ? 'image/png' : 'image/jpeg',
    })
  }

  return { totalPages, pages }
}

/** Render one PDF page for OCR (uses document cache; keeps long side ≤ 1800px). */
export async function renderPdfPageForOcr(
  filePath: string,
  pageNumber: number,
): Promise<{ totalPages: number; page: RenderedPdfPage }> {
  const document = await getCachedPdfDocument(filePath)
  const totalPages = document.numPages
  if (totalPages < 1) {
    throw new Error('PDF has no pages')
  }

  const safePage = Math.max(1, Math.min(Math.floor(pageNumber), totalPages))
  const page = await document.getPage(safePage)
  const renderScale = resolveRenderScale('ocr')
  const ocrMaxDim = 1800
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(
    renderScale,
    ocrMaxDim / Math.max(baseViewport.width, baseViewport.height, 1),
  )
  const viewport = page.getViewport({ scale })
  const { createCanvas } = await import('@napi-rs/canvas')
  let canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext('2d')
  await page.render({ canvasContext: context, viewport, canvas }).promise

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  for (let index = 0; index < data.length; index += 4) {
    const gray = 0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]!
    const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128))
    data[index] = enhanced
    data[index + 1] = enhanced
    data[index + 2] = enhanced
  }
  context.putImageData(imageData, 0, 0)
  whitenRenderedPageCanvas(canvas)

  const longSide = Math.max(canvas.width, canvas.height)
  if (longSide > ocrMaxDim) {
    const resizeScale = ocrMaxDim / longSide
    const width = Math.max(1, Math.round(canvas.width * resizeScale))
    const height = Math.max(1, Math.round(canvas.height * resizeScale))
    const resized = createCanvas(width, height)
    resized.getContext('2d').drawImage(canvas, 0, 0, width, height)
    canvas = resized
  }

  return {
    totalPages,
    page: {
      pageNumber: safePage,
      png: canvas.toBuffer('image/png'),
      mimeType: 'image/png',
    },
  }
}

type CachedPdfDocument = {
  document: Awaited<ReturnType<typeof loadPdfjsDocument>>
  mtimeMs: number
  lastUsed: number
}

const pdfDocumentCache = new Map<string, CachedPdfDocument>()
const pdfDocumentLoads = new Map<string, Promise<CachedPdfDocument['document']>>()
const PDF_DOC_CACHE_LIMIT = 2

async function destroyPdfDocument(document: CachedPdfDocument['document'] | undefined) {
  const destroy = (document as { destroy?: () => Promise<void> } | undefined)?.destroy
  if (!destroy || !document) return
  try {
    await destroy.call(document)
  } catch {
    // ignore destroy errors
  }
}

export async function getCachedPdfDocument(filePath: string) {
  const mtimeMs = statSync(filePath).mtimeMs
  const cached = pdfDocumentCache.get(filePath)
  if (cached && cached.mtimeMs === mtimeMs) {
    cached.lastUsed = Date.now()
    return cached.document
  }

  const loadKey = `${filePath}@${mtimeMs}`
  return coalesceInflight(pdfDocumentLoads, loadKey, async () => {
    const latest = pdfDocumentCache.get(filePath)
    if (latest && latest.mtimeMs === mtimeMs) {
      latest.lastUsed = Date.now()
      return latest.document
    }

    const buffer = readFileSync(filePath)
    const document = await loadPdfjsDocument(buffer)
    const previous = pdfDocumentCache.get(filePath)
    pdfDocumentCache.set(filePath, { document, mtimeMs, lastUsed: Date.now() })
    if (previous && previous.document !== document) {
      void destroyPdfDocument(previous.document)
    }

    while (pdfDocumentCache.size > PDF_DOC_CACHE_LIMIT) {
      let oldestKey: string | null = null
      let oldestUsed = Number.POSITIVE_INFINITY
      for (const [key, value] of pdfDocumentCache) {
        if (key === filePath) continue
        if (value.lastUsed < oldestUsed) {
          oldestUsed = value.lastUsed
          oldestKey = key
        }
      }
      if (!oldestKey) break
      const evicted = pdfDocumentCache.get(oldestKey)
      pdfDocumentCache.delete(oldestKey)
      await destroyPdfDocument(evicted?.document)
    }

    return document
  })
}

const previewRenderQueue = createPreviewRenderQueue()

/** Serialize pdf.js page access so metadata cannot stall a visible preview raster. */
export function enqueuePdfDocumentTask<T>(task: () => Promise<T>, priority = 0): Promise<T> {
  return previewRenderQueue.enqueue(task, priority)
}

const PDF_PREVIEW_MAX_RENDER_WIDTH = 2400
const PDF_PREVIEW_JPEG_QUALITY = 96

function previewTargetWidth(targetWidth: number): number {
  return Math.max(200, Math.min(PDF_PREVIEW_MAX_RENDER_WIDTH, Math.round(targetWidth)))
}

/** Render a single PDF page for side-by-side document translation preview. */
export async function renderPdfPagePreview(
  filePath: string,
  pageNumber: number,
  targetWidth: number,
  options?: { priority?: 'visible' | 'prefetch' },
): Promise<{
  totalPages: number
  pageNumber: number
  png: Buffer
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}> {
  const requestedPage = Math.max(1, Math.floor(pageNumber) || 1)
  const width = previewTargetWidth(targetWidth)
  const mtimeMs = statSync(filePath).mtimeMs
  const cached = previewJpegCache.get(previewJpegCache.key(filePath, mtimeMs, requestedPage, width))
  if (cached) {
    return {
      totalPages: cached.totalPages,
      pageNumber: requestedPage,
      png: cached.jpeg,
      mimeType: cached.mimeType,
      width: cached.width,
      height: cached.height,
    }
  }

  const cacheKey = previewJpegCache.key(filePath, mtimeMs, requestedPage, width)
  const isVisible = options?.priority !== 'prefetch'

  return previewRenderQueue.enqueue(
    async () => {
    const queued = previewJpegCache.get(previewJpegCache.key(filePath, mtimeMs, requestedPage, width))
    if (queued) {
      return {
        totalPages: queued.totalPages,
        pageNumber: requestedPage,
        png: queued.jpeg,
        mimeType: queued.mimeType,
        width: queued.width,
        height: queued.height,
      }
    }

    const document = await getCachedPdfDocument(filePath)
    const totalPages = document.numPages
    if (totalPages < 1) {
      throw new Error('PDF has no pages')
    }

    const safePage = Math.max(1, Math.min(requestedPage, totalPages))
    const safeCached = previewJpegCache.get(previewJpegCache.key(filePath, mtimeMs, safePage, width))
    if (safeCached) {
      return {
        totalPages: safeCached.totalPages,
        pageNumber: safePage,
        png: safeCached.jpeg,
        mimeType: safeCached.mimeType,
        width: safeCached.width,
        height: safeCached.height,
      }
    }

    const page = await document.getPage(safePage)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.max(0.6, width / Math.max(1, baseViewport.width))
    const viewport = page.getViewport({ scale })
    const { createCanvas } = await import('@napi-rs/canvas')
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = false
    await page.render({ canvasContext: context, viewport, canvas }).promise

    const jpeg = canvas.toBuffer('image/jpeg', PDF_PREVIEW_JPEG_QUALITY)
    const entry = {
      jpeg,
      mimeType: 'image/jpeg' as const,
      width: canvas.width,
      height: canvas.height,
      totalPages,
    }
    previewJpegCache.set(previewJpegCache.key(filePath, mtimeMs, safePage, width), entry)
    if (safePage !== requestedPage) {
      previewJpegCache.set(previewJpegCache.key(filePath, mtimeMs, requestedPage, width), entry)
    }
    return {
      totalPages,
      pageNumber: safePage,
      png: jpeg,
      mimeType: 'image/jpeg' as const,
      width: canvas.width,
      height: canvas.height,
    }
    },
    {
      priority: previewPriorityValue(options?.priority),
      key: cacheKey,
      group: filePath,
      page: requestedPage,
      retainAround: isVisible ? PDF_PREVIEW_RETAIN_PAGES : undefined,
    },
  )
}

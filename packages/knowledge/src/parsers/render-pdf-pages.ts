import { readFileSync, statSync } from 'node:fs'
import { loadPdfjsDocument } from './pdfjs-options.js'

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
    const viewport = page.getViewport({ scale: renderScale })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
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

type CachedPdfDocument = {
  document: Awaited<ReturnType<typeof loadPdfjsDocument>>
  mtimeMs: number
  lastUsed: number
}

const pdfDocumentCache = new Map<string, CachedPdfDocument>()
const PDF_DOC_CACHE_LIMIT = 2

export async function getCachedPdfDocument(filePath: string) {
  const mtimeMs = statSync(filePath).mtimeMs
  const cached = pdfDocumentCache.get(filePath)
  if (cached && cached.mtimeMs === mtimeMs) {
    cached.lastUsed = Date.now()
    return cached.document
  }

  const buffer = readFileSync(filePath)
  const document = await loadPdfjsDocument(buffer)
  pdfDocumentCache.set(filePath, { document, mtimeMs, lastUsed: Date.now() })

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
    const destroy = (evicted?.document as { destroy?: () => Promise<void> } | undefined)?.destroy
    if (destroy) {
      try {
        await destroy.call(evicted!.document)
      } catch {
        // ignore destroy errors
      }
    }
  }

  return document
}

/** Serialize preview renders so the Electron main process stays responsive. */
let previewRenderChain: Promise<unknown> = Promise.resolve()

function enqueuePreviewRender<T>(task: () => Promise<T>): Promise<T> {
  const run = previewRenderChain.then(task, task)
  previewRenderChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Render a single PDF page for side-by-side document translation preview. */
export async function renderPdfPagePreview(
  filePath: string,
  pageNumber: number,
  targetWidth: number,
): Promise<{
  totalPages: number
  pageNumber: number
  png: Buffer
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}> {
  return enqueuePreviewRender(async () => {
    const document = await getCachedPdfDocument(filePath)
    const totalPages = document.numPages
    if (totalPages < 1) {
      throw new Error('PDF has no pages')
    }

    const safePage = Math.max(1, Math.min(Math.floor(pageNumber), totalPages))
    const page = await document.getPage(safePage)
    const baseViewport = page.getViewport({ scale: 1 })
    // targetWidth is already in device pixels (CSS width × DPR).
    const width = Math.max(240, Math.min(1600, targetWidth))
    const scale = Math.min(2.75, Math.max(1.25, width / baseViewport.width))
    const viewport = page.getViewport({ scale })
    const { createCanvas } = await import('@napi-rs/canvas')
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = true
    await page.render({ canvasContext: context, viewport, canvas }).promise

    // JPEG is much faster to encode/transfer than PNG for preview pages.
    const jpeg = canvas.toBuffer('image/jpeg', 82)
    return {
      totalPages,
      pageNumber: safePage,
      png: jpeg,
      mimeType: 'image/jpeg' as const,
      width: canvas.width,
      height: canvas.height,
    }
  })
}

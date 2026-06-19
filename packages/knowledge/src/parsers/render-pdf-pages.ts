import { readFileSync } from 'node:fs'
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

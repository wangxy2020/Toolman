import { readFileSync } from 'node:fs'
import pdfParse from 'pdf-parse'
import { loadPdfjsDocument } from './pdfjs-options.js'
import { formatPdfPageMarker } from './pdf-page-markers.js'
import { isPdfExtractedTextInsufficient } from './pdf-text-quality.js'
import { getCachedPdfDocument, renderPdfPageForOcr } from './render-pdf-pages.js'

type PdfTextItem = { str?: string; transform?: number[] }

export interface PdfPageText {
  pageNumber: number
  text: string
  markdown?: string
}

export interface OcrPageRecognizer {
  (input: {
    png: Buffer
    pageNumber: number
    totalPages: number
    mimeType?: string
  }): Promise<string>
}

export interface PdfExtractOptions {
  preferPdfJs?: boolean
  /** strict：文本不足时走 OCR；lenient：有任意提取文本则直接用于聊天附件；prefer-extracted：知识库优先使用已提取文本 */
  textQuality?: 'strict' | 'lenient' | 'prefer-extracted'
  ocr?: {
    recognizePage: OcrPageRecognizer
    maxPages?: number
    /** currentPage = completed pages; inProgress=true means page currentPage+1 is running. */
    onProgress?: (currentPage: number, totalPages: number, inProgress?: boolean) => void
  }
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractWithPdfParse(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const parsed = await pdfParse(buffer, { max: 0 })
  return {
    text: normalizePdfText(parsed.text ?? ''),
    pageCount: parsed.numpages ?? 1,
  }
}

function extractPageTextWithLayout(items: PdfTextItem[]): string {
  const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = []

  for (const item of items) {
    const text = typeof item.str === 'string' ? item.str : ''
    if (!text) continue
    const x = item.transform?.[4] ?? 0
    const y = Math.round((item.transform?.[5] ?? 0) * 2) / 2
    let line = lines.find((entry) => Math.abs(entry.y - y) < 2)
    if (!line) {
      line = { y, parts: [] }
      lines.push(line)
    }
    line.parts.push({ x, text })
  }

  lines.sort((left, right) => right.y - left.y)
  return lines
    .map((line) => {
      line.parts.sort((left, right) => left.x - right.x)
      return line.parts.map((part) => part.text).join('')
    })
    .join('\n')
}

async function extractWithPdfJs(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const document = await loadPdfjsDocument(buffer)
  const parts: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = extractPageTextWithLayout(content.items as PdfTextItem[])
    const normalized = normalizePdfText(pageText)
    if (normalized) {
      parts.push(`${formatPdfPageMarker(pageNumber, document.numPages)}\n${normalized}`)
    }
  }

  return {
    text: parts.join('\n\n').trim(),
    pageCount: document.numPages,
  }
}

/** PDF page count and page-1 dimensions (points), without text extraction or OCR. */
export async function extractPdfDocumentInfo(filePath: string): Promise<{
  totalPages: number
  pageWidth: number
  pageHeight: number
}> {
  const document = await getCachedPdfDocument(filePath)
  const totalPages = document.numPages
  if (totalPages < 1) {
    return { totalPages: 0, pageWidth: 0, pageHeight: 0 }
  }

  const firstPage = await document.getPage(1)
  const viewport = firstPage.getViewport({ scale: 1 })
  return {
    totalPages,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
  }
}

/** Extract plain text for an inclusive 1-based page range. */
export async function extractPdfPageTexts(
  filePath: string,
  startPage: number,
  endPage: number,
  options?: {
    ocr?: {
      recognizePage: OcrPageRecognizer
    }
  },
): Promise<{
  totalPages: number
  pages: PdfPageText[]
  /** PDF-point size of page 1 (used to match FitH layout). */
  pageWidth: number
  pageHeight: number
}> {
  const document = await getCachedPdfDocument(filePath)
  const totalPages = document.numPages
  if (totalPages < 1) {
    return { totalPages: 0, pages: [], pageWidth: 0, pageHeight: 0 }
  }

  const firstPage = await document.getPage(1)
  const viewport = firstPage.getViewport({ scale: 1 })
  const pageWidth = viewport.width
  const pageHeight = viewport.height

  const from = Math.max(1, Math.min(Math.floor(startPage), totalPages))
  const to = Math.max(from, Math.min(Math.floor(endPage), totalPages))
  const pages: PdfPageText[] = []

  for (let pageNumber = from; pageNumber <= to; pageNumber += 1) {
    const page = pageNumber === 1 ? firstPage : await document.getPage(pageNumber)
    const content = await page.getTextContent()
    let text = normalizePdfText(extractPageTextWithLayout(content.items as PdfTextItem[]))

    if (
      options?.ocr?.recognizePage &&
      isPdfExtractedTextInsufficient(text, 1)
    ) {
      const { page: rendered } = await renderPdfPageForOcr(filePath, pageNumber)
      text = normalizePdfText(
        await options.ocr.recognizePage({
          png: rendered.png,
          mimeType: rendered.mimeType,
          pageNumber: rendered.pageNumber,
          totalPages,
        }),
      )
    }

    pages.push({ pageNumber, text })
  }

  return { totalPages, pages, pageWidth, pageHeight }
}

async function extractWithVisionOcr(
  filePath: string,
  ocr: NonNullable<PdfExtractOptions['ocr']>,
): Promise<string> {
  // Page-by-page: render → OCR → report progress (avoids long silent "render all pages" phase).
  const document = await getCachedPdfDocument(filePath)
  const totalPages = document.numPages
  const pageCount = Math.min(totalPages, ocr.maxPages ?? 40)
  if (pageCount < 1) {
    throw new Error('PDF has no pages')
  }

  const parts: string[] = []
  ocr.onProgress?.(0, pageCount)

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    // Signal "working on page N" before the slow render/OCR so UI leaves 20%.
    ocr.onProgress?.(pageNumber - 1, pageCount, true)

    const { page } = await renderPdfPageForOcr(filePath, pageNumber)
    const text = normalizePdfText(
      await ocr.recognizePage({
        png: page.png,
        mimeType: page.mimeType,
        pageNumber: page.pageNumber,
        totalPages: pageCount,
      }),
    )
    if (text) {
      parts.push(`${formatPdfPageMarker(pageNumber, pageCount)}\n${text}`)
    }
    ocr.onProgress?.(pageNumber, pageCount, false)
  }

  const combined = parts.join('\n\n').trim()
  if (!combined) {
    throw new Error('OCR 未从 PDF 页面中识别到文字内容')
  }

  if (totalPages > pageCount) {
    return `${combined}\n\n[已 OCR 前 ${pageCount}/${totalPages} 页，其余页面未处理]`
  }

  return combined
}

export async function extractPdfPlainText(
  filePath: string,
  options?: boolean | PdfExtractOptions,
): Promise<string> {
  const resolvedOptions: PdfExtractOptions =
    typeof options === 'boolean' ? { preferPdfJs: options } : (options ?? {})
  const buffer = readFileSync(filePath)

  const attempts = resolvedOptions.preferPdfJs
    ? [extractWithPdfJs, extractWithPdfParse]
    : [extractWithPdfParse, extractWithPdfJs]

  let bestText = ''
  let bestPageCount = 1
  for (const attempt of attempts) {
    try {
      const result = await attempt(buffer)
      if (result.text.length > bestText.length) {
        bestText = result.text
        bestPageCount = Math.max(1, result.pageCount)
      }
      if (
        result.text &&
        !isPdfExtractedTextInsufficient(result.text, result.pageCount)
      ) {
        return result.text
      }
    } catch {
      // try next extractor
    }
  }

  if (resolvedOptions.textQuality === 'lenient' && bestText.trim()) {
    return bestText
  }

  // Only skip OCR when extracted text is both long enough and quality-sufficient.
  // Scanned PDFs often have empty or garbage text layers — those must go through OCR.
  if (
    resolvedOptions.textQuality === 'prefer-extracted' &&
    bestText.trim().length >= 500 &&
    !isPdfExtractedTextInsufficient(bestText, bestPageCount)
  ) {
    return bestText
  }

  if (resolvedOptions.ocr) {
    try {
      return await extractWithVisionOcr(filePath, resolvedOptions.ocr)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'OCR 处理失败'
      throw new Error(`PDF 扫描件识别失败：${detail}`)
    }
  }

  throw new Error(
    'PDF 未提取到文本内容。若为扫描件，请在「设置」中开启「文档 OCR 识别」，安装 glm-ocr:latest，并在知识库「文档处理」中选择 Ollama。',
  )
}

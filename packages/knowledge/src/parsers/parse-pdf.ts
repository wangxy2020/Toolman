import { readFileSync } from 'node:fs'
import pdfParse from 'pdf-parse'
import { loadPdfjsDocument } from './pdfjs-options.js'
import { isPdfExtractedTextInsufficient } from './pdf-text-quality.js'
import { getCachedPdfDocument, renderPdfPagesToPng } from './render-pdf-pages.js'

type PdfTextItem = { str?: string; transform?: number[] }

export interface PdfPageText {
  pageNumber: number
  text: string
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
    onProgress?: (currentPage: number, totalPages: number) => void
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
    if (normalized) parts.push(normalized)
  }

  return {
    text: parts.join('\n\n').trim(),
    pageCount: document.numPages,
  }
}

/** Extract plain text for an inclusive 1-based page range. */
export async function extractPdfPageTexts(
  filePath: string,
  startPage: number,
  endPage: number,
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
    const text = normalizePdfText(extractPageTextWithLayout(content.items as PdfTextItem[]))
    pages.push({ pageNumber, text })
  }

  return { totalPages, pages, pageWidth, pageHeight }
}

async function extractWithVisionOcr(
  filePath: string,
  ocr: NonNullable<PdfExtractOptions['ocr']>,
): Promise<string> {
  const { totalPages, pages } = await renderPdfPagesToPng(
    filePath,
    ocr.maxPages ?? 40,
    undefined,
    'ocr',
  )
  const parts: string[] = []

  for (const page of pages) {
    const text = normalizePdfText(
      await ocr.recognizePage({
        png: page.png,
        mimeType: page.mimeType,
        pageNumber: page.pageNumber,
        totalPages,
      }),
    )
    if (text) parts.push(text)
    ocr.onProgress?.(page.pageNumber, totalPages)
  }

  const combined = parts.join('\n\n').trim()
  if (!combined) {
    throw new Error('OCR 未从 PDF 页面中识别到文字内容')
  }

  if (totalPages > pages.length) {
    return `${combined}\n\n[已 OCR 前 ${pages.length}/${totalPages} 页，其余页面未处理]`
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
  for (const attempt of attempts) {
    try {
      const result = await attempt(buffer)
      if (result.text.length > bestText.length) {
        bestText = result.text
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

  if (
    resolvedOptions.textQuality === 'prefer-extracted' &&
    bestText.trim().length >= 500
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
    'PDF 未提取到文本内容。若为扫描件，请在「设置」中开启「文档 OCR 识别」，并确保已配置支持视觉的模型（如 Ollama 视觉模型）。',
  )
}

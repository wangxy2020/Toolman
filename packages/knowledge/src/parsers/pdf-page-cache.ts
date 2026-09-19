import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPdfPageTextUsable } from './pdf-page-quality.js'

export const PDF_PAGE_PARSER_ID = 'odl-page-pipeline'
/** Bump when page quality gates or OCR routing change enough to invalidate cached pages. */
export const PDF_PAGE_PARSER_VERSION = '4'

export type CachedPdfPageEngine = 'native' | 'hybrid' | 'glm-ocr'

export interface CachedPdfPage {
  documentId?: string
  contentHash: string
  pageNumber: number
  parser: string
  parserVersion: string
  ocrEngine: CachedPdfPageEngine | null
  ocrStatus: 'ok' | 'failed' | 'deferred'
  qualityScore: string
  parsedText: string
  markdown?: string
  updatedAt: number
}

function pageFilePath(parsedDir: string, contentHash: string, pageNumber: number): string {
  return join(parsedDir, contentHash, `p${pageNumber}.json`)
}

export function cachedPdfPageDir(parsedDir: string, contentHash: string): string {
  return join(parsedDir, contentHash)
}

export function readCachedPdfPage(
  parsedDir: string,
  contentHash: string,
  pageNumber: number,
): CachedPdfPage | null {
  const filePath = pageFilePath(parsedDir, contentHash, pageNumber)
  if (!existsSync(filePath)) return null
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as CachedPdfPage
    if (parsed.contentHash !== contentHash || parsed.pageNumber !== pageNumber) return null
    if (parsed.parserVersion !== PDF_PAGE_PARSER_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function writeCachedPdfPage(parsedDir: string, page: CachedPdfPage): void {
  const dir = cachedPdfPageDir(parsedDir, page.contentHash)
  mkdirSync(dir, { recursive: true })
  writeFileSync(pageFilePath(parsedDir, page.contentHash, page.pageNumber), JSON.stringify(page), 'utf8')
}

export function cacheUsablePdfPage(options: {
  parsedDir: string
  contentHash: string
  pageNumber: number
  text: string
  markdown?: string
  engine: CachedPdfPageEngine | null
  qualityScore: string
  documentId?: string
}): void {
  if (!isPdfPageTextUsable(options.text)) return
  writeCachedPdfPage(options.parsedDir, {
    documentId: options.documentId,
    contentHash: options.contentHash,
    pageNumber: options.pageNumber,
    parser: PDF_PAGE_PARSER_ID,
    parserVersion: PDF_PAGE_PARSER_VERSION,
    ocrEngine: options.engine,
    ocrStatus: 'ok',
    qualityScore: options.qualityScore,
    parsedText: options.text,
    markdown: options.markdown || options.text,
    updatedAt: Date.now(),
  })
}

/** Reuse pages from a previous parse of the same file bytes + parser version. */
export function loadUsableCachedPdfPages(
  parsedDir: string,
  contentHash: string,
): Map<number, CachedPdfPage> {
  const kept = new Map<number, CachedPdfPage>()
  const dir = cachedPdfPageDir(parsedDir, contentHash)
  if (!existsSync(dir)) return kept
  for (const name of readdirSync(dir)) {
    const match = /^p(\d+)\.json$/.exec(name)
    if (!match) continue
    const page = readCachedPdfPage(parsedDir, contentHash, Number(match[1]))
    if (!page || page.ocrStatus !== 'ok' || !isPdfPageTextUsable(page.parsedText)) continue
    kept.set(page.pageNumber, page)
  }
  return kept
}
